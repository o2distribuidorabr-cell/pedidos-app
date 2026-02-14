"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PortalShell from "@/app/components/PortalShell";

import { PageHeader, Card, Button, Badge, Input } from "@/app/components/ui";

type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string | null;
  unit_cost: number | null; // preço efetivo (override ou base)
  base_price?: number | null;
  override_price?: number | null;
};

type CartItem = {
  product_id: string;
  sku: string;
  name: string;
  unit: string;
  unit_cost: number;
  qty: number;
};

type StoreRow = { id: string; name: string; freight_fee: number };
type PriceOverrideRow = { product_id: string; unit_price: number | null };

const STEP_BY_SKU: Record<string, number> = {
  "110129": 120,
  "110132": 216,
  "110133": 20,
  "190": 1,
  "110243": 50,
  "110399": 800,
  "110152": 2250,
  "110147": 150,
  "110278": 25,
  "110255": 1000,
  "110280": 3.5,
  "110225": 0.397,
  "110276": 48,
  "110150": 1000,
  "194": 60,
  "193": 60,
};

function getStep(sku: string) {
  return STEP_BY_SKU[sku] ?? 1;
}

function roundToStep(value: number, step: number) {
  if (step <= 0) return value;
  const k = Math.round(value / step);
  return k * step;
}

