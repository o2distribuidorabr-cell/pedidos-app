"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import L from "leaflet";
import PortalShell from "@/app/components/PortalShell";
import { PageHeader, Badge } from "@/app/components/ui";

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

type OrderRow = Record<string, unknown> & {
  id: string;
  store_id: string | null;
  status?: string | null;
  created_at?: string | null;
};

type ApiResponse = {
  ok: boolean;
  message?: string;
  order?: OrderRow | null;
  overview?: DeliveryOverviewRow | null;
  storeLabel?: string;
  confirmationCode?: string | null;
};

type Props = {
  params: Promise<{ id: string }>;
};

const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import("react-leaflet").then((m) => m.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import("react-leaflet").then((m) => m.Popup),
  { ssr: false }
);
const Circle = dynamic(
  () => import("react-leaflet").then((m) => m.Circle),
  { ssr: false }
);

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return String(value);
  }
}

function formatCoord(value: number | null | undefined) {
  if (value == null) return "-";
  return Number(value).toFixed(6);
}

function formatRelativeFromNow(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));

  if (diffSec < 5) return "agora";
  if (diffSec < 60) return `${diffSec}s atrás`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min atrás`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} h atrás`;

  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} dia(s) atrás`;
}

function getDeliveryLabel(status: DeliveryStatus) {
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

function getTrackingLabel(status: TrackingStatus | null) {
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

function getConfirmationLabel(status: ConfirmationStatus | null) {
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

function deliveryTone(status: DeliveryStatus) {
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

function trackingTone(status: TrackingStatus | null) {
  switch (status) {
    case "PENDENTE":
      return "blue" as const;
    case "ATIVO":
      return "green" as const;
    case "PAUSADO":
      return "yellow" as const;
    case "ENCERRADO":
      return "neutral" as const;
    default:
      return "neutral" as const;
  }
}

function confirmationTone(status: ConfirmationStatus | null) {
  switch (status) {
    case "PENDENTE":
      return "yellow" as const;
    case "CONFIRMADO":
      return "green" as const;
    case "EXPIRADO":
      return "red" as const;
    case "BLOQUEADO":
      return "red" as const;
    default:
      return "neutral" as const;
  }
}

function buildGoogleMapsOpenUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
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

function createCartIcon() {
  return L.divIcon({
    className: "custom-cart-marker",
    html: `
      <div style="
        width:40px;
        height:40px;
        border-radius:9999px;
        background:#0891b2;
        display:flex;
        align-items:center;
        justify-content:center;
        box-shadow:0 10px 24px rgba(8,145,178,0.35);
        border:3px solid white;
        font-size:20px;
      ">🛵</div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
}

function RecenterMap({
  center,
  followVehicle,
}: {
  center: [number, number];
  followVehicle: boolean;
}) {
  const { useMap } = require("react-leaflet") as typeof import("react-leaflet");
  const map = useMap();

  useEffect(() => {
    if (!followVehicle) return;
    map.flyTo(center, map.getZoom(), {
      animate: true,
      duration: 1.2,
    });
  }, [center, followVehicle, map]);

  return null;
}

