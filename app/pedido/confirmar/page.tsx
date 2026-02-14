"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import PortalShell from "@/app/components/PortalShell";
import { PageHeader, Card, Button, Badge } from "@/app/components/ui";

type CartItem = {
  product_id: string;
  sku: string;
  name: string;
  unit: string;
  unit_cost: number;
  qty: number;
};

type StoreRow = {
  id: string;
  name: string;
  freight_fee?: number | null;
};

type DeliveryInfo = {
  delivery_mode: "RETIRADA" | "FRETE";
  freight_fee: number;
  store_name?: string;
};

function money(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ConfirmarPedidoPage() {
  const router = useRouter();

  const [items, setItems] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  const [userEmail, setUserEmail] = useState<string>("-");
  const [storeName, setStoreName] = useState<string>("-");
  const [storeId, setStoreId] = useState<string | null>(null);

  // entrega/frete
  const [deliveryMode, setDeliveryMode] = useState<"RETIRADA" | "FRETE">("RETIRADA");
  const [freightFee, setFreightFee] = useState<number>(0); // sempre "frete padrão da loja"
  const [storeFreightFee, setStoreFreightFee] = useState<number>(0); // cache do frete da loja (stores.freight_fee)

  const itemsTotal = useMemo(() => items.reduce((acc, it) => acc + (Number(it.qty) || 0) * (Number(it.unit_cost) || 0), 0), [items]);

  const freightApplied = useMemo(() => (deliveryMode === "FRETE" ? Number(freightFee || 0) : 0), [deliveryMode, freightFee]);

  const grandTotal = useMemo(() => itemsTotal + freightApplied, [itemsTotal, freightApplied]);

  function persistDelivery(mode: "RETIRADA" | "FRETE", fee: number) {
    const payload: DeliveryInfo = {
      delivery_mode: mode,
      freight_fee: mode === "FRETE" ? Number(fee || 0) : 0,
      store_name: storeName,
    };
    localStorage.setItem("delivery_info", JSON.stringify(payload));
  }

  async function applyDeliveryMode(mode: "RETIRADA" | "FRETE") {
    setDeliveryMode(mode);

    // se for frete, garante que o fee é o padrão da loja
    const fee = mode === "FRETE" ? Number(storeFreightFee || 0) : 0;
    setFreightFee(mode === "FRETE" ? fee : 0);
    persistDelivery(mode, fee);
  }

  useEffect(() => {
    (async () => {
      setMsg("");
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;

      if (!user) {
        router.push("/login");
        return;
      }

      setUserEmail(user.email ?? "-");

      // carrinho
      const raw = localStorage.getItem("cart_items");
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      setItems(Array.isArray(parsed) ? (parsed as CartItem[]) : []);

      // store_id do profile
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("id", user.id)
        .maybeSingle();

      if (pErr) {
        setMsg(pErr.message);
        setLoading(false);
        return;
      }

      const sId = (profile?.store_id as string | null) ?? null;
      setStoreId(sId);

      if (!sId) {
        setStoreName("Sem loja vinculada");
        setLoading(false);
        return;
      }

      // nome da loja + frete padrão
      const { data: store, error: sErr } = await supabase
        .from("stores")
        .select("id,name,freight_fee")
        .eq("id", sId)
        .maybeSingle();

      if (sErr) {
        setMsg(sErr.message);
        setLoading(false);
        return;
      }

      const st = (store ?? null) as StoreRow | null;
      const stName = st?.name ?? "Loja não encontrada";
      const stFreight = Number(st?.freight_fee ?? 0) || 0;

      setStoreName(stName);
      setStoreFreightFee(stFreight);

      // delivery_info (mas agora validando com frete da loja)
      const rawDelivery = localStorage.getItem("delivery_info");
      const dParsed = rawDelivery ? (JSON.parse(rawDelivery) as Partial<DeliveryInfo>) : null;

      const dMode =
        dParsed?.delivery_mode === "FRETE" || dParsed?.delivery_mode === "RETIRADA"
          ? dParsed.delivery_mode
          : "RETIRADA";

      // se for FRETE, sempre usar o frete da loja (não confiar em valor antigo salvo)
      const effectiveFee = dMode === "FRETE" ? stFreight : 0;

      setDeliveryMode(dMode);
      setFreightFee(effectiveFee);
      persistDelivery(dMode, stFreight);

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit() {
    setMsg("");

    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;

    if (!user) {
      router.push("/login");
      return;
    }

    if (!storeId) {
      setMsg("Seu usuário não tem loja vinculada (profiles.store_id).");
      return;
    }

    if (items.length === 0) {
      setMsg("Carrinho vazio.");
      return;
    }

    setSending(true);

    const now = new Date().toISOString();
    const status = "submitted";

    const delivery_mode: "RETIRADA" | "FRETE" = deliveryMode;
    const freight_fee = delivery_mode === "FRETE" ? Number(storeFreightFee || 0) : 0;

    // 1) cria pedido
    const { data: orderInserted, error: orderError } = await supabase
      .from("orders")
      .insert({
        store_id: storeId,
        status,
        notes: notes.trim() || null,
        created_by: user.id,
        created_at: now,
        submitted_at: now,
        approved_at: null,

        delivery_mode,
        freight_fee,
      })
      .select("id")
      .single();

    if (orderError || !orderInserted?.id) {
      setSending(false);
      setMsg(orderError?.message || "Erro ao criar pedido.");
      return;
    }

    const order_id = String(orderInserted.id);

    // 2) cria itens
    const rows = items.map((it) => ({
      order_id,
      product_id: it.product_id,
      qty: it.qty,
      unit: it.unit,
      unit_cost: it.unit_cost,
      created_at: now,
    }));

    const { error: itemsError } = await supabase.from("order_items").insert(rows);

    if (itemsError) {
      setSending(false);
      setMsg(itemsError.message);
      return;
    }

    localStorage.removeItem("cart_items");
    localStorage.removeItem("delivery_info");

    setSending(false);
    router.push("/pedidos");
  }

  if (loading) {
    return (
      <PortalShell title="Confirmar pedido" subtitle="Carregando...">
        <Card>
          <div className="text-sm text-slate-600">Carregando...</div>
        </Card>
      </PortalShell>
    );
  }

  return (
    <PortalShell title="Confirmar pedido" subtitle={storeName && storeName !== "-" ? `Loja: ${storeName}` : "Revise antes de enviar"}>
      <div className="space-y-4">
        <PageHeader
          title="Confirmar pedido"
          subtitle={`Usuário: ${userEmail} • Loja: ${storeName}`}
          right={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => router.push("/pedido")} disabled={sending}>
                Voltar
              </Button>
              <Button onClick={onSubmit} disabled={sending || items.length === 0}>
                {sending ? "Enviando..." : `Enviar (${money(grandTotal)})`}
              </Button>
            </div>
          }
        />

        {msg ? (
          <Card title="Erro">
            <div className="text-sm text-red-600 whitespace-pre-wrap">{msg}</div>
          </Card>
        ) : null}

        {items.length === 0 ? (
          <Card>
            <div className="text-sm text-slate-700">
              Seu carrinho está vazio.{" "}
              <button className="font-semibold text-slate-900 underline" onClick={() => router.push("/pedido")}>
                Voltar para novo pedido
              </button>
            </div>
          </Card>
        ) : (
          <>
            {/* Entrega COM EFEITO */}
            <Card title="Entrega" subtitle="Aqui você ainda pode alterar Retirada/Frete antes de enviar.">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant={deliveryMode === "RETIRADA" ? "primary" : "secondary"}
                  onClick={() => applyDeliveryMode("RETIRADA")}
                  disabled={sending}
                >
                  Retirada
                </Button>

                <Button
                  variant={deliveryMode === "FRETE" ? "primary" : "secondary"}
                  onClick={() => applyDeliveryMode("FRETE")}
                  disabled={sending}
                >
                  Frete
                </Button>

                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-600">Frete:</span>
                  <span className="font-semibold text-slate-900">{money(freightApplied)}</span>
                  {deliveryMode === "FRETE" ? <Badge tone="yellow">Frete</Badge> : <Badge tone="neutral">Retirada</Badge>}
                </div>
              </div>

              <div className="mt-2 text-xs text-slate-500">
                O total do pedido inclui o frete somente quando <b>Frete</b> estiver selecionado.
              </div>
            </Card>

            {/* Itens */}
            <Card title={`Itens (${items.length})`}>
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0">
                  <thead>
                    <tr className="text-left text-xs text-slate-600">
                      <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">SKU</th>
                      <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">Nome</th>
                      <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">Unid.</th>
                      <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-right">Preço</th>
                      <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-right">Qtd</th>
                      <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>

                  <tbody>
                    {items.map((it) => {
                      const line = (Number(it.qty) || 0) * (Number(it.unit_cost) || 0);
                      return (
                        <tr key={it.product_id} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3">
                            <div className="font-mono text-xs text-slate-600">{it.sku}</div>
                          </td>
                          <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3">
                            <div className="text-sm font-semibold text-slate-900">{it.name}</div>
                          </td>
                          <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-sm text-slate-700">{it.unit}</td>
                          <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-right text-sm text-slate-900">
                            {money(Number(it.unit_cost || 0))}
                          </td>
                          <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-right font-semibold text-slate-900">
                            {it.qty}
                          </td>
                          <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-right font-semibold text-slate-900">
                            {money(line)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Totais */}
              <div className="mt-4 flex justify-end">
                <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-slate-50 p-4 text-right">
                  <div className="text-xs font-semibold text-slate-600">Itens</div>
                  <div className="text-base font-semibold text-slate-900">{money(itemsTotal)}</div>

                  <div className="mt-3 text-xs font-semibold text-slate-600">Frete</div>
                  <div className="text-base font-semibold text-slate-900">{money(freightApplied)}</div>

                  <div className="my-3 h-px bg-slate-200" />

                  <div className="text-xs font-semibold text-slate-600">Total</div>
                  <div className="text-2xl font-semibold text-slate-900">{money(grandTotal)}</div>
                </div>
              </div>
            </Card>

            {/* Observações */}
            <Card title="Observações" subtitle="Opcional">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: entregar até sexta-feira; substituir item X se faltar..."
                className="min-h-[110px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                disabled={sending}
              />
            </Card>

            <div className="flex flex-wrap gap-2 justify-end">
              <Button variant="secondary" onClick={() => router.push("/pedido")} disabled={sending}>
                ← Voltar
              </Button>
              <Button onClick={onSubmit} disabled={sending}>
                {sending ? "Enviando..." : `Enviar pedido (${money(grandTotal)})`}
              </Button>
            </div>
          </>
        )}
      </div>
    </PortalShell>
  );
}