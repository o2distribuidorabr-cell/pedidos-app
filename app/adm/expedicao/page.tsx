"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";
import { PageHeader, Card, Input, Badge, Select } from "@/app/components/ui";

type UnifiedLogisticStatus =
  | "RECEBIDO"
  | "EM_SEPARACAO"
  | "SAIU_PARA_ENTREGA"
  | "ENTREGUE";

type OrderRow = {
  id: string;
  store_id: string | null;
  status: string;
  logistic_status: UnifiedLogisticStatus | null;
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
  } | null;
};

type OrderItemAgg = {
  order_id: string;
  lines: number;
  qty_total: number;
  value_total: number;
};

const LOGISTIC_OPTIONS: Array<{ value: UnifiedLogisticStatus; label: string }> = [
  { value: "RECEBIDO", label: "Recebido" },
  { value: "EM_SEPARACAO", label: "Em separação" },
  { value: "SAIU_PARA_ENTREGA", label: "Saiu para entrega" },
  { value: "ENTREGUE", label: "Entregue" },
];

function fmtDT(v: string | null | undefined) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("pt-BR");
  } catch {
    return String(v);
  }
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "-";
  try {
    const d = new Date(`${v}T12:00:00`);
    return d.toLocaleDateString("pt-BR");
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

function fmtBRL(v: number | null | undefined) {
  return Number(v ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function logisticTone(status: UnifiedLogisticStatus | null) {
  if (status === "ENTREGUE") return "green" as const;
  if (status === "SAIU_PARA_ENTREGA") return "blue" as const;
  if (status === "EM_SEPARACAO") return "yellow" as const;
  return "neutral" as const;
}

function logisticLabel(status: UnifiedLogisticStatus | null) {
  if (status === "RECEBIDO") return "Recebido";
  if (status === "EM_SEPARACAO") return "Em separação";
  if (status === "SAIU_PARA_ENTREGA") return "Saiu para entrega";
  if (status === "ENTREGUE") return "Entregue";
  return "—";
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

function sortOrdersForExpedition(a: OrderRow, b: OrderRow) {
  const today = todayYMD();

  const aLate = !!a.delivery_forecast && a.delivery_forecast < today;
  const bLate = !!b.delivery_forecast && b.delivery_forecast < today;
  if (aLate !== bLate) return aLate ? -1 : 1;

  const aToday = a.delivery_forecast === today;
  const bToday = b.delivery_forecast === today;
  if (aToday !== bToday) return aToday ? -1 : 1;

  const statusWeight = (s: UnifiedLogisticStatus | null) => {
    if (s === "EM_SEPARACAO") return 0;
    if (s === "RECEBIDO") return 1;
    if (s === "SAIU_PARA_ENTREGA") return 2;
    return 3;
  };

  const swA = statusWeight(a.logistic_status ?? "RECEBIDO");
  const swB = statusWeight(b.logistic_status ?? "RECEBIDO");
  if (swA !== swB) return swA - swB;

  const fa = a.delivery_forecast || "9999-12-31";
  const fb = b.delivery_forecast || "9999-12-31";
  if (fa !== fb) return fa.localeCompare(fb);

  const ca = a.created_at || "";
  const cb = b.created_at || "";
  return cb.localeCompare(ca);
}

function PrimaryActionButton({
  children,
  onClick,
  disabled,
  fullWidth,
  tone = "cyan",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  tone?: "cyan" | "amber" | "green";
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-500 hover:bg-amber-600"
      : tone === "green"
      ? "bg-emerald-600 hover:bg-emerald-700"
      : "bg-cyan-600 hover:bg-cyan-700";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-11 items-center justify-center rounded-[18px] px-4 text-sm font-semibold text-white transition",
        toneClass,
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
        "inline-flex h-11 items-center justify-center rounded-[18px] px-4 text-sm font-semibold transition",
        "border border-slate-200 bg-white text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] hover:bg-slate-50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        fullWidth ? "w-full" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SummaryBox({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900">{value}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

export default function AdmExpedicaoPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [itemAggMap, setItemAggMap] = useState<Record<string, OrderItemAgg>>({});

  const [search, setSearch] = useState("");
  const [filterLogistic, setFilterLogistic] = useState("all");
  const [filterDeliveryMode, setFilterDeliveryMode] = useState("all");
  const [filterForecast, setFilterForecast] = useState("all");

  useEffect(() => {
    (async () => {
      const ok = await requireAdminOrRedirect(router);
      if (!ok) return;
      await loadOrders();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadOrders() {
    setMsg("");

    const { data, error } = await supabase
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
          name
        )
      `)
      .in("status", ["submitted", "approved"])
      .neq("logistic_status", "ENTREGUE")
      .order("created_at", { ascending: false });

    if (error) {
      setMsg(error.message);
      setOrders([]);
      setItemAggMap({});
      return;
    }

    const normalized: OrderRow[] = (data ?? []).map((row: any) => ({
      id: row.id,
      store_id: row.store_id,
      status: row.status,
      logistic_status: (row.logistic_status ?? "RECEBIDO") as UnifiedLogisticStatus,
      delivery_forecast: row.delivery_forecast ?? null,
      created_at: row.created_at ?? null,
      submitted_at: row.submitted_at ?? null,
      approved_at: row.approved_at ?? null,
      notes: row.notes ?? null,
      delivery_mode: row.delivery_mode ?? null,
      freight_fee: row.freight_fee ?? null,
      is_paid: row.is_paid ?? null,
      paid_at: row.paid_at ?? null,
      payment_method: row.payment_method ?? null,
      credit_applied: row.credit_applied ?? null,
      stores: Array.isArray(row.stores) ? row.stores[0] ?? null : row.stores ?? null,
    }));

    setOrders(normalized);

    const orderIds = normalized.map((o) => o.id);
    if (orderIds.length === 0) {
      setItemAggMap({});
      return;
    }

    const { data: itemsData, error: itemsError } = await supabase
      .from("order_items")
      .select("order_id,qty,unit_cost")
      .in("order_id", orderIds);

    if (itemsError) {
      console.warn("Erro ao carregar agregados de itens:", itemsError.message);
      setItemAggMap({});
      return;
    }

    const map: Record<string, OrderItemAgg> = {};
    for (const row of itemsData ?? []) {
      const orderId = String((row as any).order_id || "");
      if (!orderId) continue;

      if (!map[orderId]) {
        map[orderId] = {
          order_id: orderId,
          lines: 0,
          qty_total: 0,
          value_total: 0,
        };
      }

      map[orderId].lines += 1;
      map[orderId].qty_total += Number((row as any).qty ?? 0);
      map[orderId].value_total +=
        Number((row as any).qty ?? 0) * Number((row as any).unit_cost ?? 0);
    }

    setItemAggMap(map);
  }

  async function updateOrder(
    orderId: string,
    patch: Partial<OrderRow>,
    successMessage?: string
  ) {
    setSavingId(orderId);
    setMsg("");

    const { error } = await supabase.from("orders").update(patch).eq("id", orderId);

    if (error) {
      setMsg(error.message);
      setSavingId(null);
      return;
    }

    const nextStatus = patch.logistic_status ?? null;

    if (nextStatus === "ENTREGUE") {
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setItemAggMap((prev) => {
        const copy = { ...prev };
        delete copy[orderId];
        return copy;
      });
    } else {
      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId
            ? {
                ...order,
                ...patch,
              }
            : order
        )
      );
    }

    setSavingId(null);
    if (successMessage) setMsg(successMessage);
  }

  async function openDeliveryFlow(order: OrderRow) {
    setSavingId(order.id);
    setMsg("");

    try {
      if (order.delivery_mode === "RETIRADA") {
        router.push(`/adm/logistica/${order.id}`);
        return;
      }

      const currentStatus = order.logistic_status ?? "RECEBIDO";

      if (currentStatus === "RECEBIDO") {
        const { error } = await supabase
          .from("orders")
          .update({ logistic_status: "EM_SEPARACAO" })
          .eq("id", order.id);

        if (error) {
          setMsg(error.message);
          return;
        }

        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id ? { ...o, logistic_status: "EM_SEPARACAO" } : o
          )
        );
      }

      router.push(`/adm/logistica/${order.id}?mode=dispatch`);
    } finally {
      setSavingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = todayYMD();

    const result = orders.filter((order) => {
      const storeName = (order.stores?.name || "").toLowerCase();

      const matchText =
        !q || order.id.toLowerCase().includes(q) || storeName.includes(q);

      const currentStatus = order.logistic_status ?? "RECEBIDO";
      const matchLogistic =
        filterLogistic === "all" ? true : currentStatus === filterLogistic;

      const matchDeliveryMode =
        filterDeliveryMode === "all"
          ? true
          : (order.delivery_mode ?? "") === filterDeliveryMode;

      const forecast = order.delivery_forecast ?? "";
      const matchForecast =
        filterForecast === "all"
          ? true
          : filterForecast === "today"
          ? forecast === today
          : filterForecast === "late"
          ? !!forecast && forecast < today
          : filterForecast === "empty"
          ? !forecast
          : true;

      return matchText && matchLogistic && matchDeliveryMode && matchForecast;
    });

    return result.sort(sortOrdersForExpedition);
  }, [orders, search, filterLogistic, filterDeliveryMode, filterForecast]);

  const counts = useMemo(() => {
    const today = todayYMD();

    return {
      total: filtered.length,
      recebido: filtered.filter((o) => (o.logistic_status ?? "RECEBIDO") === "RECEBIDO").length,
      separacao: filtered.filter((o) => o.logistic_status === "EM_SEPARACAO").length,
      rota: filtered.filter((o) => o.logistic_status === "SAIU_PARA_ENTREGA").length,
      hoje: filtered.filter((o) => o.delivery_forecast === today).length,
      atrasados: filtered.filter((o) => !!o.delivery_forecast && o.delivery_forecast < today)
        .length,
    };
  }, [filtered]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Expedição"
        subtitle="Fila operacional simples, rápida e pensada para uso no celular"
        right={
          <div className="flex flex-wrap gap-2">
            <SecondaryActionButton onClick={() => router.push("/adm/expedicao/mapa-separacao")}>
              Mapa de separação
            </SecondaryActionButton>
            <SecondaryActionButton onClick={loadOrders}>Atualizar</SecondaryActionButton>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm text-slate-700 whitespace-pre-wrap">{msg}</div>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryBox title="Fila" value={String(counts.total)} />
        <SummaryBox title="Recebidos" value={String(counts.recebido)} />
        <SummaryBox title="Separação" value={String(counts.separacao)} />
        <SummaryBox title="Em rota" value={String(counts.rota)} />
        <SummaryBox title="Hoje" value={String(counts.hoje)} />
        <SummaryBox title="Atrasados" value={String(counts.atrasados)} />
      </div>

      <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input
            label="Buscar"
            placeholder="Pedido ou loja"
            value={search}
            onChange={setSearch}
          />

          <Select
            label="Status logístico"
            value={filterLogistic}
            onChange={setFilterLogistic}
            options={[
              { value: "all", label: "Todos" },
              { value: "RECEBIDO", label: "Recebido" },
              { value: "EM_SEPARACAO", label: "Em separação" },
              { value: "SAIU_PARA_ENTREGA", label: "Saiu para entrega" },
            ]}
          />

          <Select
            label="Entrega"
            value={filterDeliveryMode}
            onChange={setFilterDeliveryMode}
            options={[
              { value: "all", label: "Todas" },
              { value: "FRETE", label: "Frete" },
              { value: "RETIRADA", label: "Retirada" },
            ]}
          />

          <Select
            label="Previsão"
            value={filterForecast}
            onChange={setFilterForecast}
            options={[
              { value: "all", label: "Todas" },
              { value: "today", label: "Hoje" },
              { value: "late", label: "Atrasadas" },
              { value: "empty", label: "Sem previsão" },
            ]}
          />
        </div>
      </div>

      {loading ? (
        <Card>Carregando...</Card>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="text-sm text-slate-600">
            Nenhum pedido pendente na fila de expedição.
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((order) => {
            const currentStatus = order.logistic_status ?? "RECEBIDO";
            const saving = savingId === order.id;
            const agg = itemAggMap[order.id];
            const today = todayYMD();
            const forecastLate =
              !!order.delivery_forecast &&
              order.delivery_forecast < today &&
              currentStatus !== "ENTREGUE";
            const forecastToday = order.delivery_forecast === today;

            return (
              <div
                key={order.id}
                className={[
                  "rounded-[26px] border bg-white p-4 shadow-sm",
                  forecastLate
                    ? "border-red-200"
                    : forecastToday
                    ? "border-cyan-200"
                    : "border-slate-200",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 break-all">
                      Pedido {order.id}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {order.stores?.name || "Loja não identificada"}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <Badge tone={logisticTone(currentStatus)}>
                      {logisticLabel(currentStatus)}
                    </Badge>

                    {forecastLate ? (
                      <Badge tone="red">Atrasado</Badge>
                    ) : forecastToday ? (
                      <Badge tone="blue">Hoje</Badge>
                    ) : null}
                  </div>
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
                      Tipo entrega
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {deliveryModeLabel(order.delivery_mode)}
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

                  <div className="rounded-[18px] bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Itens
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {agg?.lines ?? 0} linha(s)
                    </div>
                  </div>

                  <div className="rounded-[18px] bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Quantidade
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {Number(agg?.qty_total ?? 0).toLocaleString("pt-BR")}
                    </div>
                  </div>

                  <div className="rounded-[18px] bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Valor produtos
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {fmtBRL(agg?.value_total ?? 0)}
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
                </div>

                <div className="mt-4 grid gap-3">
                  <Select
                    label="Status da expedição"
                    value={currentStatus}
                    onChange={(v) =>
                      updateOrder(
                        order.id,
                        { logistic_status: v as UnifiedLogisticStatus },
                        "Status logístico atualizado."
                      )
                    }
                    options={LOGISTIC_OPTIONS.filter((o) => o.value !== "ENTREGUE")}
                  />

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Previsão de entrega
                    </label>
                    <input
                      type="date"
                      value={order.delivery_forecast ?? ""}
                      onChange={(e) =>
                        updateOrder(
                          order.id,
                          { delivery_forecast: e.target.value || null },
                          "Previsão de entrega atualizada."
                        )
                      }
                      disabled={saving}
                      className="h-11 w-full rounded-[18px] border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-300 disabled:bg-slate-50"
                    />
                    <div className="mt-2 text-xs text-slate-500">
                      Atual: {fmtDate(order.delivery_forecast)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-[18px] border border-cyan-100 bg-cyan-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
                    Fluxo rápido de entrega
                  </div>
                  <div className="mt-1 text-sm text-cyan-900">
                    Ao tocar em <b>Sair para entrega</b>, abre uma tela curta para preencher
                    motorista, enviar o link de rastreio e concluir a saída.
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <SecondaryActionButton
                    fullWidth
                    disabled={saving}
                    onClick={() => router.push(`/adm/expedicao/pedido/${order.id}`)}
                  >
                    Ver pedido
                  </SecondaryActionButton>

                  <SecondaryActionButton
                    fullWidth
                    disabled={saving}
                    onClick={() =>
                      updateOrder(
                        order.id,
                        { logistic_status: "RECEBIDO" },
                        "Pedido marcado como recebido."
                      )
                    }
                  >
                    Recebido
                  </SecondaryActionButton>

                  <PrimaryActionButton
                    tone="amber"
                    fullWidth
                    disabled={saving}
                    onClick={() =>
                      updateOrder(
                        order.id,
                        { logistic_status: "EM_SEPARACAO" },
                        "Pedido marcado como em separação."
                      )
                    }
                  >
                    Em separação
                  </PrimaryActionButton>

                  <PrimaryActionButton
                    fullWidth
                    disabled={saving || order.delivery_mode === "RETIRADA"}
                    onClick={() => openDeliveryFlow(order)}
                  >
                    Sair para entrega
                  </PrimaryActionButton>

                  <PrimaryActionButton
                    tone="green"
                    fullWidth
                    disabled={saving}
                    onClick={() =>
                      updateOrder(
                        order.id,
                        { logistic_status: "ENTREGUE" },
                        "Pedido marcado como entregue e removido da fila."
                      )
                    }
                  >
                    Entregue
                  </PrimaryActionButton>
                </div>

                {order.delivery_mode === "RETIRADA" ? (
                  <div className="mt-3 text-xs text-slate-500">
                    Pedido em retirada: a ação de rastreio/saída para entrega não se aplica.
                  </div>
                ) : null}

                {order.notes ? (
                  <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Observações
                    </div>
                    <div className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                      {order.notes}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}