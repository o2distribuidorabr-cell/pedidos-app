"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import PortalShell from "@/app/components/PortalShell";
import { PageHeader, Card, Badge } from "@/app/components/ui";

type OrderRow = {
  id: string;
  store_id: string | null;
  status: string;
  notes: string | null;

  created_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;

  logistic_status: "RECEBIDO" | "EM_SEPARACAO" | "SAIU_PARA_ENTREGA" | "ENTREGUE" | null;

  is_paid: boolean | null;
  paid_at: string | null;
  payment_method: "PIX" | "CARTAO" | "BOLETO" | null;

  delivery_mode: "RETIRADA" | "FRETE" | null;
  freight_fee: number | null;

  due_date: string | null;
  delivery_forecast: string | null;
  credit_applied: number | null;

  edited_by_admin: boolean | null;
  edited_at: string | null;
  original_items: OriginalItem[] | null;

  delivery_status?:
    | "PENDENTE"
    | "EM_SEPARACAO"
    | "SAIU_PARA_ENTREGA"
    | "ENTREGUE"
    | "OCORRENCIA"
    | null;

  delivered_at: string | null;
  delivery_dispute_deadline: string | null;
  delivery_confirmation_status: string | null;
  delivery_disputed_at: string | null;
  delivery_dispute_reason: string | null;
  delivery_dispute_notes: string | null;
};

type ProductRow = {
  sku: string | null;
  name: string | null;
  unit: string | null;
};

type ItemRow = {
  id: string;
  qty: number;
  unit: string | null;
  unit_cost: number | null;
  product_id: string;
  products: ProductRow | ProductRow[] | null;
};

type OriginalItem = {
  id: string;
  product_id: string;
  qty: number;
  unit: string | null;
  unit_cost: number | null;
  sku: string | null;
  name: string | null;
  product_unit: string | null;
};

function money(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtDT(v: string | null | undefined) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("pt-BR");
  } catch {
    return String(v);
  }
}