export default function PedidoEntregaPage({ params }: Props) {
  const { id } = use(params);

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [overview, setOverview] = useState<DeliveryOverviewRow | null>(null);
  const [storeLabel, setStoreLabel] = useState("Sem loja");
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [followVehicle, setFollowVehicle] = useState(true);

  const showError = (text: string) => setMessage(text);
  const clearMessage = () => setMessage(null);

  const loadData = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        if (!isRefresh) clearMessage();

        const response = await fetch(`/api/logistica/order/${id}`, {
          method: "GET",
          cache: "no-store",
        });

        const data = (await response.json()) as ApiResponse;

        if (!response.ok || !data.ok) {
          throw new Error(data.message || "Erro ao carregar entrega.");
        }

        setOrder(data.order ?? null);
        setOverview(data.overview ?? null);
        setStoreLabel(data.storeLabel || "Sem loja");
        setConfirmationCode(data.confirmationCode ?? null);
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "Erro ao carregar entrega.";
        showError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id]
  );

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadData(true);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => window.clearInterval(tick);
  }, []);

  const lastLat = overview?.last_lat ?? null;
  const lastLng = overview?.last_lng ?? null;
  const lastAccuracy = overview?.last_accuracy ?? null;
  const lastSeenAt = overview?.last_seen_at ?? null;

  const hasMap = lastLat != null && lastLng != null;

  const center = useMemo<[number, number] | null>(() => {
    if (lastLat == null || lastLng == null) return null;
    return [lastLat, lastLng];
  }, [lastLat, lastLng]);

  const mapOpenUrl = useMemo(() => {
    if (lastLat == null || lastLng == null) return "";
    return buildGoogleMapsOpenUrl(lastLat, lastLng);
  }, [lastLat, lastLng]);

  const cartIcon = useMemo(() => createCartIcon(), []);

  const staleSeconds = useMemo(() => {
    if (!lastSeenAt) return null;
    const diff = Math.floor((nowTick - new Date(lastSeenAt).getTime()) / 1000);
    return Math.max(0, diff);
  }, [lastSeenAt, nowTick]);

  const isLive = useMemo(() => {
    if (staleSeconds === null) return false;
    return staleSeconds <= 10;
  }, [staleSeconds]);

  if (loading) {
    return (
      <PortalShell title="Pedidos" subtitle="Acompanhamento da entrega">
        <div className="space-y-6">
          <PageHeader
            title="Acompanhamento da entrega"
            subtitle="Carregando dados da entrega."
            right={
              <Link href={`/pedidos/${id}`}>
                <SecondaryActionButton>Voltar ao pedido</SecondaryActionButton>
              </Link>
            }
          />
          <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="text-sm text-slate-600">Carregando...</div>
          </div>
        </div>
      </PortalShell>
    );
  }

  if (!order) {
    return (
      <PortalShell title="Pedidos" subtitle="Acompanhamento da entrega">
        <div className="space-y-6">
          <PageHeader
            title="Acompanhamento da entrega"
            subtitle="Pedido não encontrado."
            right={
              <Link href="/pedidos">
                <SecondaryActionButton>Voltar</SecondaryActionButton>
              </Link>
            }
          />
          <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="rounded-[22px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Não foi possível localizar este pedido.
            </div>
          </div>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell title="Pedidos" subtitle="Acompanhamento da entrega">
      <div className="space-y-6">
        <PageHeader
          title={`Entrega do pedido ${id.slice(0, 8)}`}
          subtitle="Acompanhe o andamento da entrega em tempo real."
          right={
            <div className="flex flex-wrap gap-2">
              <SecondaryActionButton
                onClick={() => loadData(true)}
                disabled={refreshing}
              >
                {refreshing ? "Atualizando..." : "Atualizar"}
              </SecondaryActionButton>

              <SecondaryActionButton onClick={() => window.history.back()}>
                Voltar ao pedido
              </SecondaryActionButton>
            </div>
          }
        />

        {message ? (
          <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="rounded-[22px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {message}
            </div>
          </div>
        ) : null}

        <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={deliveryTone(overview?.delivery_status ?? "PENDENTE")}>
                  {getDeliveryLabel(overview?.delivery_status ?? "PENDENTE")}
                </Badge>

                <Badge tone={trackingTone(overview?.tracking_status ?? null)}>
                  {getTrackingLabel(overview?.tracking_status ?? null)}
                </Badge>

                <Badge tone={confirmationTone(overview?.confirmation_status ?? null)}>
                  {getConfirmationLabel(overview?.confirmation_status ?? null)}
                </Badge>

                <Badge tone={isLive ? "green" : "yellow"}>
                  {isLive ? "Ao vivo" : "Aguardando atualização"}
                </Badge>
              </div>

              <div className="mt-4 text-sm leading-7 text-slate-700">
                <div>
                  <span className="font-semibold text-slate-900">Loja:</span>{" "}
                  {storeLabel}
                </div>
                <div>
                  <span className="font-semibold text-slate-900">Saiu para entrega:</span>{" "}
                  {formatDateTime(overview?.delivery_started_at)}
                </div>
                <div>
                  <span className="font-semibold text-slate-900">Última atualização:</span>{" "}
                  {formatDateTime(lastSeenAt)}{" "}
                  {lastSeenAt ? `(${formatRelativeFromNow(lastSeenAt)})` : ""}
                </div>
                <div>
                  <span className="font-semibold text-slate-900">Entregue em:</span>{" "}
                  {formatDateTime(overview?.delivery_finished_at)}
                </div>
              </div>
            </div>

            <div className="w-full max-w-sm rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Confirmação da entrega
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-600">Código</span>
                  <span className="text-2xl font-semibold tracking-[-0.04em] text-slate-900">
                    {confirmationCode || "—"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-600">Status</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {getConfirmationLabel(overview?.confirmation_status ?? null)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-600">Expira em</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {formatDateTime(overview?.code_expires_at)}
                  </span>
                </div>

                <div className="h-px bg-slate-200" />

                <div className="text-xs text-slate-500">
                  Informe este código ao motorista no momento do recebimento.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <MetricCard
                title="Status da entrega"
                value={getDeliveryLabel(overview?.delivery_status ?? "PENDENTE")}
              />
              <MetricCard
                title="Rastreio"
                value={getTrackingLabel(overview?.tracking_status ?? null)}
              />
              <MetricCard
                title="Confirmação"
                value={getConfirmationLabel(overview?.confirmation_status ?? null)}
              />
              <MetricCard
                title="Última atualização"
                value={formatRelativeFromNow(lastSeenAt)}
                subtitle={formatDateTime(lastSeenAt)}
              />
            </div>

            <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Mapa da entrega</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Posição atual do motorista com atualização automática.
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <SecondaryActionButton
                    onClick={() => setFollowVehicle((prev) => !prev)}
                  >
                    {followVehicle ? "Seguindo veículo" : "Mapa livre"}
                  </SecondaryActionButton>

                  {mapOpenUrl ? (
                    <a href={mapOpenUrl} target="_blank" rel="noreferrer">
                      <SecondaryActionButton>
                        Abrir no Google Maps
                      </SecondaryActionButton>
                    </a>
                  ) : null}
                </div>
              </div>

              {center ? (
                <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200">
                  <div className="h-[480px] w-full">
                    <MapContainer
                      center={center}
                      zoom={16}
                      scrollWheelZoom
                      style={{ height: "100%", width: "100%" }}
                    >
                      <TileLayer
                        attribution='&copy; OpenStreetMap contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />

                      <RecenterMap
                        center={center}
                        followVehicle={followVehicle}
                      />

                      <Circle
                        center={center}
                        radius={Math.max(Number(lastAccuracy ?? 15), 8)}
                        pathOptions={{
                          color: "#0891b2",
                          fillColor: "#22d3ee",
                          fillOpacity: 0.18,
                        }}
                      />

                      <Marker position={center} icon={cartIcon}>
                        <Popup>
                          <div className="text-sm">
                            <div className="font-semibold">Entrega em andamento</div>
                            <div className="mt-1">
                              Última atualização: {formatDateTime(lastSeenAt)}
                            </div>
                            <div>
                              Precisão: {lastAccuracy ?? "—"}
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    </MapContainer>
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 p-8 text-sm text-slate-500">
                  Ainda não há localização disponível para esta entrega.
                </div>
              )}
            </div>

            <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <div className="text-sm font-semibold text-slate-900">
                Linha do tempo da entrega
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Acompanhamento resumido da operação.
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Pedido criado
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {formatDateTime(overview?.order_created_at)}
                  </div>
                </div>

                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Saiu para entrega
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {formatDateTime(overview?.delivery_started_at)}
                  </div>
                </div>

                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Última atualização
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {formatDateTime(lastSeenAt)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {formatRelativeFromNow(lastSeenAt)}
                  </div>
                </div>

                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Entrega finalizada
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {formatDateTime(overview?.delivery_finished_at)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="xl:sticky xl:top-24">
              <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfd_100%)] p-5 shadow-sm md:p-6">
                <div className="text-lg font-semibold tracking-[-0.02em] text-slate-900">
                  Ações
                </div>

                <div className="mt-1 text-sm text-slate-600">
                  Acompanhamento rápido da entrega.
                </div>

                <div className="mt-6 grid gap-3">
                  <SecondaryActionButton
                    onClick={() => loadData(true)}
                    disabled={refreshing}
                  >
                    {refreshing ? "Atualizando..." : "Atualizar entrega"}
                  </SecondaryActionButton>

                  <SecondaryActionButton onClick={() => window.history.back()}>
                    Voltar ao pedido
                  </SecondaryActionButton>

                  <PrimaryActionButton
                    onClick={() => setFollowVehicle(true)}
                    disabled={!hasMap}
                  >
                    Centralizar no veículo
                  </PrimaryActionButton>
                </div>

                <div className="mt-6 rounded-[22px] border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Motorista
                  </div>

                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <span>Nome</span>
                      <span className="font-semibold text-slate-900">
                        {overview?.delivery_driver_name || "Não informado"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span>Telefone</span>
                      <span className="font-semibold text-slate-900">
                        {overview?.delivery_driver_phone || "—"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Posição atual
                  </div>

                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <span>Latitude</span>
                      <span className="font-semibold text-slate-900">
                        {formatCoord(lastLat)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span>Longitude</span>
                      <span className="font-semibold text-slate-900">
                        {formatCoord(lastLng)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span>Precisão</span>
                      <span className="font-semibold text-slate-900">
                        {lastAccuracy ?? "—"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span>Atualizado</span>
                      <span className="font-semibold text-slate-900">
                        {formatRelativeFromNow(lastSeenAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Código de confirmação
                  </div>

                  <div className="mt-3">
                    <div className="text-3xl font-semibold tracking-[-0.04em] text-slate-900">
                      {confirmationCode || "—"}
                    </div>
                    <div className="mt-2 text-sm text-slate-600">
                      Mostre este código ao motorista para concluir a entrega.
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Atualização automática
                  </div>

                  <div className="mt-3 text-sm text-slate-600">
                    Esta tela atualiza a cada 3 segundos com a última posição enviada pelo motorista.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}