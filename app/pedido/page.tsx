"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PortalShell from "@/app/components/PortalShell";

import { PageHeader, Card, Button, Badge } from "@/app/components/ui";

type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string | null;
  unit_cost: number | null;
  base_price?: number | null;
  override_price?: number | null;

  ncm?: string | null;
  cest?: string | null;
  cfop?: string | null;
  ean?: string | null;
  origin?: string | null;
  icms_cst?: string | null;
  pis_cst?: string | null;
  cofins_cst?: string | null;
};

type CartItem = {
  product_id: string;
  sku: string;
  name: string;
  unit: string;
  unit_cost: number;
  qty: number;

  ncm?: string | null;
  cest?: string | null;
  cfop?: string | null;
  ean?: string | null;
  origin?: string | null;
  icms_cst?: string | null;
  pis_cst?: string | null;
  cofins_cst?: string | null;
};

type StoreRow = { id: string; name: string; freight_fee: number };
type PriceOverrideRow = { product_id: string; unit_price: number | null };

// ✅ NOVO: títulos vencidos (para bloquear)
type OverdueOrderRow = {
  id: string;
  due_date: string | null;
  is_paid: boolean | null;
  created_at: string | null;
};

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

function ymdToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtYMDToBR(ymd: string | null | undefined) {
  if (!ymd) return "-";
  try {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    return dt.toLocaleDateString("pt-BR");
  } catch {
    return String(ymd);
  }
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

  // ✅ NOVO: bloqueio por vencidos
  const [overdueLoading, setOverdueLoading] = useState(false);
  const [overdues, setOverdues] = useState<OverdueOrderRow[]>([]);
  const hasOverdue = overdues.length > 0;

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
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("id", auth.user.id)
        .maybeSingle();

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

      // ✅ NOVO: checar títulos vencidos ANTES de carregar produtos (UX rápido)
      await loadOverdues(sId);

      // 2) frete padrão da loja
      const { data: store, error: sErr } = await supabase
        .from("stores")
        .select("id,name,freight_fee")
        .eq("id", sId)
        .maybeSingle();

      if (sErr || !store) {
        setLoading(false);
        setMsg(sErr?.message || "Loja não encontrada.");
        return;
      }

      const st = store as StoreRow;
      setStoreName(st.name ?? "-");
      setFreightFee(Number(st.freight_fee ?? 0) || 0);

      // 3) produtos (preço padrão)
      const selectOld = "id, sku, name, unit, unit_price, active";
      const selectNew =
        "id, sku, name, unit, unit_price, active, ncm, cest, cfop, ean, origin, icms_cst, pis_cst, cofins_cst";

      const prodTry = await supabase
        .from("products")
        .select(selectNew)
        .eq("active", true)
        .order("name", { ascending: true });

      let prodData: any[] | null = null;

      if (prodTry.error) {
        const prodFallback = await supabase
          .from("products")
          .select(selectOld)
          .eq("active", true)
          .order("name", { ascending: true });

        if (prodFallback.error) {
          setLoading(false);
          setMsg(prodFallback.error.message);
          return;
        }
        prodData = (prodFallback.data ?? []).map((p: any) => ({
          ...p,
          ncm: null,
          cest: null,
          cfop: null,
          ean: null,
          origin: null,
          icms_cst: null,
          pis_cst: null,
          cofins_cst: null,
        }));
      } else {
        prodData = prodTry.data ?? [];
      }

      // 4) overrides da loja (preço por loja)
      const { data: ovData, error: ovErr } = await supabase
        .from("store_product_prices")
        .select("product_id, unit_price")
        .eq("store_id", sId);

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

          ncm: (p.ncm ?? null) as any,
          cest: (p.cest ?? null) as any,
          cfop: (p.cfop ?? null) as any,
          ean: (p.ean ?? null) as any,
          origin: (p.origin ?? null) as any,
          icms_cst: (p.icms_cst ?? null) as any,
          pis_cst: (p.pis_cst ?? null) as any,
          cofins_cst: (p.cofins_cst ?? null) as any,
        };
      });

      setProducts(merged);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ NOVO: carregar pedidos vencidos da loja
  async function loadOverdues(sId: string) {
    setOverdueLoading(true);
    try {
      const today = ymdToday();

      const { data, error } = await supabase
        .from("orders")
        .select("id,due_date,is_paid,created_at")
        .eq("store_id", sId)
        .or("is_paid.is.null,is_paid.eq.false")
        .not("due_date", "is", null)
        .lt("due_date", today)
        .order("due_date", { ascending: true })
        .limit(10);

      if (error) {
        console.warn("loadOverdues:", error.message);
        setOverdues([]);
        return;
      }

      setOverdues((data ?? []) as OverdueOrderRow[]);
    } finally {
      setOverdueLoading(false);
    }
  }

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

        ncm: prod.ncm ?? null,
        cest: prod.cest ?? null,
        cfop: prod.cfop ?? null,
        ean: prod.ean ?? null,
        origin: prod.origin ?? null,
        icms_cst: prod.icms_cst ?? null,
        pis_cst: prod.pis_cst ?? null,
        cofins_cst: prod.cofins_cst ?? null,
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

  const continueBlocked = hasOverdue || !hasItems;

  return (
    <PortalShell
      title="Novo pedido"
      subtitle={storeName && storeName !== "-" ? `Loja: ${storeName}` : "Selecione as quantidades"}
    >
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

              {/* ✅ BLOQUEIO */}
              <Button onClick={onContinue} disabled={continueBlocked}>
                {hasOverdue ? "Bloqueado por vencidos" : `Continuar (${money(grandTotal)})`}
              </Button>
            </div>
          }
        />

        {/* ✅ NOVO: aviso de bloqueio */}
        {!loading && storeId && (overdueLoading || hasOverdue) ? (
          <Card
            title="Atenção: existem títulos vencidos"
            subtitle="Para criar novos pedidos, regularize os títulos vencidos no Financeiro."
            right={
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => router.push("/financeiro")}>
                  Ir para Financeiro
                </Button>
                <Button variant="secondary" onClick={() => loadOverdues(storeId)} disabled={overdueLoading}>
                  {overdueLoading ? "Verificando..." : "Atualizar vencidos"}
                </Button>
              </div>
            }
          >
            {overdueLoading ? (
              <div className="text-sm text-slate-600">Carregando títulos vencidos...</div>
            ) : overdues.length === 0 ? (
              <div className="text-sm text-slate-600">Nenhum título vencido encontrado.</div>
            ) : (
              <div className="space-y-2">
                <div className="text-sm text-slate-700">
                  Você tem <b>{overdues.length}</b> pedido(s) vencido(s). O botão de continuar fica bloqueado até regularizar.
                </div>

                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  {overdues.map((o) => (
                    <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-slate-100 first:border-t-0">
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-slate-600 truncate">{o.id}</div>
                        <div className="text-sm text-slate-800">
                          Vencimento: <b>{fmtYMDToBR(o.due_date)}</b> <Badge tone="red">Vencido</Badge>
                        </div>
                      </div>
                      <Button variant="secondary" onClick={() => router.push("/financeiro")}>
                        Ver no Financeiro
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ) : null}

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
              <Button
                variant={deliveryMode === "RETIRADA" ? "primary" : "secondary"}
                onClick={() => setDeliveryMode("RETIRADA")}
                disabled={hasOverdue}
              >
                Retirada
              </Button>
              <Button
                variant={deliveryMode === "FRETE" ? "primary" : "secondary"}
                onClick={() => setDeliveryMode("FRETE")}
                disabled={hasOverdue}
              >
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

            {hasOverdue ? (
              <div className="mt-3 text-sm text-red-700">
                Você possui títulos vencidos. Regularize no <b>Financeiro</b> para continuar.
              </div>
            ) : null}
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
                        <tr key={p.id} className={`hover:bg-slate-50 ${hasOverdue ? "opacity-60" : ""}`}>
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
                              <Button variant="secondary" onClick={() => dec(p)} disabled={hasOverdue || qty <= 0}>
                                -
                              </Button>

                              <input
                                className="w-[140px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                                type="number"
                                value={qty}
                                step={step}
                                min={0}
                                disabled={hasOverdue}
                                onChange={(e) => setQty(p, Number(e.target.value))}
                              />

                              <Button variant="secondary" onClick={() => inc(p)} disabled={hasOverdue}>
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
                  <Button onClick={onContinue} disabled={continueBlocked}>
                    {hasOverdue ? "Bloqueado por vencidos" : "Continuar"}
                  </Button>
                </div>

                {hasOverdue ? (
                  <div className="mt-2 text-xs text-red-700">
                    Regularize os títulos vencidos no <b>Financeiro</b> para criar novos pedidos.
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </PortalShell>
  );
}