function money(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PedidoPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string>("");

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, CartItem>>({});

  const [deliveryMode, setDeliveryMode] = useState<"RETIRADA" | "FRETE">("RETIRADA");
  const [freightFee, setFreightFee] = useState<number>(0);
  const [storeName, setStoreName] = useState<string>("-");
  const [storeId, setStoreId] = useState<string | null>(null);

  const itemsTotal = useMemo(() => {
    return Object.values(cart).reduce((acc, it) => acc + it.qty * it.unit_cost, 0);
  }, [cart]);

  const freightApplied = useMemo(() => (deliveryMode === "FRETE" ? freightFee : 0), [deliveryMode, freightFee]);

  const grandTotal = useMemo(() => itemsTotal + freightApplied, [itemsTotal, freightApplied]);

  const hasItems = useMemo(() => Object.keys(cart).length > 0, [cart]);

  useEffect(() => {
    (async () => {
      setMsg("");
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        router.push("/login");
        return;
      }

      // 1) store_id do profile
      const { data: profile, error: pErr } = await supabase.from("profiles").select("store_id").eq("id", auth.user.id).maybeSingle();

      if (pErr) {
        setLoading(false);
        setMsg(pErr.message);
        return;
      }

      const sId = (profile?.store_id as string | null) ?? null;
      setStoreId(sId);

      if (!sId) {
        setLoading(false);
        setMsg("Seu usuário não está vinculado a nenhuma loja (profiles.store_id).");
        return;
      }

      // 2) frete padrão da loja
      const { data: store, error: sErr } = await supabase.from("stores").select("id,name,freight_fee").eq("id", sId).maybeSingle();

      if (sErr || !store) {
        setLoading(false);
        setMsg(sErr?.message || "Loja não encontrada.");
        return;
      }

      const st = store as StoreRow;
      setStoreName(st.name ?? "-");
      setFreightFee(Number(st.freight_fee ?? 0) || 0);

      // 3) produtos (preço padrão)
      const { data: prodData, error: prodErr } = await supabase
        .from("products")
        .select("id, sku, name, unit, unit_price, active")
        .eq("active", true)
        .order("name", { ascending: true });

      if (prodErr) {
        setLoading(false);
        setMsg(prodErr.message);
        return;
      }

      // 4) overrides da loja (preço por loja)
      const { data: ovData, error: ovErr } = await supabase.from("store_product_prices").select("product_id, unit_price").eq("store_id", sId);

      if (ovErr) {
        setLoading(false);
        setMsg(ovErr.message);
        return;
      }

      const ovMap: Record<string, number> = {};
      (ovData as PriceOverrideRow[] | null)?.forEach((r) => {
        if (!r?.product_id) return;
        const v = Number(r.unit_price ?? 0);
        if (Number.isFinite(v) && v > 0) ovMap[String(r.product_id)] = v;
      });

      // 5) merge preço efetivo
      const merged: Product[] = (prodData ?? []).map((p: any) => {
        const base = Number(p.unit_price ?? 0) || 0;
        const ov = ovMap[p.id];
        const effective = ov != null ? ov : base;

        return {
          id: String(p.id),
          sku: String(p.sku ?? ""),
          name: String(p.name ?? ""),
          unit: (p.unit ?? "un") as string,
          unit_cost: Number(effective) || 0,
          base_price: base,
          override_price: ov ?? null,
        };
      });

      setProducts(merged);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setQty(prod: Product, qtyRaw: number) {
    const unit = (prod.unit ?? "un").toString();
    const unit_cost = Number(prod.unit_cost ?? 0) || 0;

    const step = getStep(prod.sku);
    const qty = Math.max(0, roundToStep(qtyRaw, step));

    setCart((prev) => {
      const next = { ...prev };
      if (qty === 0) {
        delete next[prod.id];
        return next;
      }
      next[prod.id] = {
        product_id: prod.id,
        sku: prod.sku,
        name: prod.name,
        unit,
        unit_cost,
        qty,
      };
      return next;
    });
  }

  function inc(prod: Product) {
    const step = getStep(prod.sku);
    const current = cart[prod.id]?.qty ?? 0;
    setQty(prod, current + step);
  }

  function dec(prod: Product) {
    const step = getStep(prod.sku);
    const current = cart[prod.id]?.qty ?? 0;
    setQty(prod, current - step);
  }

  function onContinue() {
    const items = Object.values(cart);
    localStorage.setItem("cart_items", JSON.stringify(items));

    localStorage.setItem(
      "delivery_info",
      JSON.stringify({
        delivery_mode: deliveryMode,
        freight_fee: deliveryMode === "FRETE" ? freightFee : 0,
        store_name: storeName,
      })
    );

    router.push("/pedido/confirmar");
  }

  return (
    <PortalShell title="Novo pedido" subtitle={storeName && storeName !== "-" ? `Loja: ${storeName}` : "Selecione as quantidades"}>
      <div className="space-y-4">
        <PageHeader
          title="Novo pedido"
          subtitle={
            storeName && storeName !== "-"
              ? `Selecione as quantidades. Loja: ${storeName}`
              : "Selecione as quantidades. Algumas quantidades são travadas por caixa/lote."
          }
          right={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => router.push("/pedidos")}>
                Histórico
              </Button>
              <Button onClick={onContinue} disabled={!hasItems}>
                Continuar ({money(grandTotal)})
              </Button>
            </div>
          }
        />

        {msg ? (
          <Card title="Erro">
            <div className="text-sm text-red-600 whitespace-pre-wrap">{msg}</div>
          </Card>
        ) : null}

        {loading ? (
          <Card>
            <div className="text-sm text-slate-600">Carregando...</div>
          </Card>
        ) : null}

        {!loading && !msg ? (
          <Card title="Entrega" subtitle="O frete é o valor padrão cadastrado para a sua loja.">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant={deliveryMode === "RETIRADA" ? "primary" : "secondary"} onClick={() => setDeliveryMode("RETIRADA")}>
                Retirada
              </Button>
              <Button variant={deliveryMode === "FRETE" ? "primary" : "secondary"} onClick={() => setDeliveryMode("FRETE")}>
                Frete
              </Button>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-600">Frete aplicado:</span>
                <span className="font-semibold text-slate-900">{money(freightApplied)}</span>
                {deliveryMode === "FRETE" ? <Badge tone="yellow">Frete</Badge> : <Badge tone="neutral">Retirada</Badge>}
              </div>
            </div>

            <div className="mt-2 text-xs text-slate-500">
              Quantidades com <b>passo</b> são travadas por caixa/lote (ex.: 216, 120, etc.).
            </div>
          </Card>
        ) : null}

        {!loading && !msg ? (
          <Card title={`Produtos (${products.length})`} subtitle="Use + / - ou digite a quantidade.">
            {products.length === 0 ? (
              <div className="text-sm text-slate-600">Nenhum produto ativo.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0">
                  <thead>
                    <tr className="text-left text-xs text-slate-600">
                      <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">SKU</th>
                      <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">Nome</th>
                      <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">Unid.</th>
                      <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-right">Preço</th>
                      <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">Quantidade</th>
                      <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>

                  <tbody>
                    {products.map((p) => {
                      const unit = (p.unit ?? "un").toString();
                      const unit_cost = Number(p.unit_cost ?? 0) || 0;
                      const qty = cart[p.id]?.qty ?? 0;
                      const step = getStep(p.sku);
                      const lineTotal = qty * unit_cost;

                      return (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3">
                            <div className="font-mono text-xs text-slate-600">{p.sku}</div>
                          </td>

                          <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3">
                            <div className="text-sm font-semibold text-slate-900">{p.name}</div>
                            <div className="mt-1 text-xs text-slate-500">{p.id}</div>
                          </td>

                          <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-sm text-slate-700">{unit}</td>

                          <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-right text-sm text-slate-900">
                            {money(unit_cost)}
                          </td>

                          <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Button variant="secondary" onClick={() => dec(p)} disabled={qty <= 0}>
                                -
                              </Button>

                              <input
                                className="w-[140px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                                type="number"
                                value={qty}
                                step={step}
                                min={0}
                                onChange={(e) => setQty(p, Number(e.target.value))}
                              />

                              <Button variant="secondary" onClick={() => inc(p)}>
                                +
                              </Button>
                            </div>

                            <div className="mt-1 text-xs text-slate-500">
                              passo: <b>{step}</b> {unit}
                            </div>
                          </td>

                          <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-right font-semibold text-slate-900">
                            {money(lineTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-slate-50 p-4 text-right">
                <div className="text-xs font-semibold text-slate-600">Itens</div>
                <div className="text-base font-semibold text-slate-900">{money(itemsTotal)}</div>

                <div className="mt-3 text-xs font-semibold text-slate-600">
                  Frete ({deliveryMode === "FRETE" ? "Frete" : "Retirada"})
                </div>
                <div className="text-base font-semibold text-slate-900">{money(freightApplied)}</div>

                <div className="my-3 h-px bg-slate-200" />

                <div className="text-xs font-semibold text-slate-600">Total do pedido</div>
                <div className="text-2xl font-semibold text-slate-900">{money(grandTotal)}</div>

                <div className="mt-3 flex justify-end">
                  <Button onClick={onContinue} disabled={!hasItems}>
                    Continuar
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </PortalShell>
  );
}