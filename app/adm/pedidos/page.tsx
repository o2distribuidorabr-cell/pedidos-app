"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { PageHeader, Card, Input, Select, Badge, StatCard } from "@/app/components/ui";

type PaymentMethod = "PIX" | "CARTAO" | "BOLETO";
type DeliveryMode = "RETIRADA" | "FRETE";

type OrderRow = {
  id: string;
  created_at: string;
  status: string;
  logistic_status: string | null;
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
const LOG_OPTIONS = ["RECEBIDO", "EM_SEPARACAO", "ENTREGUE"] as const;

type TabKey = "OPEN" | "DELIVERED";
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
        fullWidth ? "w-full" : "",
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
      <div>
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
      </div>
      {right ? <div>{right}</div> : null}
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
    <div className="flex items-start justify-between gap-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

export default function AdmPedidosPage() {
  const router = useRouter();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const [tab, setTab] = useState<TabKey>("OPEN");

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
    const delivered = orders.filter((o) => (o.logistic_status ?? "") === "ENTREGUE");
    const open = orders.filter((o) => (o.logistic_status ?? "") !== "ENTREGUE");
    return { open, delivered };
  }, [orders]);

  const counts = useMemo(() => {
    return {
      open: ordersByTab.open.length,
      delivered: ordersByTab.delivered.length,
    };
  }, [ordersByTab]);

  const filtered = useMemo(() => {
    const base = tab === "DELIVERED" ? ordersByTab.delivered : ordersByTab.open;

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

    const delItems = await supabase.from("order_items").delete().in("order_id", ids);
    if (delItems.error) console.error("delete order_items error:", delItems.error);

    const delOrders = await supabase.from("orders").delete().in("id", ids);
    if (delOrders.error) console.error("delete orders error:", delOrders.error);

    setSelected(new Set());
    await loadOrders();
    setDeleting(false);
  }

  async function updateOrder(id: string, patch: Partial<OrderRow>) {
    const { error } = await supabase.from("orders").update(patch).eq("id", id);
    if (error) console.error("updateOrder error:", error);

    setOrders((prev) =>
      prev.map((o) => (o.id === id ? ({ ...o, ...patch } as OrderRow) : o))
    );

    await loadOrders();
  }

  const summary = useMemo(() => {
    const base = tab === "DELIVERED" ? ordersByTab.delivered : ordersByTab.open;
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
    <div className="space-y-6">
      <PageHeader
        title="Pedidos"
        subtitle="Gerencie pedidos, pagamentos, logística e vencimentos"
        right={
          <div className="flex flex-wrap gap-2">
            <SecondaryActionButton
              danger
              disabled={selected.size === 0 || deleting}
              onClick={deleteSelected}
            >
              Excluir ({selected.size})
            </SecondaryActionButton>

            <SecondaryActionButton onClick={loadOrders}>
              Atualizar
            </SecondaryActionButton>
          </div>
        }
      />

      <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-5 shadow-sm md:p-6">
        <SectionTitle
          title="Visão geral"
          subtitle={`Acompanhamento da aba ${tab === "OPEN" ? "Em aberto" : "Entregues"}`}
        />

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Pedidos" value={summary.totalOrders} />
          <StatCard label="Valor total" value={fmtBRL(summary.totalValue)} />
          <StatCard label="Pagos" value={summary.paid} />
          <StatCard label="Não pagos" value={summary.unpaid} />
          <StatCard label="Vencidos" value={summary.overdue} />
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <SectionTitle
          title="Navegação e busca"
          subtitle="Troque a aba e filtre rapidamente por pedido ou loja"
        />

        <div className="mt-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {tab === "OPEN" ? (
              <>
                <PrimaryActionButton onClick={() => setTab("OPEN")}>
                  Em aberto ({counts.open})
                </PrimaryActionButton>
                <SecondaryActionButton onClick={() => setTab("DELIVERED")}>
                  Entregues ({counts.delivered})
                </SecondaryActionButton>
              </>
            ) : (
              <>
                <SecondaryActionButton onClick={() => setTab("OPEN")}>
                  Em aberto ({counts.open})
                </SecondaryActionButton>
                <PrimaryActionButton onClick={() => setTab("DELIVERED")}>
                  Entregues ({counts.delivered})
                </PrimaryActionButton>
              </>
            )}
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

        <div className="mt-3 text-xs text-slate-500">
          Regra: ao marcar <b>Logística = ENTREGUE</b>, o pedido vai para a aba <b>Entregues</b>.
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
                className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm md:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selected.has(o.id)}
                        onChange={() => toggleSelect(o.id)}
                        className="mt-1 h-4 w-4 rounded border-slate-300"
                      />

                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-slate-900">
                          {o.store_name ?? "Loja não vinculada"}
                        </div>

                        <div className="mt-1 font-mono text-xs text-slate-500 break-all">
                          {o.id}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {isSplitChild ? <Badge tone="blue">Parcial</Badge> : null}
                          {isOverdue ? <Badge tone="red">Vencido</Badge> : null}
                          {!!due && !isOverdue ? <Badge tone="neutral">Com vencimento</Badge> : null}
                          {(o.logistic_status ?? "") === "ENTREGUE" ? (
                            <Badge tone="green">Entregue</Badge>
                          ) : null}
                          {!!o.is_paid ? (
                            <Badge tone="green">Pago</Badge>
                          ) : (
                            <Badge tone="yellow">Não pago</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-lg font-semibold text-slate-900">
                      {fmtBRL(o.total_with_freight)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Itens {fmtBRL(o.total)}
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                    <div className="space-y-3">
                      <InfoLine label="Criado em" value={fmtDT(o.created_at)} />
                      <InfoLine label="Status" value={o.status} />
                      <InfoLine label="Logística" value={o.logistic_status ?? "—"} />
                      <InfoLine label="Pagamento" value={o.payment_method ?? "—"} />
                      <InfoLine label="Entrega" value={o.delivery_mode ?? "—"} />
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

                    <Select
                      label="Logística"
                      value={o.logistic_status ?? LOG_OPTIONS[0]}
                      onChange={(v) => updateOrder(o.id, { logistic_status: v })}
                      options={LOG_OPTIONS.map((s) => ({ value: s, label: s }))}
                    />

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

                <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <PrimaryActionButton
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

                  <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap">
                    <Link href={`/adm/pedidos/${o.id}?edit=1`} className="block">
                      <SecondaryActionButton fullWidth>
                        Editar
                      </SecondaryActionButton>
                    </Link>

                    <Link href={`/adm/pedidos/${o.id}`} className="block">
                      <SecondaryActionButton fullWidth>
                        Abrir pedido
                      </SecondaryActionButton>
                    </Link>

                    {o.parent_order_id ? (
                      <Link href={`/adm/pedidos/${o.parent_order_id}`} className="block">
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
    </div>
  );
}