function fmtYMD(ymd: string | null | undefined) {
  if (!ymd) return "-";
  try {
    const [y, m, d] = String(ymd).split("-").map(Number);
    if (!y || !m || !d) return String(ymd);
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    return dt.toLocaleDateString("pt-BR");
  } catch {
    return String(ymd);
  }
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isOrderOverdue(order: Pick<OrderRow, "due_date" | "is_paid">) {
  if (!order.due_date) return false;
  if (order.is_paid) return false;
  return order.due_date < todayYMD();
}

function logisticLabel(v: OrderRow["logistic_status"]) {
  if (v === "RECEBIDO") return "Recebido";
  if (v === "EM_SEPARACAO") return "Em separação";
  if (v === "SAIU_PARA_ENTREGA") return "Saiu para entrega";
  if (v === "ENTREGUE") return "Entregue";
  return "—";
}

function deliveryLabel(v: OrderRow["delivery_mode"]) {
  return v === "FRETE" ? "Frete" : "Retirada";
}

function statusTone(status: string): "green" | "red" | "yellow" | "neutral" {
  const s = (status || "").toLowerCase();
  if (s === "approved") return "green";
  if (s === "rejected") return "red";
  if (s === "submitted") return "yellow";
  return "neutral";
}

function logisticTone(
  v: OrderRow["logistic_status"]
): "green" | "yellow" | "blue" | "neutral" {
  if (v === "ENTREGUE") return "green";
  if (v === "SAIU_PARA_ENTREGA") return "blue";
  if (v === "EM_SEPARACAO") return "yellow";
  return "neutral";
}

function forecastTone(
  forecast: string | null,
  logistic: OrderRow["logistic_status"]
): "green" | "red" | "neutral" {
  if (!forecast) return "neutral";
  if (logistic === "ENTREGUE") return "green";
  return forecast < todayYMD() ? "red" : "green";
}

function deliveryTrackingTone(
  status: OrderRow["delivery_status"]
): "green" | "red" | "yellow" | "blue" | "neutral" {
  if (status === "ENTREGUE") return "green";
  if (status === "SAIU_PARA_ENTREGA") return "blue";
  if (status === "EM_SEPARACAO") return "yellow";
  if (status === "OCORRENCIA") return "red";
  return "neutral";
}

function deliveryTrackingLabel(status: OrderRow["delivery_status"]) {
  if (status === "PENDENTE") return "Pendente";
  if (status === "EM_SEPARACAO") return "Em separação";
  if (status === "SAIU_PARA_ENTREGA") return "Saiu para entrega";
  if (status === "ENTREGUE") return "Entregue";
  if (status === "OCORRENCIA") return "Ocorrência";
  return "Sem acompanhamento";
}

function getProduct(p: ItemRow["products"]): ProductRow | null {
  if (!p) return null;
  if (Array.isArray(p)) return p[0] ?? null;
  return p;
}

function PrimaryActionButton({
  children,
  onClick,
  disabled,
  fullWidth,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-12 items-center justify-center rounded-[18px] bg-cyan-600 px-5 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(8,145,178,0.26)] transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50",
        fullWidth ? "w-full" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SecondaryActionButton({
  children,
  onClick,
  disabled,
  fullWidth,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-12 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
        fullWidth ? "w-full" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm md:rounded-[24px]">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:text-xs">
        {title}
      </div>
      <div className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-900 md:text-2xl">
        {value}
      </div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

function MobileItemCard({ item }: { item: ItemRow }) {
  const prod = getProduct(item.products);
  const sku = prod?.sku ?? "-";
  const name = prod?.name ?? "-";
  const unit = prod?.unit ?? item.unit ?? "-";
  const unitCost = Number(item.unit_cost ?? 0) || 0;
  const qty = Number(item.qty ?? 0) || 0;
  const line = qty * unitCost;

  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 break-words">{name}</div>
          <div className="mt-1 font-mono text-[11px] text-slate-500">{sku}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Total</div>
          <div className="text-sm font-semibold text-slate-900">{money(line)}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Unid.</div>
          <div className="mt-1 font-semibold text-slate-900">{unit}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Qtd</div>
          <div className="mt-1 font-semibold text-slate-900">{qty}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Preço</div>
          <div className="mt-1 font-semibold text-slate-900">{money(unitCost)}</div>
        </div>
      </div>
    </div>
  );
}

function MobileOriginalItemCard({ item }: { item: OriginalItem }) {
  const sku = item.sku ?? "-";
  const name = item.name ?? "-";
  const unit = item.product_unit ?? item.unit ?? "-";
  const unitCost = Number(item.unit_cost ?? 0) || 0;
  const qty = Number(item.qty ?? 0) || 0;
  const line = qty * unitCost;

  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 break-words">{name}</div>
          <div className="mt-1 font-mono text-[11px] text-slate-500">{sku}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Total</div>
          <div className="text-sm font-semibold text-slate-900">{money(line)}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Unid.</div>
          <div className="mt-1 font-semibold text-slate-900">{unit}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Qtd</div>
          <div className="mt-1 font-semibold text-slate-900">{qty}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Preço</div>
          <div className="mt-1 font-semibold text-slate-900">{money(unitCost)}</div>
        </div>
      </div>
    </div>
  );
}

const DISPUTE_REASONS = [
  "Não recebi o pedido",
  "Produto faltando",
  "Produto errado",
  "Quantidade divergente",
  "Produto avariado",
  "Outro motivo",
];

// ──────────────────────────────────────────────────────────────────────────────
// Banner: pedido aguardando pagamento com cartão de crédito
// Busca a invoiceUrl salva em order_payments e exibe link para concluir.
// ──────────────────────────────────────────────────────────────────────────────
function AwaitingPaymentBanner({ orderId }: { orderId: string }) {
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("order_payments")
        .select("invoice_url")
        .eq("order_id", orderId)
        .eq("gateway", "ASAAS")
        .eq("billing_type", "CREDIT_CARD")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setInvoiceUrl((data as any)?.invoice_url ?? null);
      setLoadingUrl(false);
    })();
  }, [orderId]);

  return (
    <div className="rounded-[24px] border border-amber-300 bg-amber-50 p-4 shadow-sm md:rounded-[30px] md:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-amber-900">
            💳 Pagamento pendente
          </div>
          <div className="mt-1 text-sm text-amber-800">
            Este pedido aguarda a confirmação do pagamento com cartão de crédito.
            Após o pagamento ser aprovado pela Asaas, o pedido será enviado
            automaticamente para a franqueadora.
          </div>
        </div>

        {!loadingUrl ? (
          invoiceUrl ? (
            <a
              href={invoiceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-[16px] bg-amber-500 px-5 text-sm font-semibold text-white shadow-md transition hover:bg-amber-600"
            >
              Concluir pagamento
            </a>
          ) : (
            <div className="shrink-0 rounded-[14px] border border-amber-200 bg-amber-100 px-4 py-2 text-xs text-amber-700">
              Link de pagamento não encontrado. Entre em contato com o suporte.
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

export default function PedidoDetalhePage() {
  const router = useRouter();
  const params = useParams();

  const rawId = (params as any)?.id as string | string[] | undefined;
  const orderId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState("");

  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeNotes, setDisputeNotes] = useState("");
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [disputeError, setDisputeError] = useState("");

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [originalItems, setOriginalItems] = useState<OriginalItem[] | null>(null);
  const [focusDoc, setFocusDoc] = useState<{ reference: string | null; status: string | null; numero: string | null; serie: string | null } | null>(null);

  const totalItens = useMemo(() => {
    return items.reduce((acc, it) => {
      const unitCost = Number(it.unit_cost ?? 0);
      return acc + (Number(it.qty ?? 0) || 0) * unitCost;
    }, 0);
  }, [items]);

  const frete = useMemo(() => {
    if (!order) return 0;
    if (order.delivery_mode !== "FRETE") return 0;
    return Number(order.freight_fee ?? 0) || 0;
  }, [order]);

  const totalComFrete = useMemo(() => totalItens + frete, [totalItens, frete]);

  const edited = useMemo(() => !!order?.edited_by_admin, [order?.edited_by_admin]);

  const overdue = useMemo(() => {
    if (!order) return false;
    return isOrderOverdue(order);
  }, [order]);

  const forecastOverdue = useMemo(() => {
    if (!order?.delivery_forecast) return false;
    if ((order.logistic_status ?? null) === "ENTREGUE") return false;
    return order.delivery_forecast < todayYMD();
  }, [order?.delivery_forecast, order?.logistic_status]);

  const creditApplied = useMemo(
    () => Number(order?.credit_applied ?? 0) || 0,
    [order?.credit_applied]
  );

  const totalLiquido = useMemo(() => {
    return Math.max(totalComFrete - creditApplied, 0);
  }, [totalComFrete, creditApplied]);

  const originalTotal = useMemo(() => {
    if (!originalItems || originalItems.length === 0) return 0;
    return originalItems.reduce((acc, it) => {
      const unitCost = Number(it.unit_cost ?? 0);
      return acc + (Number(it.qty ?? 0) || 0) * unitCost;
    }, 0);
  }, [originalItems]);

  const canTrackDelivery = useMemo(() => {
    if (!order) return false;
    return (
      order.logistic_status === "EM_SEPARACAO" ||
      order.logistic_status === "SAIU_PARA_ENTREGA" ||
      order.logistic_status === "ENTREGUE"
    );
  }, [order]);

  // Status efetivo da contestação — calcula automaticamente confirmação após prazo
  const effectiveConfirmationStatus = useMemo(() => {
    if (!order) return null;
    if (order.delivery_confirmation_status === "AGUARDANDO_CONTESTACAO") {
      const deadline = order.delivery_dispute_deadline
        ? new Date(order.delivery_dispute_deadline)
        : null;
      if (deadline && deadline < new Date()) {
        return "CONFIRMADA_AUTOMATICAMENTE";
      }
    }
    return order.delivery_confirmation_status ?? null;
  }, [order]);

  const canDispute = useMemo(() => {
    if (!order) return false;
    if (order.logistic_status !== "ENTREGUE") return false;
    if (effectiveConfirmationStatus !== "AGUARDANDO_CONTESTACAO") return false;
    return true;
  }, [order, effectiveConfirmationStatus]);

  const disputeDeadlineLabel = useMemo(() => {
    if (!order?.delivery_dispute_deadline) return null;
    try {
      return new Date(order.delivery_dispute_deadline).toLocaleString("pt-BR");
    } catch {
      return null;
    }
  }, [order?.delivery_dispute_deadline]);

  useEffect(() => {
    (async () => {
      setMsg("");
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        router.push("/login");
        return;
      }

      if (!orderId) {
        setMsg("Pedido inválido.");
        setOrder(null);
        setItems([]);
        setOriginalItems(null);
        setLoading(false);
        return;
      }

      await loadAll(orderId);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function loadAll(id: string) {
    setMsg("");

    const { data: o, error: oErr } = await supabase
      .from("orders")
      .select(
        "id,store_id,status,notes,created_at,submitted_at,approved_at,logistic_status,is_paid,paid_at,payment_method,delivery_mode,freight_fee,due_date,delivery_forecast,credit_applied,edited_by_admin,edited_at,original_items,delivery_status,delivered_at,delivery_dispute_deadline,delivery_confirmation_status,delivery_disputed_at,delivery_dispute_reason,delivery_dispute_notes"
      )
      .eq("id", id)
      .maybeSingle();

    if (oErr || !o) {
      setMsg(oErr?.message || "Pedido não encontrado.");
      setOrder(null);
      setItems([]);
      setOriginalItems(null);
      return;
    }

    const ord = o as OrderRow;
    setOrder(ord);
    setOriginalItems((ord.original_items ?? null) as any);

    const { data: it, error: itErr } = await supabase
      .from("order_items")
      .select("id,qty,unit,unit_cost,product_id, products:products (sku,name,unit)")
      .eq("order_id", id);

    if (itErr) {
      setMsg(itErr.message);
      setItems([]);
      return;
    }

    const safe = (it ?? []) as unknown as ItemRow[];
    setItems(safe);

    // Busca NF-e emitida para este pedido
    const { data: focusData } = await supabase
      .from("focus_nfe_documents")
      .select("reference,status,numero,serie")
      .eq("order_id", id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setFocusDoc(focusData ?? null);
  }

  async function refresh() {
    if (!orderId) return;
    setWorking(true);
    await loadAll(orderId);
    setWorking(false);
  }

  async function handleContestar() {
    if (!disputeReason) {
      setDisputeError("Selecione o motivo da contestação.");
      return;
    }
    setDisputeSubmitting(true);
    setDisputeError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`/api/logistica/order/${orderId}/contestar-entrega`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reason: disputeReason, notes: disputeNotes }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setDisputeError(data.message || "Erro ao registrar contestação.");
        return;
      }
      setDisputeModalOpen(false);
      setDisputeReason("");
      setDisputeNotes("");
      await refresh();
    } catch {
      setDisputeError("Erro ao registrar contestação. Tente novamente.");
    } finally {
      setDisputeSubmitting(false);
    }
  }

  const backTo = "/pedidos";

  return (
    <PortalShell title="Pedidos" subtitle="Detalhe do pedido">
      <div className="space-y-4 md:space-y-6">
        <PageHeader
          title="Detalhe do pedido"
          subtitle={orderId ? `ID: ${orderId}` : "—"}
          right={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
              <SecondaryActionButton
                onClick={() => router.push(backTo)}
                disabled={working}
                fullWidth
              >
                Voltar
              </SecondaryActionButton>

              <SecondaryActionButton
                onClick={refresh}
                disabled={working || loading}
                fullWidth
              >
                {working ? "Atualizando..." : "Atualizar"}
              </SecondaryActionButton>
            </div>
          }
        />

        {msg ? (
          <Card title="Aviso">
            <div className="whitespace-pre-wrap text-sm text-red-600">{msg}</div>
          </Card>
        ) : null}

        {/* Card de contestação de entrega */}
        {!loading && order && order.logistic_status === "ENTREGUE" ? (
          <div
            className={[
              "rounded-[24px] border p-4 shadow-sm md:rounded-[30px] md:p-6",
              effectiveConfirmationStatus === "CONTESTADA"
                ? "border-orange-200 bg-orange-50"
                : effectiveConfirmationStatus === "CONFIRMADA_AUTOMATICAMENTE"
                ? "border-green-200 bg-green-50"
                : "border-amber-200 bg-amber-50",
            ].join(" ")}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                {effectiveConfirmationStatus === "CONTESTADA" ? (
                  <>
                    <div className="text-sm font-semibold text-orange-800">
                      Entrega contestada
                    </div>
                    <div className="mt-1 text-sm text-orange-700">
                      Contestação registrada em {fmtDT(order.delivery_disputed_at)}.
                      Motivo: <span className="font-semibold">{order.delivery_dispute_reason}</span>.
                      {order.delivery_dispute_notes ? (
                        <> Observação: {order.delivery_dispute_notes}</>
                      ) : null}
                    </div>
                    <div className="mt-2 text-xs text-orange-600">
                      Nossa equipe analisará a contestação e entrará em contato em breve.
                    </div>
                  </>
                ) : effectiveConfirmationStatus === "CONFIRMADA_AUTOMATICAMENTE" ? (
                  <>
                    <div className="text-sm font-semibold text-green-800">
                      Entrega confirmada automaticamente
                    </div>
                    <div className="mt-1 text-sm text-green-700">
                      O prazo de contestação expirou e a entrega foi confirmada automaticamente.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-semibold text-amber-900">
                      Este pedido foi marcado como entregue
                    </div>
                    <div className="mt-1 text-sm text-amber-800">
                      Caso exista divergência, você pode contestar até{" "}
                      <span className="font-semibold">{disputeDeadlineLabel ?? "—"}</span>.
                      Após esse prazo, a entrega será considerada confirmada automaticamente.
                    </div>
                  </>
                )}
              </div>

              {effectiveConfirmationStatus === "AGUARDANDO_CONTESTACAO" ? (
                <div className="shrink-0">
                  <SecondaryActionButton
                    onClick={() => {
                      setDisputeError("");
                      setDisputeReason("");
                      setDisputeNotes("");
                      setDisputeModalOpen(true);
                    }}
                    disabled={!canDispute}
                  >
                    Contestar entrega
                  </SecondaryActionButton>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Modal de contestação */}
        {disputeModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-[24px] border border-slate-200 bg-white p-6 shadow-2xl">
              <div className="text-base font-semibold text-slate-900">
                Contestar entrega
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Informe o motivo e detalhes da divergência.
              </div>

              <div className="mt-5 grid gap-4">
                <div className="grid gap-1">
                  <div className="text-xs font-semibold text-slate-600">
                    Motivo da contestação <span className="text-red-500">*</span>
                  </div>
                  <select
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none"
                  >
                    <option value="">Selecione o motivo...</option>
                    {DISPUTE_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-1">
                  <div className="text-xs font-semibold text-slate-600">
                    Observação (opcional)
                  </div>
                  <textarea
                    value={disputeNotes}
                    onChange={(e) => setDisputeNotes(e.target.value)}
                    rows={3}
                    placeholder="Descreva a divergência com mais detalhes..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none resize-none"
                  />
                </div>

                {disputeError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {disputeError}
                  </div>
                ) : null}
              </div>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <SecondaryActionButton
                  onClick={() => setDisputeModalOpen(false)}
                  disabled={disputeSubmitting}
                >
                  Cancelar
                </SecondaryActionButton>
                <PrimaryActionButton
                  onClick={handleContestar}
                  disabled={disputeSubmitting || !disputeReason}
                >
                  {disputeSubmitting ? "Registrando..." : "Confirmar contestação"}
                </PrimaryActionButton>
              </div>
            </div>
          </div>
        ) : null}

        {loading ? (
          <Card>
            <div className="text-sm text-slate-600">Carregando...</div>
          </Card>
        ) : !order ? (
          <Card>
            <div className="text-sm text-slate-700">Pedido não encontrado.</div>
          </Card>
        ) : (
          <>
            {/* ── Banner: pedido aguardando pagamento com cartão ── */}
            {order.status === "awaiting_payment" ? (
              <AwaitingPaymentBanner orderId={orderId!} />
            ) : null}

            <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-4 shadow-sm md:rounded-[30px] md:p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={order.status === "awaiting_payment" ? "yellow" : statusTone(order.status)}>
                      {order.status === "awaiting_payment" ? "Aguardando pagamento" : order.status}
                    </Badge>
                    <Badge tone={logisticTone(order.logistic_status)}>
                      {logisticLabel(order.logistic_status)}
                    </Badge>

                    <Badge tone={deliveryTrackingTone(order.delivery_status)}>
                      {deliveryTrackingLabel(order.delivery_status)}
                    </Badge>

                    {edited ? (
                      <Badge tone="blue">Ajustado pela o2distribuidora</Badge>
                    ) : (
                      <Badge tone="neutral">Pedido original</Badge>
                    )}

                    {order.due_date ? (
                      order.is_paid ? (
                        <Badge tone="green">Pago</Badge>
                      ) : overdue ? (
                        <Badge tone="red">Vencido</Badge>
                      ) : (
                        <Badge tone="green">Em dia</Badge>
                      )
                    ) : (
                      <Badge tone="neutral">Sem vencimento</Badge>
                    )}

                    {order.delivery_forecast ? (
                      forecastOverdue ? (
                        <Badge tone="red">Entrega atrasada</Badge>
                      ) : (
                        <Badge tone="green">Previsão ativa</Badge>
                      )
                    ) : (
                      <Badge tone="neutral">Sem previsão</Badge>
                    )}
                  </div>

                  <div className="mt-4 space-y-2 text-sm leading-6 text-slate-700 md:leading-7">
                    <div>
                      <span className="font-semibold text-slate-900">Entrega:</span>{" "}
                      {deliveryLabel(order.delivery_mode)}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-900">Vencimento:</span>{" "}
                      {fmtYMD(order.due_date)}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-900">Previsão de entrega:</span>{" "}
                      {fmtYMD(order.delivery_forecast)}
                    </div>
                    {edited ? (
                      <div>
                        <span className="font-semibold text-slate-900">Editado em:</span>{" "}
                        {fmtDT(order.edited_at)}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="w-full rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm xl:max-w-sm xl:shrink-0 xl:rounded-[24px]">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:text-xs">
                    Resumo financeiro
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-slate-600">Itens</span>
                      <span className="text-sm font-semibold text-slate-900">
                        {money(totalItens)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-slate-600">Frete</span>
                      <span className="text-sm font-semibold text-slate-900">{money(frete)}</span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-slate-600">Crédito abatido</span>
                      <span className="text-sm font-semibold text-slate-900">
                        - {money(creditApplied)}
                      </span>
                    </div>

                    <div className="h-px bg-slate-200" />

                    <div className="flex items-end justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-900">Total líquido</span>
                      <span className="text-xl font-semibold tracking-[-0.03em] text-slate-900 md:text-2xl">
                        {money(totalLiquido)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {edited && originalItems && originalItems.length > 0 ? (
                <div className="mt-4 text-sm text-slate-600">
                  Abaixo você verá o <b>pedido original</b> e o <b>pedido atual</b> após os ajustes.
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-6">
              <div className="order-2 space-y-4 md:space-y-6 xl:order-1">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
                  <MetricCard title="Itens atuais" value={money(totalItens)} />
                  <MetricCard title="Frete" value={money(frete)} />
                  <div className="col-span-2 md:col-span-1">
                    <MetricCard title="Total com frete" value={money(totalComFrete)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
                  <MetricCard title="Crédito abatido" value={`- ${money(creditApplied)}`} />
                  <MetricCard title="Total líquido" value={money(totalLiquido)} />
                  <div className="col-span-2 md:col-span-1">
                    <MetricCard
                      title="Pagamento"
                      value={order.is_paid ? "Pago" : "Não pago"}
                      subtitle={order.paid_at ? fmtDT(order.paid_at) : order.payment_method ?? "—"}
                    />
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm md:rounded-[30px] md:p-6">
                  <div className="text-sm font-semibold text-slate-900">Datas do pedido</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Linha do tempo do processo.
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4 md:rounded-[22px]">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Criado
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        {fmtDT(order.created_at)}
                      </div>
                    </div>

                    <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4 md:rounded-[22px]">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Enviado
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        {fmtDT(order.submitted_at)}
                      </div>
                    </div>

                    <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4 md:rounded-[22px]">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Aprovado
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        {fmtDT(order.approved_at)}
                      </div>
                    </div>

                    <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4 md:rounded-[22px]">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Previsão
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        {fmtYMD(order.delivery_forecast)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm md:rounded-[30px] md:p-6">
                  <div className="text-sm font-semibold text-slate-900">Observações</div>
                  <div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {order.notes ?? "—"}
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm md:rounded-[30px] md:p-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        Itens atuais ({items.length})
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Itens considerados no pedido final.
                      </div>
                    </div>
                  </div>

                  {items.length === 0 ? (
                    <div className="mt-6 text-sm text-slate-600">Nenhum item.</div>
                  ) : (
                    <>
                      <div className="mt-6 hidden overflow-x-auto md:block">
                        <table className="w-full border-separate border-spacing-0">
                          <thead>
                            <tr className="text-left text-xs text-slate-600">
                              <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                                SKU
                              </th>
                              <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                                Produto
                              </th>
                              <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                                Unid.
                              </th>
                              <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-right">
                                Preço
                              </th>
                              <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-right">
                                Qtd
                              </th>
                              <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-right">
                                Total
                              </th>
                            </tr>
                          </thead>

                          <tbody>
                            {items.map((it) => {
                              const prod = getProduct(it.products);
                              const sku = prod?.sku ?? "-";
                              const name = prod?.name ?? "-";
                              const unit = prod?.unit ?? it.unit ?? "-";
                              const unitCost = Number(it.unit_cost ?? 0) || 0;
                              const qty = Number(it.qty ?? 0) || 0;
                              const line = qty * unitCost;

                              return (
                                <tr key={it.id} className="hover:bg-slate-50">
                                  <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4">
                                    <div className="font-mono text-xs text-slate-600">{sku}</div>
                                  </td>
                                  <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 text-sm text-slate-900">
                                    {name}
                                  </td>
                                  <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 text-sm text-slate-700">
                                    {unit}
                                  </td>
                                  <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 text-right text-sm text-slate-900">
                                    {money(unitCost)}
                                  </td>
                                  <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 text-right font-semibold text-slate-900">
                                    {qty}
                                  </td>
                                  <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 text-right font-semibold text-slate-900">
                                    {money(line)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-6 space-y-3 md:hidden">
                        {items.map((it) => (
                          <MobileItemCard key={it.id} item={it} />
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {edited && originalItems && originalItems.length > 0 ? (
                  <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm md:rounded-[30px] md:p-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          Pedido original do cliente ({originalItems.length})
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          Snapshot salvo em {fmtDT(order.edited_at)}.
                        </div>
                      </div>

                      <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 md:rounded-[22px]">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Total original
                        </div>
                        <div className="mt-1 text-base font-semibold text-slate-900 md:text-lg">
                          {money(originalTotal)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 hidden overflow-x-auto md:block">
                      <table className="w-full border-separate border-spacing-0">
                        <thead>
                          <tr className="text-left text-xs text-slate-600">
                            <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                              SKU
                            </th>
                            <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                              Produto
                            </th>
                            <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                              Unid.
                            </th>
                            <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-right">
                              Preço
                            </th>
                            <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-right">
                              Qtd
                            </th>
                            <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-right">
                              Total
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {originalItems.map((it) => {
                            const sku = it.sku ?? "-";
                            const name = it.name ?? "-";
                            const unit = it.product_unit ?? it.unit ?? "-";
                            const unitCost = Number(it.unit_cost ?? 0) || 0;
                            const qty = Number(it.qty ?? 0) || 0;
                            const line = qty * unitCost;

                            return (
                              <tr key={it.id} className="hover:bg-slate-50">
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4">
                                  <div className="font-mono text-xs text-slate-600">{sku}</div>
                                </td>
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 text-sm text-slate-900">
                                  {name}
                                </td>
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 text-sm text-slate-700">
                                  {unit}
                                </td>
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 text-right text-sm text-slate-900">
                                  {money(unitCost)}
                                </td>
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 text-right font-semibold text-slate-900">
                                  {qty}
                                </td>
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 text-right font-semibold text-slate-900">
                                  {money(line)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-6 space-y-3 md:hidden">
                      {originalItems.map((it) => (
                        <MobileOriginalItemCard key={it.id} item={it} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="order-1 xl:order-2">
                <div className="xl:sticky xl:top-24">
                  <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfd_100%)] p-4 shadow-sm md:rounded-[30px] md:p-6">
                    <div className="text-lg font-semibold tracking-[-0.02em] text-slate-900">
                      Ações
                    </div>

                    <div className="mt-1 text-sm text-slate-600">
                      Navegação rápida do pedido.
                    </div>

                    <div className="mt-5 grid gap-3">
                      <PrimaryActionButton
                        onClick={() => router.push(backTo)}
                        fullWidth
                      >
                        Voltar para histórico
                      </PrimaryActionButton>

                      <SecondaryActionButton
                        onClick={refresh}
                        disabled={working || loading}
                        fullWidth
                      >
                        {working ? "Atualizando..." : "Atualizar pedido"}
                      </SecondaryActionButton>

                      <SecondaryActionButton
                        onClick={() => router.push(`/pedidos/${order.id}/entrega`)}
                        disabled={!canTrackDelivery}
                        fullWidth
                      >
                        Acompanhar entrega
                      </SecondaryActionButton>
                    </div>

                    <div className="mt-5 rounded-[20px] border border-slate-200 bg-white p-4 md:rounded-[22px]">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Situação
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge tone={statusTone(order.status)}>{order.status}</Badge>
                        <Badge tone={logisticTone(order.logistic_status)}>
                          {logisticLabel(order.logistic_status)}
                        </Badge>
                        <Badge tone={deliveryTrackingTone(order.delivery_status)}>
                          {deliveryTrackingLabel(order.delivery_status)}
                        </Badge>
                        {order.is_paid ? (
                          <Badge tone="green">Pago</Badge>
                        ) : (
                          <Badge tone="yellow">Pendente</Badge>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 rounded-[20px] border border-slate-200 bg-white p-4 md:rounded-[22px]">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Entrega
                      </div>

                      <div className="mt-3 space-y-3 text-sm text-slate-700">
                        <div className="flex items-start justify-between gap-3">
                          <span>Modalidade</span>
                          <span className="text-right font-semibold text-slate-900">
                            {deliveryLabel(order.delivery_mode)}
                          </span>
                        </div>

                        <div className="flex items-start justify-between gap-3">
                          <span>Previsão</span>
                          <span className="text-right font-semibold text-slate-900">
                            {fmtYMD(order.delivery_forecast)}
                          </span>
                        </div>

                        <div className="flex items-start justify-between gap-3">
                          <span>Status entrega</span>
                          <span className="text-right font-semibold text-slate-900">
                            {deliveryTrackingLabel(order.delivery_status)}
                          </span>
                        </div>

                        <div className="flex items-start justify-between gap-3">
                          <span>Vencimento</span>
                          <span className="text-right font-semibold text-slate-900">
                            {fmtYMD(order.due_date)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {!canTrackDelivery ? (
                      <div className="mt-4 rounded-[20px] border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600 md:rounded-[22px]">
                        O acompanhamento da entrega será liberado quando o pedido entrar em separação, sair para entrega, for entregue ou tiver ocorrência registrada.
                      </div>
                    ) : null}

                    {focusDoc?.reference ? (
                      <div className="mt-4 rounded-[20px] border border-emerald-200 bg-emerald-50 p-4 md:rounded-[22px]">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                          Nota Fiscal
                        </div>

                        <div className="mt-3 space-y-1.5 text-sm text-slate-700">
                          {focusDoc.numero ? (
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-slate-500">Número</span>
                              <span className="font-semibold text-slate-900">
                                {focusDoc.numero}{focusDoc.serie ? ` / Série ${focusDoc.serie}` : ""}
                              </span>
                            </div>
                          ) : null}
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-500">Status</span>
                            <span className="font-semibold text-emerald-700 capitalize">
                              {focusDoc.status || "emitida"}
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <a
                            href={`/api/focus/nfe/danfe?reference=${encodeURIComponent(focusDoc.reference)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-10 items-center justify-center rounded-[14px] border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                          >
                            ↓ DANFE
                          </a>
                          <a
                            href={`/api/focus/nfe/xml?reference=${encodeURIComponent(focusDoc.reference)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-10 items-center justify-center rounded-[14px] border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            ↓ XML
                          </a>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </PortalShell>
  );
}