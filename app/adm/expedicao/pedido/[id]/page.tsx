"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";
import { PageHeader, Card, Badge } from "@/app/components/ui";

type OrderRow = {
  id: string;
  store_id: string | null;
  status: string;
  logistic_status: "RECEBIDO" | "EM_SEPARACAO" | "ENTREGUE" | null;
  delivery_forecast: string | null;
  created_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  notes: string | null;
  delivery_mode: "RETIRADA" | "FRETE" | null;
  freight_fee: number | null;
  is_paid: boolean | null;
  paid_at: string | null;
  payment_method: "PIX" | "CARTAO" | "BOLETO" | null;
  credit_applied: number | null;
  stores?: {
    id: string;
    name: string | null;
    legal_name: string | null;
  } | null;
};

type OrderItemRow = {
  id: string;
  qty: number;
  unit: string | null;
  unit_cost: number | null;
  products?: {
    id?: string | null;
    sku?: string | null;
    name?: string | null;
    unit?: string | null;
  } | null;
};

function fmtDT(v: string | null | undefined) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("pt-BR");
  } catch {
    return v;
  }
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "-";
  try {
    const d = new Date(`${v}T12:00:00`);
    return d.toLocaleDateString("pt-BR");
  } catch {
    return v;
  }
}

function fmtBRL(v: number | null | undefined) {
  return Number(v ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtNumBR(v: number) {
  const rounded = Math.round((v + Number.EPSILON) * 100) / 100;
  const isInt = Math.abs(rounded - Math.round(rounded)) < 1e-9;
  return isInt
    ? String(Math.round(rounded))
    : rounded.toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
}

function statusTone(status: OrderRow["logistic_status"]) {
  if (status === "ENTREGUE") return "green";
  if (status === "EM_SEPARACAO") return "yellow";
  if (status === "RECEBIDO") return "blue";
  return "neutral";
}

function deliveryModeLabel(mode: OrderRow["delivery_mode"]) {
  if (mode === "FRETE") return "Frete";
  if (mode === "RETIRADA") return "Retirada";
  return "-";
}

function paymentLabel(method: OrderRow["payment_method"]) {
  if (method === "PIX") return "PIX";
  if (method === "CARTAO") return "Cartão";
  if (method === "BOLETO") return "Boleto";
  return "-";
}

export default function AdmExpedicaoPedidoPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params?.id;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);

  useEffect(() => {
    (async () => {
      const ok = await requireAdminOrRedirect(router);
      if (!ok) return;
      await loadData();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function loadData() {
    if (!orderId) {
      setMsg("Pedido inválido.");
      return;
    }

    setMsg("");

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select(`
        id,
        store_id,
        status,
        logistic_status,
        delivery_forecast,
        created_at,
        submitted_at,
        approved_at,
        notes,
        delivery_mode,
        freight_fee,
        is_paid,
        paid_at,
        payment_method,
        credit_applied,
        stores:stores (
          id,
          name,
          legal_name
        )
      `)
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !orderData) {
      setMsg(orderError?.message || "Pedido não encontrado.");
      setOrder(null);
      setItems([]);
      return;
    }

    const normalizedOrder: OrderRow = {
      id: orderData.id,
      store_id: orderData.store_id,
      status: orderData.status,
      logistic_status: orderData.logistic_status ?? "RECEBIDO",
      delivery_forecast: orderData.delivery_forecast ?? null,
      created_at: orderData.created_at ?? null,
      submitted_at: orderData.submitted_at ?? null,
      approved_at: orderData.approved_at ?? null,
      notes: orderData.notes ?? null,
      delivery_mode: orderData.delivery_mode ?? null,
      freight_fee: orderData.freight_fee ?? null,
      is_paid: orderData.is_paid ?? null,
      paid_at: orderData.paid_at ?? null,
      payment_method: orderData.payment_method ?? null,
      credit_applied: orderData.credit_applied ?? null,
      stores: Array.isArray(orderData.stores)
        ? orderData.stores[0] ?? null
        : orderData.stores ?? null,
    };

    setOrder(normalizedOrder);

    const { data: itemsData, error: itemsError } = await supabase
      .from("order_items")
      .select(`
        id,
        qty,
        unit,
        unit_cost,
        products:products (
          id,
          sku,
          name,
          unit
        )
      `)
      .eq("order_id", orderId);

    if (itemsError) {
      setMsg(itemsError.message);
      setItems([]);
      return;
    }

    const normalizedItems: OrderItemRow[] = (itemsData ?? []).map((row: any) => ({
      id: row.id,
      qty: Number(row.qty ?? 0),
      unit: row.unit ?? null,
      unit_cost: row.unit_cost ?? null,
      products: Array.isArray(row.products) ? row.products[0] ?? null : row.products ?? null,
    }));

    setItems(normalizedItems);
  }

  const totals = useMemo(() => {
    const lines = items.length;
    const qtyTotal = items.reduce((acc, item) => acc + Number(item.qty ?? 0), 0);
    const valueTotal = items.reduce(
      (acc, item) => acc + Number(item.qty ?? 0) * Number(item.unit_cost ?? 0),
      0
    );
    return { lines, qtyTotal, valueTotal };
  }, [items]);

  if (loading) {
    return <Card>Carregando...</Card>;
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Pedido da expedição"
          subtitle="Somente leitura"
          right={
            <button
              type="button"
              onClick={() => router.push("/adm/expedicao")}
              className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Voltar
            </button>
          }
        />
        <Card>
          <div className="text-sm text-red-600">{msg || "Pedido não encontrado."}</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pedido para separação"
        subtitle="Visão operacional da expedição"
        right={
          <button
            type="button"
            onClick={() => router.push("/adm/expedicao")}
            className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Voltar
          </button>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm text-slate-700 whitespace-pre-wrap">{msg}</div>
        </Card>
      ) : null}

      <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 break-all">
              Pedido {order.id}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {order.stores?.name || "Loja não identificada"}
            </div>
            {order.stores?.legal_name ? (
              <div className="mt-1 text-xs text-slate-500">
                {order.stores.legal_name}
              </div>
            ) : null}
          </div>

          <Badge tone={statusTone(order.logistic_status ?? "RECEBIDO") as any}>
            {order.logistic_status === "EM_SEPARACAO"
              ? "Em separação"
              : order.logistic_status === "ENTREGUE"
              ? "Entregue"
              : "Recebido"}
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-[18px] bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Criado
            </div>
            <div className="mt-1 font-semibold text-slate-900">
              {fmtDT(order.created_at)}
            </div>
          </div>

          <div className="rounded-[18px] bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Aprovado
            </div>
            <div className="mt-1 font-semibold text-slate-900">
              {fmtDT(order.approved_at)}
            </div>
          </div>

          <div className="rounded-[18px] bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Previsão
            </div>
            <div className="mt-1 font-semibold text-slate-900">
              {fmtDate(order.delivery_forecast)}
            </div>
          </div>

          <div className="rounded-[18px] bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tipo entrega
            </div>
            <div className="mt-1 font-semibold text-slate-900">
              {deliveryModeLabel(order.delivery_mode)}
            </div>
          </div>

          <div className="rounded-[18px] bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Pagamento
            </div>
            <div className="mt-1 font-semibold text-slate-900">
              {order.is_paid ? "Pago" : "Pendente"} • {paymentLabel(order.payment_method)}
            </div>
          </div>

          <div className="rounded-[18px] bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Frete
            </div>
            <div className="mt-1 font-semibold text-slate-900">
              {fmtBRL(order.freight_fee)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Linhas</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{totals.lines}</div>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quantidade</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {fmtNumBR(totals.qtyTotal)}
          </div>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Valor</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {fmtBRL(totals.valueTotal)}
          </div>
        </div>
      </div>

      <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Itens para separar</div>

        {items.length === 0 ? (
          <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Nenhum item encontrado neste pedido.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {items.map((item, index) => {
              const unit = item.products?.unit || item.unit || "UN";
              const total = Number(item.qty ?? 0) * Number(item.unit_cost ?? 0);

              return (
                <div
                  key={item.id}
                  className="rounded-[20px] border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Item {index + 1}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {item.products?.name || "Produto sem nome"}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        SKU: {item.products?.sku || "-"}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Separar
                      </div>
                      <div className="mt-1 text-lg font-semibold text-cyan-700">
                        {fmtNumBR(item.qty)} {unit}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-[16px] bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Unidade
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">{unit}</div>
                    </div>

                    <div className="rounded-[16px] bg-white p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Valor total
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {fmtBRL(total)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {order.notes ? (
        <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Observações</div>
          <div className="mt-3 rounded-[18px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-wrap">
            {order.notes}
          </div>
        </div>
      ) : null}
    </div>
  );
}