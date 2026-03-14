"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { PageHeader, Input, Select, Badge } from "@/app/components/ui";

type DeliveryStatus =
  | "PENDENTE"
  | "EM_SEPARACAO"
  | "SAIU_PARA_ENTREGA"
  | "ENTREGUE"
  | "OCORRENCIA";

type TrackingStatus = "PENDENTE" | "ATIVO" | "PAUSADO" | "ENCERRADO";

type ConfirmationStatus = "PENDENTE" | "CONFIRMADO" | "EXPIRADO" | "BLOQUEADO";

type DeliveryOverviewRow = {
  order_id: string;
  store_id: string | null;
  order_status: string | null;
  order_created_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;

  delivery_status: DeliveryStatus;
  delivery_driver_name: string | null;
  delivery_driver_phone: string | null;
  delivery_started_at: string | null;
  delivery_finished_at: string | null;
  delivery_notes: string | null;

  tracking_session_id: string | null;
  tracking_status: TrackingStatus | null;
  tracking_token: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_accuracy: number | null;
  last_seen_at: string | null;
  tracking_started_at: string | null;
  tracking_ended_at: string | null;

  confirmation_id: string | null;
  confirmation_status: ConfirmationStatus | null;
  attempts: number | null;
  max_attempts: number | null;
  code_sent_at: string | null;
  code_expires_at: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
};

type StoreRow = {
  id: string;
  [key: string]: unknown;
};

const DELIVERY_STATUS_OPTIONS: Array<{
  value: "TODOS" | DeliveryStatus;
  label: string;
}> = [
  { value: "TODOS", label: "Todos os status" },
  { value: "PENDENTE", label: "Pendente" },
  { value: "EM_SEPARACAO", label: "Em separação" },
  { value: "SAIU_PARA_ENTREGA", label: "Saiu para entrega" },
  { value: "ENTREGUE", label: "Entregue" },
  { value: "OCORRENCIA", label: "Ocorrência" },
];

const SORT_OPTIONS = [
  { value: "recentes", label: "Mais recentes" },
  { value: "saida_entrega", label: "Saída para entrega" },
  { value: "ultima_atualizacao", label: "Última atualização" },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]["value"];

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatPhone(value: string | null | undefined) {
  if (!value) return "—";
  return value;
}

