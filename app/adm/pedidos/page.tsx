"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { PageHeader, Card, Input, Select, Badge, StatCard } from "@/app/components/ui";

type PaymentMethod = "PIX" | "CARTAO" | "BOLETO";
type DeliveryProvider = "autonomo" | "lalamove";
type DeliveryMode = "RETIRADA" | "FRETE";
type UnifiedLogisticStatus =
  | "RECEBIDO"
  | "EM_SEPARACAO"
  | "SAIU_PARA_ENTREGA"
  | "ENTREGUE";

type OrderRow = {
  id: string;
  created_at: string;
  status: string;
  logistic_status: UnifiedLogisticStatus | null;
  is_paid: boolean | null;
  paid_at: string | null;
  payment_method: PaymentMethod | null;
  delivery_mode: DeliveryMode | null;
  freight_fee: number | null;
  store_name: string | null;
  total: number;
  total_with_freight: number;

  due_date: string | null;

  parent_order_id?: string | null;
  split_group_id?: string | null;
  is_split_child?: boolean | null;
};

const STATUS_OPTIONS = ["draft", "submitted", "approved", "rejected"] as const;
const LOG_OPTIONS: UnifiedLogisticStatus[] = [
  "RECEBIDO",
  "EM_SEPARACAO",
  // "SAIU_PARA_ENTREGA" e "ENTREGUE" removidos — só via botão de dispatch ou automático
];

type TabKey = "RECEBIDO" | "EM_SEPARACAO" | "SAIU_PARA_ENTREGA" | "ENTREGUE";
type OrdersAdminListRow = OrderRow;

function isOrdersAdminListRowArray(v: unknown): v is OrdersAdminListRow[] {
  return Array.isArray(v);
}

function fmtBRL(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtDT(v: string) {
  return new Date(v).toLocaleString("pt-BR");
}

function fmtDateOnly(v: string | null | undefined) {
  if (!v) return "-";
  try {
    const [y, m, d] = String(v).split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0).toLocaleDateString("pt-BR");
  } catch {
    return String(v);
  }
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isPastDateYMD(ymd: string) {
  return ymd < todayYMD();
}

function getLogisticLabel(value: UnifiedLogisticStatus | null) {
  switch (value) {
    case "RECEBIDO":
      return "Recebido";
    case "EM_SEPARACAO":
      return "Em separação";
    case "SAIU_PARA_ENTREGA":
      return "Saiu para entrega";
    case "ENTREGUE":
      return "Entregue";
    default:
      return "—";
  }
}

function getLogisticTone(
  value: UnifiedLogisticStatus | null
): "green" | "yellow" | "blue" | "neutral" {
  switch (value) {
    case "ENTREGUE":
      return "green";
    case "SAIU_PARA_ENTREGA":
      return "blue";
    case "EM_SEPARACAO":
      return "yellow";
    default:
      return "neutral";
  }
}

function getStatusTone(status: string): "green" | "red" | "yellow" | "neutral" {
  const s = (status || "").toLowerCase();
  if (s === "approved") return "green";
  if (s === "rejected") return "red";
  if (s === "submitted") return "yellow";
  return "neutral";
}

function getPaymentBadgeTone(
  isPaid: boolean | null,
  dueDate: string | null
): "green" | "red" | "yellow" {
  if (isPaid) return "green";
  if (dueDate && isPastDateYMD(dueDate)) return "red";
  return "yellow";
}

function getPaymentBadgeLabel(isPaid: boolean | null, dueDate: string | null) {
  if (isPaid) return "Pago";
  if (dueDate && isPastDateYMD(dueDate)) return "Vencido";
  return "Não pago";
}

function getDeliveryLabel(mode: DeliveryMode | null) {
  if (mode === "FRETE") return "Frete";
  if (mode === "RETIRADA") return "Retirada";
  return "—";
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
        "inline-flex h-11 items-center justify-center rounded-[18px] px-4 text-sm font-semibold text-white transition",
        "bg-cyan-600 shadow-[0_14px_34px_rgba(8,145,178,0.22)] hover:bg-cyan-700",
        "disabled:cursor-not-allowed disabled:opacity-50",
        fullWidth ? "w-full" : "w-full sm:w-auto",
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
  danger,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-11 items-center justify-center rounded-[18px] px-4 text-sm font-semibold transition",
        danger
          ? "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
          : "border border-slate-200 bg-white text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] hover:bg-slate-50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        fullWidth ? "w-full" : "w-full sm:w-auto",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900 sm:text-base">{title}</div>
        {subtitle ? (
          <div className="mt-1 text-sm leading-6 text-slate-600">{subtitle}</div>
        ) : null}
      </div>
      {right ? <div className="w-full sm:w-auto">{right}</div> : null}
    </div>
  );
}

function InfoLine({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-900 sm:text-right">{value}</span>
    </div>
  );
}

function ProviderChoiceCard({ title, subtitle, accent, onClick, disabled }: {
  title: string; subtitle: string; accent: "cyan" | "violet"; onClick?: () => void; disabled?: boolean;
}) {
  const toneClass = accent === "violet"
    ? "border-violet-200 bg-violet-50 hover:bg-violet-100"
    : "border-cyan-200 bg-cyan-50 hover:bg-cyan-100";
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={["w-full rounded-[24px] border p-4 text-left transition", toneClass, "disabled:cursor-not-allowed disabled:opacity-50"].join(" ")}>
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-sm text-slate-600">{subtitle}</div>
    </button>
  );
}

export default function AdmPedidosPage() {
  const router = useRouter();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispatchOrder, setDispatchOrder] = useState<OrderRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [dispatchSaving, setDispatchSaving] = useState(false);
  const [q, setQ] = useState("");

  const [tab, setTab] = useState<TabKey>("RECEBIDO");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  async function loadOrders() {
    setLoading(true);

    const { data, error } = await supabase
      .from("v_orders_admin_list")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("loadOrders error:", error);
      setOrders([]);
      setLoading(false);
      return;
    }

    const safe = isOrdersAdminListRowArray(data) ? data : [];
    setOrders(safe);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        router.push("/login");
        return;
      }
      await loadOrders();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ordersByTab = useMemo(() => {
    return {
      RECEBIDO: orders.filter((o) => (o.logistic_status ?? "RECEBIDO") === "RECEBIDO"),
      EM_SEPARACAO: orders.filter((o) => o.logistic_status === "EM_SEPARACAO"),
      SAIU_PARA_ENTREGA: orders.filter((o) => o.logistic_status === "SAIU_PARA_ENTREGA"),
      ENTREGUE: orders.filter((o) => o.logistic_status === "ENTREGUE"),
    };
  }, [orders]);

  const counts = useMemo(() => ({
    RECEBIDO: ordersByTab.RECEBIDO.length,
    EM_SEPARACAO: ordersByTab.EM_SEPARACAO.length,
    SAIU_PARA_ENTREGA: ordersByTab.SAIU_PARA_ENTREGA.length,
    ENTREGUE: ordersByTab.ENTREGUE.length,
  }), [ordersByTab]);

  const filtered = useMemo(() => {
    const base = ordersByTab[tab];
    const qq = q.trim().toLowerCase();
    if (!qq) return base;
    return base.filter(
      (o) =>
        o.id.toLowerCase().includes(qq) ||
        (o.store_name ?? "").toLowerCase().includes(qq)
    );
  }, [ordersByTab, tab, q]);

  useEffect(() => {
    setSelected(new Set());
  }, [tab]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function deleteSelected() {
    if (selected.size === 0) return;

    const ok = confirm(`Excluir ${selected.size} pedido(s)?`);
    if (!ok) return;

    setDeleting(true);
    const ids = Array.from(selected);

    await Promise.all(
      ids.map((id) =>
        fetch(`/api/adm/orders/${id}/delete`, { method: "DELETE" }).catch((e) =>
          console.error("delete order error:", id, e)
        )
      )
    );

    setSelected(new Set());
    await loadOrders();
    setDeleting(false);
  }

  async function updateOrder(id: string, patch: Partial<OrderRow>) {
    // Se está alterando logistic_status, passa pela API com validações de bloqueio
    if (patch.logistic_status !== undefined) {
      if (patch.logistic_status === "ENTREGUE") {
        console.warn("Status ENTREGUE não pode ser marcado manualmente.");
        return;
      }
      if (patch.logistic_status === "SAIU_PARA_ENTREGA") {
        console.warn("Use o botão de dispatch para saída para entrega.");
        return;
      }
      const response = await fetch(`/api/logistica/admin/order/${id}/set-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryStatus: patch.logistic_status }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        console.error("set-status error:", data.message);
        return;
      }
      setOrders((prev) => prev.map((o) => (o.id === id ? ({ ...o, ...patch } as OrderRow) : o)));
      await loadOrders();
      return;
    }

    // Para outros campos, atualiza diretamente
    const { error } = await supabase.from("orders").update(patch).eq("id", id);
    if (error) { console.error("updateOrder error:", error); return; }
    setOrders((prev) => prev.map((o) => (o.id === id ? ({ ...o, ...patch } as OrderRow) : o)));
    await loadOrders();
  }

  async function handleMarkSeparation(order: OrderRow) {
    setSaving(true);
    try {
      const response = await fetch(`/api/logistica/admin/order/${order.id}/mark-separation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        console.error("Erro ao marcar separação:", data.message);
        return;
      }
      setOrders((prev) => prev.map((o) =>
        o.id === order.id ? { ...o, logistic_status: "EM_SEPARACAO" } : o
      ));
    } catch (e) {
      console.error("Erro ao marcar separação:", e);
    } finally {
      setSaving(false);
    }
  }

  function openDispatchChooser(order: OrderRow) {
    if (order.delivery_mode === "RETIRADA") return;
    setDispatchOrder(order);
  }

  function closeDispatchChooser() {
    if (dispatchSaving) return;
    setDispatchOrder(null);
  }

  async function goToLogisticsWithProvider(provider: DeliveryProvider) {
    if (!dispatchOrder) return;
    setDispatchSaving(true);
    try {
      const currentStatus = dispatchOrder.logistic_status ?? "RECEBIDO";
      if (currentStatus === "RECEBIDO") {
        await fetch(`/api/logistica/admin/order/${dispatchOrder.id}/set-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliveryStatus: "EM_SEPARACAO" }),
        });
      }
      setDispatchOrder(null);
      router.push(`/adm/logistica/${dispatchOrder.id}?mode=dispatch&provider=${provider}`);
    } finally {
      setDispatchSaving(false);
    }
  }

  const summary = useMemo(() => {
    const base = ordersByTab[tab];
    const totalValue = base.reduce((acc, o) => acc + (Number(o.total_with_freight) || 0), 0);
    const paid = base.filter((o) => !!o.is_paid).length;
    const unpaid = base.filter((o) => !o.is_paid).length;
    const overdue = base.filter((o) => !!o.due_date && !o.is_paid && isPastDateYMD(o.due_date)).length;

    return {
      totalOrders: base.length,
      totalValue,
      paid,
      unpaid,
      overdue,
    };
  }, [ordersByTab, tab]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Pedidos"
        subtitle="Gerencie pedidos, pagamentos, logística e vencimentos"
        right={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
            <SecondaryActionButton
              danger
              fullWidth
              disabled={selected.size === 0 || deleting}
              onClick={deleteSelected}
            >
              Excluir ({selected.size})
            </SecondaryActionButton>

            <SecondaryActionButton fullWidth onClick={loadOrders}>
              Atualizar
            </SecondaryActionButton>
          </div>
        }
      />

      <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-4 shadow-sm sm:rounded-[30px] sm:p-5 md:p-6">
        <SectionTitle
          title="Visão geral"
          subtitle={`Acompanhamento da aba ${tab === "RECEBIDO" ? "Recebidos" : tab === "EM_SEPARACAO" ? "Em separação" : tab === "SAIU_PARA_ENTREGA" ? "Saiu para entrega" : "Entregues"}`}
        />

        <div className="mt-5 grid gap-3 sm:mt-6 sm:gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Pedidos" value={summary.totalOrders} />
          <StatCard label="Valor total" value={fmtBRL(summary.totalValue)} />
          <StatCard label="Pagos" value={summary.paid} />
          <StatCard label="Não pagos" value={summary.unpaid} />
          <StatCard label="Vencidos" value={summary.overdue} />
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[30px] sm:p-5 md:p-6">
        <SectionTitle
          title="Navegação e busca"
          subtitle="Troque a aba e filtre rapidamente por pedido ou loja"
        />

        <div className="mt-5 flex flex-col gap-4 xl:mt-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            {(["RECEBIDO", "EM_SEPARACAO", "SAIU_PARA_ENTREGA", "ENTREGUE"] as TabKey[]).map((t) => {
              const labels: Record<TabKey, string> = {
                RECEBIDO: "Recebidos",
                EM_SEPARACAO: "Em separação",
                SAIU_PARA_ENTREGA: "Saiu p/ entrega",
                ENTREGUE: "Entregues",
              };
              const isActive = tab === t;
              return isActive ? (
                <PrimaryActionButton key={t} fullWidth onClick={() => setTab(t)}>
                  {labels[t]} ({counts[t]})
                </PrimaryActionButton>
              ) : (
                <SecondaryActionButton key={t} fullWidth onClick={() => setTab(t)}>
                  {labels[t]} ({counts[t]})
                </SecondaryActionButton>
              );
            })}
          </div>

          <div className="w-full xl:w-[360px]">
            <Input
              label="Buscar"
              placeholder="ID ou loja..."
              value={q}
              onChange={setQ}
            />
          </div>
        </div>

      </div>

      {loading ? (
        <Card>
          <div className="text-sm text-slate-600">Carregando...</div>
        </Card>
      ) : null}

      {!loading && filtered.length === 0 ? (
        <Card>
          <div className="text-sm text-slate-600">
            Nenhum pedido encontrado nesta aba.
          </div>
        </Card>
      ) : null}

      {!loading && filtered.length > 0 ? (
        <div className="grid gap-4 2xl:grid-cols-2">
          {filtered.map((o) => {
            const due = o.due_date ?? "";
            const isOverdue = !!due && !o.is_paid && isPastDateYMD(due);
            const isSplitChild = !!(o.is_split_child ?? false) || !!o.parent_order_id;

            return (
              <div
                key={o.id}
                className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[28px] sm:p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selected.has(o.id)}
                        onChange={() => toggleSelect(o.id)}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="break-words text-base font-semibold text-slate-900">
                          {o.store_name ?? "Loja não vinculada"}
                        </div>

                        <div className="mt-1 break-all font-mono text-[11px] text-slate-500 sm:text-xs">
                          {o.id}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {isSplitChild ? <Badge tone="blue">Parcial</Badge> : null}
                          {isOverdue ? <Badge tone="red">Vencido</Badge> : null}
                          {!!due && !isOverdue ? <Badge tone="neutral">Com vencimento</Badge> : null}

                          <Badge tone={getLogisticTone(o.logistic_status)}>
                            {getLogisticLabel(o.logistic_status)}
                          </Badge>

                          <Badge tone={getPaymentBadgeTone(o.is_paid, o.due_date)}>
                            {getPaymentBadgeLabel(o.is_paid, o.due_date)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 rounded-[18px] bg-slate-50 px-3 py-2 text-left sm:min-w-[140px] sm:bg-transparent sm:px-0 sm:py-0 sm:text-right">
                    <div className="text-lg font-semibold text-slate-900">
                      {fmtBRL(o.total_with_freight)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Itens {fmtBRL(o.total)}
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4 sm:rounded-[22px]">
                    <div className="space-y-3">
                      <InfoLine label="Criado em" value={fmtDT(o.created_at)} />
                      <InfoLine
                        label="Status"
                        value={<Badge tone={getStatusTone(o.status)}>{o.status}</Badge>}
                      />
                      <InfoLine
                        label="Logística"
                        value={
                          <Badge tone={getLogisticTone(o.logistic_status)}>
                            {getLogisticLabel(o.logistic_status)}
                          </Badge>
                        }
                      />
                      <InfoLine label="Pagamento" value={o.payment_method ?? "—"} />
                      <InfoLine label="Entrega" value={getDeliveryLabel(o.delivery_mode)} />
                      <InfoLine label="Frete" value={fmtBRL(Number(o.freight_fee ?? 0) || 0)} />
                      <InfoLine label="Vencimento" value={due ? fmtDateOnly(due) : "—"} />
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <Select
                      label="Status"
                      value={o.status}
                      onChange={(v) => updateOrder(o.id, { status: v })}
                      options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
                    />

                    <div>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Logística</div>

                      {/* Status atual */}
                      <div className="mb-2 flex items-center gap-2">
                        <span className={["inline-flex h-7 items-center justify-center rounded-[10px] px-3 text-xs font-semibold",
                          o.logistic_status === "ENTREGUE" ? "bg-green-100 text-green-700" :
                          o.logistic_status === "SAIU_PARA_ENTREGA" ? "bg-blue-100 text-blue-700" :
                          o.logistic_status === "EM_SEPARACAO" ? "bg-amber-100 text-amber-700" :
                          "bg-slate-100 text-slate-600"
                        ].join(" ")}>
                          {getLogisticLabel(o.logistic_status ?? "RECEBIDO")}
                        </span>
                      </div>

                      {/* Botões de ação — iguais às outras páginas, passam pela API */}
                      {o.logistic_status !== "SAIU_PARA_ENTREGA" && o.logistic_status !== "ENTREGUE" ? (
                        <div className="flex flex-col gap-2">
                          <div className="grid grid-cols-2 gap-2">
                            <button type="button"
                              onClick={() => updateOrder(o.id, { logistic_status: "RECEBIDO" })}
                              disabled={o.logistic_status === "RECEBIDO"}
                              className="inline-flex h-9 items-center justify-center rounded-[12px] border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                              Recebido
                            </button>
                            <button type="button"
                              onClick={() => handleMarkSeparation(o)}
                              disabled={saving || o.logistic_status === "EM_SEPARACAO"}
                              className="inline-flex h-9 items-center justify-center rounded-[12px] border border-amber-200 bg-amber-50 px-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed">
                              {o.logistic_status === "EM_SEPARACAO" ? "✓ Em separação" : "Em separação"}
                            </button>
                          </div>
                          {o.delivery_mode !== "RETIRADA" ? (
                            <button type="button" onClick={() => openDispatchChooser(o)}
                              className="inline-flex h-9 w-full items-center justify-center rounded-[12px] border border-violet-200 bg-violet-50 text-xs font-semibold text-violet-700 transition hover:bg-violet-100">
                              Saída para entrega →
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        /* Status travado — saiu ou entregue */
                        <div className="rounded-[12px] border border-slate-100 bg-slate-50 p-2 text-xs text-slate-500 text-center">
                          {o.logistic_status === "ENTREGUE"
                            ? "🔒 Entregue — status bloqueado"
                            : "🚚 Em rota — aguardando confirmação"}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Vencimento
                      </label>
                      <input
                        className="h-11 w-full rounded-[18px] border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-300"
                        type="date"
                        value={due}
                        onChange={(e) => updateOrder(o.id, { due_date: e.target.value || null })}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3">
                  <div className="w-full">
                    <PrimaryActionButton
                      fullWidth
                      onClick={() =>
                        updateOrder(o.id, {
                          is_paid: !o.is_paid,
                          paid_at: !o.is_paid ? new Date().toISOString() : null,
                        })
                      }
                    >
                      {o.is_paid ? "Pago" : "Marcar pago"}
                    </PrimaryActionButton>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap">
                    <Link href={`/adm/pedidos/${o.id}?edit=1`} className="block w-full lg:w-auto">
                      <SecondaryActionButton fullWidth>
                        Editar
                      </SecondaryActionButton>
                    </Link>

                    <Link href={`/adm/pedidos/${o.id}`} className="block w-full lg:w-auto">
                      <SecondaryActionButton fullWidth>
                        Abrir pedido
                      </SecondaryActionButton>
                    </Link>

                    {o.parent_order_id ? (
                      <Link
                        href={`/adm/pedidos/${o.parent_order_id}`}
                        className="block w-full lg:w-auto"
                      >
                        <SecondaryActionButton fullWidth>
                          Abrir original
                        </SecondaryActionButton>
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {/* Modal: dispatch chooser */}
      {dispatchOrder ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 p-3 sm:items-center">
          <div className="w-full max-w-2xl rounded-[30px] border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Saída para entrega</div>
                <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-slate-900">Escolha como este pedido será despachado</h3>
                <div className="mt-2 text-sm text-slate-600"><b>Pedido:</b> {dispatchOrder.id}</div>
                <div className="text-sm text-slate-600"><b>Loja:</b> {dispatchOrder.store_name || "Loja não identificada"}</div>
              </div>
              <button type="button" onClick={closeDispatchChooser} disabled={dispatchSaving}
                className="rounded-[14px] border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Fechar
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <ProviderChoiceCard accent="cyan" title="Motorista autônomo"
                subtitle="Abre a logística para preencher motorista, gerar link de rastreio e código de entrega."
                disabled={dispatchSaving} onClick={() => goToLogisticsWithProvider("autonomo")} />
              <ProviderChoiceCard accent="violet" title="Chamar Lalamove"
                subtitle="Abre a logística para cotação, chamada da corrida e acompanhamento da entrega."
                disabled={dispatchSaving} onClick={() => goToLogisticsWithProvider("lalamove")} />
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" disabled={dispatchSaving} onClick={closeDispatchChooser}
                className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}