function truncateText(value: string | null | undefined, max = 60) {
  if (!value) return "—";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function getStoreNameFromRow(store: StoreRow): string {
  const possibleKeys = [
    "name",
    "title",
    "store",
    "loja",
    "fantasy_name",
    "display_name",
    "label",
    "description",
    "codigo",
    "code",
  ];

  for (const key of possibleKeys) {
    const value = store[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return store.id;
}

function getStoreLabel(
  row: DeliveryOverviewRow,
  storesMap: Record<string, string>
): string {
  if (!row.store_id) return "Sem loja";
  return storesMap[row.store_id] ?? row.store_id;
}

function getDeliveryStatusLabel(status: DeliveryStatus) {
  switch (status) {
    case "PENDENTE":
      return "Pendente";
    case "EM_SEPARACAO":
      return "Em separação";
    case "SAIU_PARA_ENTREGA":
      return "Saiu para entrega";
    case "ENTREGUE":
      return "Entregue";
    case "OCORRENCIA":
      return "Ocorrência";
    default:
      return status;
  }
}

function getTrackingStatusLabel(status: TrackingStatus | null) {
  switch (status) {
    case "PENDENTE":
      return "Pendente";
    case "ATIVO":
      return "Ativo";
    case "PAUSADO":
      return "Pausado";
    case "ENCERRADO":
      return "Encerrado";
    default:
      return "—";
  }
}

function getConfirmationStatusLabel(status: ConfirmationStatus | null) {
  switch (status) {
    case "PENDENTE":
      return "Pendente";
    case "CONFIRMADO":
      return "Confirmado";
    case "EXPIRADO":
      return "Expirado";
    case "BLOQUEADO":
      return "Bloqueado";
    default:
      return "—";
  }
}

function statusBadgeTone(status: DeliveryStatus) {
  switch (status) {
    case "PENDENTE":
      return "neutral" as const;
    case "EM_SEPARACAO":
      return "yellow" as const;
    case "SAIU_PARA_ENTREGA":
      return "blue" as const;
    case "ENTREGUE":
      return "green" as const;
    case "OCORRENCIA":
      return "red" as const;
    default:
      return "neutral" as const;
  }
}

function trackingBadgeTone(status: TrackingStatus | null) {
  switch (status) {
    case "ATIVO":
      return "green" as const;
    case "PAUSADO":
      return "yellow" as const;
    case "ENCERRADO":
      return "neutral" as const;
    case "PENDENTE":
      return "blue" as const;
    default:
      return "neutral" as const;
  }
}

function confirmationBadgeTone(status: ConfirmationStatus | null) {
  switch (status) {
    case "CONFIRMADO":
      return "green" as const;
    case "PENDENTE":
      return "yellow" as const;
    case "EXPIRADO":
      return "red" as const;
    case "BLOQUEADO":
      return "red" as const;
    default:
      return "neutral" as const;
  }
}

function getSortTime(row: DeliveryOverviewRow, sortBy: SortOption) {
  if (sortBy === "saida_entrega") {
    return row.delivery_started_at
      ? new Date(row.delivery_started_at).getTime()
      : 0;
  }

  if (sortBy === "ultima_atualizacao") {
    return row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
  }

  return row.order_created_at ? new Date(row.order_created_at).getTime() : 0;
}

function PrimaryActionButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-12 items-center justify-center rounded-[18px] bg-cyan-600 px-5 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(8,145,178,0.26)] transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function SecondaryActionButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-12 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900">
        {value}
      </div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

export default function AdmLogisticaPage() {
  const [rows, setRows] = useState<DeliveryOverviewRow[]>([]);
  const [storesMap, setStoresMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<"TODOS" | DeliveryStatus>("TODOS");
  const [sortBy, setSortBy] = useState<SortOption>("recentes");

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      setError(null);

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const { data: logisticsData, error: logisticsError } = await supabase
        .from("vw_order_delivery_overview")
        .select("*")
        .order("order_created_at", { ascending: false });

      if (logisticsError) {
        throw new Error(logisticsError.message);
      }

      const safeRows = (logisticsData ?? []) as DeliveryOverviewRow[];
      setRows(safeRows);

      const storeIds = Array.from(
        new Set(
          safeRows
            .map((item) => item.store_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      if (storeIds.length === 0) {
        setStoresMap({});
        return;
      }

      const { data: storesData, error: storesError } = await supabase
        .from("stores")
        .select("*")
        .in("id", storeIds);

      if (storesError) {
        throw new Error(storesError.message);
      }

      const map: Record<string, string> = {};
      for (const store of (storesData ?? []) as StoreRow[]) {
        map[store.id] = getStoreNameFromRow(store);
      }

      setStoresMap(map);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao carregar logística.";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    let result = [...rows];

    if (statusFilter !== "TODOS") {
      result = result.filter((row) => row.delivery_status === statusFilter);
    }

    if (normalizedSearch) {
      result = result.filter((row) => {
        const storeLabel = getStoreLabel(row, storesMap).toLowerCase();
        const driverName = row.delivery_driver_name?.toLowerCase() ?? "";
        const driverPhone = row.delivery_driver_phone?.toLowerCase() ?? "";
        const orderId = row.order_id.toLowerCase();
        const deliveryNotes = row.delivery_notes?.toLowerCase() ?? "";

        return (
          orderId.includes(normalizedSearch) ||
          storeLabel.includes(normalizedSearch) ||
          driverName.includes(normalizedSearch) ||
          driverPhone.includes(normalizedSearch) ||
          deliveryNotes.includes(normalizedSearch)
        );
      });
    }

    result.sort((a, b) => getSortTime(b, sortBy) - getSortTime(a, sortBy));

    return result;
  }, [rows, search, statusFilter, sortBy, storesMap]);

  const metrics = useMemo(() => {
    const total = rows.length;
    const pendentes = rows.filter((r) => r.delivery_status === "PENDENTE").length;
    const separacao = rows.filter((r) => r.delivery_status === "EM_SEPARACAO").length;
    const emRota = rows.filter((r) => r.delivery_status === "SAIU_PARA_ENTREGA").length;
    const entregues = rows.filter((r) => r.delivery_status === "ENTREGUE").length;
    const ocorrencias = rows.filter((r) => r.delivery_status === "OCORRENCIA").length;

    return { total, pendentes, separacao, emRota, entregues, ocorrencias };
  }, [rows]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Logística"
        subtitle="Acompanhe separação, saída para entrega, rastreio e confirmação das entregas."
        right={
          <div className="flex flex-wrap gap-2">
            <PrimaryActionButton
              onClick={() => loadData(true)}
              disabled={loading || refreshing}
            >
              {refreshing ? "Atualizando..." : "Atualizar"}
            </PrimaryActionButton>

            <Link href="/adm/pedidos">
              <SecondaryActionButton>
                Voltar para pedidos
              </SecondaryActionButton>
            </Link>
          </div>
        }
      />

      <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue">Rastreamento ativo</Badge>
              <Badge tone="neutral">Painel operacional</Badge>
            </div>

            <div className="mt-4 text-sm leading-7 text-slate-700">
              <div>
                <span className="font-semibold text-slate-900">Pedidos monitorados:</span>{" "}
                {metrics.total}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Em rota:</span>{" "}
                {metrics.emRota}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Entregues:</span>{" "}
                {metrics.entregues}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Ocorrências:</span>{" "}
                {metrics.ocorrencias}
              </div>
            </div>
          </div>

          <div className="w-full max-w-sm rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Resumo rápido
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-600">Pendentes</span>
                <span className="text-sm font-semibold text-slate-900">
                  {metrics.pendentes}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-600">Em separação</span>
                <span className="text-sm font-semibold text-slate-900">
                  {metrics.separacao}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-600">Em rota</span>
                <span className="text-sm font-semibold text-slate-900">
                  {metrics.emRota}
                </span>
              </div>

              <div className="h-px bg-slate-200" />

              <div className="flex items-end justify-between gap-3">
                <span className="text-sm font-semibold text-slate-900">Entregues</span>
                <span className="text-2xl font-semibold tracking-[-0.03em] text-slate-900">
                  {metrics.entregues}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard title="Total" value={String(metrics.total)} />
        <MetricCard title="Pendentes" value={String(metrics.pendentes)} />
        <MetricCard title="Em separação" value={String(metrics.separacao)} />
        <MetricCard title="Em rota" value={String(metrics.emRota)} />
        <MetricCard title="Entregues" value={String(metrics.entregues)} />
        <MetricCard title="Ocorrências" value={String(metrics.ocorrencias)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Filtros
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Busque pedidos e refine a operação logística.
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="lg:col-span-6">
                <Input
                  label="Buscar"
                  value={search}
                  onChange={setSearch}
                  placeholder="Pedido, loja, motorista, telefone ou observação"
                />
              </div>

              <div className="lg:col-span-3">
                <Select
                  label="Status logístico"
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v as "TODOS" | DeliveryStatus)}
                  options={DELIVERY_STATUS_OPTIONS}
                />
              </div>

              <div className="lg:col-span-3">
                <Select
                  label="Ordenação"
                  value={sortBy}
                  onChange={(v) => setSortBy(v as SortOption)}
                  options={SORT_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                />
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Pedidos logísticos ({filteredRows.length})
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Lista consolidada das entregas em acompanhamento.
                </div>
              </div>
            </div>

            {loading ? (
              <div className="mt-6 text-sm text-slate-600">Carregando logística...</div>
            ) : error ? (
              <div className="mt-6 rounded-[22px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="mt-6 text-sm text-slate-600">
                Nenhum pedido encontrado com os filtros informados.
              </div>
            ) : (
              <>
                <div className="mt-6 hidden overflow-x-auto lg:block">
                  <table className="w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left text-xs text-slate-600">
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                          Pedido
                        </th>
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                          Loja
                        </th>
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                          Status entrega
                        </th>
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                          Motorista
                        </th>
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                          Rastreio
                        </th>
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                          Código
                        </th>
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                          Última atualização
                        </th>
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-right">
                          Ações
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredRows.map((row) => (
                        <tr key={row.order_id} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top">
                            <div className="font-semibold text-slate-900">
                              {row.order_id.slice(0, 8)}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              Criado em {formatDateTime(row.order_created_at)}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              Pedido: {row.order_status ?? "—"}
                            </div>
                          </td>

                          <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top">
                            <div className="font-semibold text-slate-900">
                              {getStoreLabel(row, storesMap)}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              Store ID: {row.store_id ?? "—"}
                            </div>
                          </td>

                          <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top">
                            <Badge tone={statusBadgeTone(row.delivery_status)}>
                              {getDeliveryStatusLabel(row.delivery_status)}
                            </Badge>

                            <div className="mt-2 text-xs text-slate-500">
                              Saída: {formatDateTime(row.delivery_started_at)}
                            </div>

                            <div className="mt-1 text-xs text-slate-500">
                              Finalização: {formatDateTime(row.delivery_finished_at)}
                            </div>
                          </td>

                          <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top">
                            <div className="font-semibold text-slate-900">
                              {row.delivery_driver_name || "Não informado"}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {formatPhone(row.delivery_driver_phone)}
                            </div>
                            <div className="mt-2 text-xs text-slate-500">
                              {truncateText(row.delivery_notes, 42)}
                            </div>
                          </td>

                          <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top">
                            <Badge tone={trackingBadgeTone(row.tracking_status)}>
                              {getTrackingStatusLabel(row.tracking_status)}
                            </Badge>

                            <div className="mt-2 text-xs text-slate-500">
                              Token: {row.tracking_token ? "Gerado" : "—"}
                            </div>

                            <div className="mt-1 text-xs text-slate-500">
                              Última posição:{" "}
                              {row.last_lat !== null && row.last_lng !== null
                                ? `${row.last_lat.toFixed(5)}, ${row.last_lng.toFixed(5)}`
                                : "—"}
                            </div>
                          </td>

                          <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top">
                            <Badge tone={confirmationBadgeTone(row.confirmation_status)}>
                              {getConfirmationStatusLabel(row.confirmation_status)}
                            </Badge>

                            <div className="mt-2 text-xs text-slate-500">
                              Tentativas: {row.attempts ?? 0}
                              {row.max_attempts ? ` / ${row.max_attempts}` : ""}
                            </div>

                            <div className="mt-1 text-xs text-slate-500">
                              Expira em: {formatDateTime(row.code_expires_at)}
                            </div>
                          </td>

                          <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top">
                            <div className="text-sm font-semibold text-slate-900">
                              {formatDateTime(row.last_seen_at)}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              Confirmado em: {formatDateTime(row.confirmed_at)}
                            </div>
                          </td>

                          <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top text-right">
                            <Link href={`/adm/logistica/${row.order_id}`}>
                              <SecondaryActionButton>
                                Abrir
                              </SecondaryActionButton>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 lg:hidden">
                  {filteredRows.map((row) => (
                    <div
                      key={row.order_id}
                      className="rounded-[24px] border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">
                            Pedido {row.order_id.slice(0, 8)}
                          </div>
                          <div className="mt-1 text-sm text-slate-500">
                            {getStoreLabel(row, storesMap)}
                          </div>
                        </div>

                        <Badge tone={statusBadgeTone(row.delivery_status)}>
                          {getDeliveryStatusLabel(row.delivery_status)}
                        </Badge>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 text-sm">
                        <div>
                          <div className="text-slate-500">Motorista</div>
                          <div className="font-semibold text-slate-900">
                            {row.delivery_driver_name || "Não informado"}
                          </div>
                          <div className="text-slate-500">
                            {formatPhone(row.delivery_driver_phone)}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-slate-500">Rastreio</div>
                            <div className="mt-1">
                              <Badge tone={trackingBadgeTone(row.tracking_status)}>
                                {getTrackingStatusLabel(row.tracking_status)}
                              </Badge>
                            </div>
                          </div>

                          <div>
                            <div className="text-slate-500">Código</div>
                            <div className="mt-1">
                              <Badge tone={confirmationBadgeTone(row.confirmation_status)}>
                                {getConfirmationStatusLabel(row.confirmation_status)}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2 text-xs text-slate-500">
                          <div>Criado em: {formatDateTime(row.order_created_at)}</div>
                          <div>Saída: {formatDateTime(row.delivery_started_at)}</div>
                          <div>Última atualização: {formatDateTime(row.last_seen_at)}</div>
                          <div>Finalização: {formatDateTime(row.delivery_finished_at)}</div>
                        </div>

                        <div className="pt-2">
                          <Link href={`/adm/logistica/${row.order_id}`}>
                            <PrimaryActionButton>
                              Abrir logística
                            </PrimaryActionButton>
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div>
          <div className="xl:sticky xl:top-24">
            <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfd_100%)] p-5 shadow-sm md:p-6">
              <div className="text-lg font-semibold tracking-[-0.02em] text-slate-900">
                Ações
              </div>

              <div className="mt-1 text-sm text-slate-600">
                Navegação rápida da logística.
              </div>

              <div className="mt-6 grid gap-3">
                <PrimaryActionButton
                  onClick={() => loadData(true)}
                  disabled={loading || refreshing}
                >
                  {refreshing ? "Atualizando..." : "Atualizar painel"}
                </PrimaryActionButton>

                <Link href="/adm/pedidos">
                  <SecondaryActionButton>
                    Voltar para pedidos
                  </SecondaryActionButton>
                </Link>
              </div>

              <div className="mt-6 rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Situação
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone="neutral">Total: {metrics.total}</Badge>
                  <Badge tone="yellow">Separação: {metrics.separacao}</Badge>
                  <Badge tone="blue">Em rota: {metrics.emRota}</Badge>
                  <Badge tone="green">Entregues: {metrics.entregues}</Badge>
                </div>
              </div>

              <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Filtros ativos
                </div>

                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <div className="flex items-center justify-between gap-3">
                    <span>Status</span>
                    <span className="font-semibold text-slate-900">
                      {statusFilter === "TODOS"
                        ? "Todos"
                        : getDeliveryStatusLabel(statusFilter)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Ordenação</span>
                    <span className="font-semibold text-slate-900">
                      {SORT_OPTIONS.find((item) => item.value === sortBy)?.label ?? "—"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Busca</span>
                    <span className="max-w-[140px] truncate font-semibold text-slate-900">
                      {search || "Sem filtro"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Observação
                </div>

                <div className="mt-3 text-sm text-slate-600">
                  Use este painel para localizar rapidamente pedidos em separação, em rota, entregues e com ocorrência.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}