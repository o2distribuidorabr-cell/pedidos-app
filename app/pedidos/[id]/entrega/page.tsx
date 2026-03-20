"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import L from "leaflet";
import PortalShell from "@/app/components/PortalShell";
import { PageHeader, Badge } from "@/app/components/ui";

type DeliveryStatus = "PENDENTE" | "EM_SEPARACAO" | "SAIU_PARA_ENTREGA" | "ENTREGUE" | "OCORRENCIA";
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

type RouteInfo = {
  routeId: string;
  stopOrder: number;
  totalStops: number;
  stopStatus: string;
  codeExpiresAt: string | null;
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
  routeInfo?: RouteInfo | null;
  lalamoveShareLink?: string | null;
  store?: { address_lat?: number | null; address_lng?: number | null; address?: string | null; name?: string | null } | null;
  confirmationMeta?: {
    status: string | null;
    confirmedAt: string | null;
    confirmedBy: string | null;
    expiresAt: string | null;
    attempts: number | null;
    maxAttempts: number | null;
  } | null;
};

type Props = {
  params: Promise<{ id: string }>;
};

const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then((m) => m.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false });
const Circle = dynamic(() => import("react-leaflet").then((m) => m.Circle), { ssr: false });

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  try { return new Date(value).toLocaleString("pt-BR"); } catch { return String(value); }
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
  return `${Math.floor(diffHour / 24)} dia(s) atrás`;
}

function getDeliveryLabel(status: DeliveryStatus) {
  const map: Record<DeliveryStatus, string> = { PENDENTE: "Pendente", EM_SEPARACAO: "Em separação", SAIU_PARA_ENTREGA: "Saiu para entrega", ENTREGUE: "Entregue", OCORRENCIA: "Ocorrência" };
  return map[status] ?? status;
}

function getTrackingLabel(status: TrackingStatus | null) {
  if (!status) return "—";
  const map: Record<TrackingStatus, string> = { PENDENTE: "Pendente", ATIVO: "Ativo", PAUSADO: "Pausado", ENCERRADO: "Encerrado" };
  return map[status];
}

function getConfirmationLabel(status: ConfirmationStatus | null) {
  if (!status) return "—";
  const map: Record<ConfirmationStatus, string> = { PENDENTE: "Pendente", CONFIRMADO: "Confirmado", EXPIRADO: "Expirado", BLOQUEADO: "Bloqueado" };
  return map[status];
}

function deliveryTone(status: DeliveryStatus) {
  const map: Record<DeliveryStatus, "neutral" | "yellow" | "blue" | "green" | "red"> = { PENDENTE: "neutral", EM_SEPARACAO: "yellow", SAIU_PARA_ENTREGA: "blue", ENTREGUE: "green", OCORRENCIA: "red" };
  return map[status] ?? "neutral";
}

function trackingTone(status: TrackingStatus | null) {
  if (!status) return "neutral" as const;
  const map: Record<TrackingStatus, "blue" | "green" | "yellow" | "neutral"> = { PENDENTE: "blue", ATIVO: "green", PAUSADO: "yellow", ENCERRADO: "neutral" };
  return map[status];
}

function confirmationTone(status: ConfirmationStatus | null) {
  if (!status) return "neutral" as const;
  const map: Record<ConfirmationStatus, "yellow" | "green" | "red" | "neutral"> = { PENDENTE: "yellow", CONFIRMADO: "green", EXPIRADO: "red", BLOQUEADO: "red" };
  return map[status];
}

function buildGoogleMapsOpenUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function PrimaryActionButton({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="inline-flex h-12 items-center justify-center rounded-[18px] bg-cyan-600 px-5 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(8,145,178,0.26)] transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50">
      {children}
    </button>
  );
}

function SecondaryActionButton({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="inline-flex h-12 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
      {children}
    </button>
  );
}

function MetricCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string; }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900">{value}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

function createCartIcon() {
  return L.divIcon({
    className: "custom-cart-marker",
    html: `<div style="width:40px;height:40px;border-radius:9999px;background:#0891b2;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 24px rgba(8,145,178,0.35);border:3px solid white;font-size:20px;">🛵</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
}

function createPinIcon(emoji = "📍", bg = "#16a34a") {
  return L.divIcon({
    className: "custom-pin-marker",
    html: `<div style="width:36px;height:36px;border-radius:9999px;background:${bg};display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(0,0,0,0.25);border:3px solid white;font-size:18px;">${emoji}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
}

function RecenterMap({ center, followVehicle }: { center: [number, number]; followVehicle: boolean; }) {
  const { useMap } = require("react-leaflet") as typeof import("react-leaflet");
  const map = useMap();
  useEffect(() => {
    if (!followVehicle) return;
    map.flyTo(center, map.getZoom(), { animate: true, duration: 1.2 });
  }, [center, followVehicle, map]);
  return null;
}

export default function PedidoEntregaPage({ params }: Props) {
  const { id } = use(params);

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [overview, setOverview] = useState<DeliveryOverviewRow | null>(null);
  const [storeLabel, setStoreLabel] = useState("Sem loja");
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [storeCoords, setStoreCoords] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [confirmationMeta, setConfirmationMeta] = useState<ApiResponse["confirmationMeta"]>(null);
  const [deliveryMode, setDeliveryMode] = useState<string | null>(null);
  const [pickupCode, setPickupCode] = useState("");
  const [pickupConfirming, setPickupConfirming] = useState(false);
  const [pickupMessage, setPickupMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [followVehicle, setFollowVehicle] = useState(true);

  const showError = (text: string) => setMessage(text);
  const clearMessage = () => setMessage(null);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      if (!isRefresh) clearMessage();

      const response = await fetch(`/api/logistica/order/${id}`, { method: "GET", cache: "no-store" });
      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.ok) throw new Error(data.message || "Erro ao carregar entrega.");

      setOrder(data.order ?? null);
      setOverview(data.overview ?? null);
      setStoreLabel(data.storeLabel || "Sem loja");
      setConfirmationCode(data.confirmationCode ?? null);
      setRouteInfo(data.routeInfo ?? null);
      setConfirmationMeta(data.confirmationMeta ?? null);
      setDeliveryMode((data.order as any)?.delivery_mode ?? null);
      // Coordenadas da loja para marcador de entrega
      if (data.store?.address_lat && data.store?.address_lng) {
        setStoreCoords({
          lat: Number(data.store.address_lat),
          lng: Number(data.store.address_lng),
          address: data.store.address ?? data.store.name ?? "Ponto de entrega",
        });
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : "Erro ao carregar entrega.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { loadData(false); }, [loadData]);
  useEffect(() => { const i = window.setInterval(() => loadData(true), 3000); return () => window.clearInterval(i); }, [loadData]);
  useEffect(() => { const t = window.setInterval(() => setNowTick(Date.now()), 1000); return () => window.clearInterval(t); }, []);

  const lastLat = overview?.last_lat ?? null;
  const lastLng = overview?.last_lng ?? null;
  const lastAccuracy = overview?.last_accuracy ?? null;
  const lastSeenAt = overview?.last_seen_at ?? null;
  const hasMap = lastLat != null && lastLng != null;
  const center = useMemo<[number, number] | null>(() => lastLat && lastLng ? [lastLat, lastLng] : null, [lastLat, lastLng]);
  const mapOpenUrl = useMemo(() => lastLat && lastLng ? buildGoogleMapsOpenUrl(lastLat, lastLng) : "", [lastLat, lastLng]);
  const cartIcon = useMemo(() => createCartIcon(), []);
  const pickupIcon = useMemo(() => createPinIcon("🏭", "#f59e0b"), []);
  const dropoffIcon = useMemo(() => createPinIcon("🏪", "#16a34a"), []);

  // Pickup: coordenadas fixas do centro de distribuição
  const PICKUP_LAT = -19.9704199;
  const PICKUP_LNG = -44.0547074;
  const PICKUP_ADDRESS = "Rua Coronel Salvador Fernandes, 222, Bandeirantes, Contagem, MG";

  const staleSeconds = useMemo(() => {
    if (!lastSeenAt) return null;
    return Math.max(0, Math.floor((nowTick - new Date(lastSeenAt).getTime()) / 1000));
  }, [lastSeenAt, nowTick]);

  const isLive = useMemo(() => staleSeconds !== null && staleSeconds <= 10, [staleSeconds]);

  // Determina o código e status de confirmação corretos
  const isMultiStop = !!routeInfo;
  const codeExpiresAt = isMultiStop ? routeInfo!.codeExpiresAt : overview?.code_expires_at ?? null;
  const stopConfirmed = isMultiStop && routeInfo!.stopStatus === "CONFIRMADO";

  // Confirma retirada pelo franqueado
  async function handlePickupConfirm() {
    if (!pickupCode.trim()) {
      setPickupMessage({ text: "Digite o código de retirada.", ok: false });
      return;
    }
    setPickupConfirming(true);
    setPickupMessage(null);
    try {
      const response = await fetch(`/api/logistica/order/${id}/confirmar-retirada`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: pickupCode.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setPickupMessage({ text: data.message || "Código inválido.", ok: false });
      } else {
        setPickupMessage({ text: "✅ Retirada confirmada com sucesso!", ok: true });
        setPickupCode("");
        loadData(true);
      }
    } catch {
      setPickupMessage({ text: "Erro ao confirmar retirada.", ok: false });
    } finally {
      setPickupConfirming(false);
    }
  }

  const isPickup = deliveryMode === "RETIRADA";
  const isPickupConfirmed = overview?.delivery_status === "ENTREGUE" && isPickup;
  const isDeliveryConfirmed = confirmationMeta?.status === "CONFIRMADO";

  if (loading) {
    return (
      <PortalShell title="Pedidos" subtitle="Acompanhamento da entrega">
        <div className="space-y-6">
          <PageHeader title="Acompanhamento da entrega" subtitle="Carregando dados da entrega."
            right={<Link href={`/pedidos/${id}`}><SecondaryActionButton>Voltar ao pedido</SecondaryActionButton></Link>} />
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
          <PageHeader title="Acompanhamento da entrega" subtitle="Pedido não encontrado."
            right={<Link href="/pedidos"><SecondaryActionButton>Voltar</SecondaryActionButton></Link>} />
          <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="rounded-[22px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">Não foi possível localizar este pedido.</div>
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
              <SecondaryActionButton onClick={() => loadData(true)} disabled={refreshing}>
                {refreshing ? "Atualizando..." : "Atualizar"}
              </SecondaryActionButton>
              <SecondaryActionButton onClick={() => window.history.back()}>Voltar ao pedido</SecondaryActionButton>
            </div>
          }
        />

        {message ? (
          <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="rounded-[22px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</div>
          </div>
        ) : null}

        {/* Card principal com status e código */}
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
                {!isMultiStop ? (
                  <Badge tone={confirmationTone(overview?.confirmation_status ?? null)}>
                    {getConfirmationLabel(overview?.confirmation_status ?? null)}
                  </Badge>
                ) : (
                  <Badge tone={stopConfirmed ? "green" : "yellow"}>
                    {stopConfirmed ? "Entrega confirmada" : "Aguardando confirmação"}
                  </Badge>
                )}
                <Badge tone={isLive ? "green" : "yellow"}>
                  {isLive ? "Ao vivo" : "Aguardando atualização"}
                </Badge>
                {isMultiStop ? (
                  <Badge tone="blue">
                    Parada {routeInfo!.stopOrder} de {routeInfo!.totalStops}
                  </Badge>
                ) : null}
              </div>

              <div className="mt-4 text-sm leading-7 text-slate-700">
                <div><span className="font-semibold text-slate-900">Loja:</span> {storeLabel}</div>
                <div><span className="font-semibold text-slate-900">Saiu para entrega:</span> {formatDateTime(overview?.delivery_started_at)}</div>
                <div><span className="font-semibold text-slate-900">Última atualização:</span> {formatDateTime(lastSeenAt)} {lastSeenAt ? `(${formatRelativeFromNow(lastSeenAt)})` : ""}</div>
                <div><span className="font-semibold text-slate-900">Entregue em:</span> {formatDateTime(overview?.delivery_finished_at)}</div>
              </div>
            </div>

            {/* Card de confirmação — diferente para retirada e entrega */}
            <div className="w-full max-w-sm rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              {isPickup ? (
                /* RETIRADA: franqueado digita o código para confirmar */
                isPickupConfirmed ? (
                  <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Retirada confirmada</div>
                    <div className="rounded-[18px] border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                      ✅ Retirada confirmada em {formatDateTime(confirmationMeta?.confirmedAt ?? overview?.delivery_finished_at)}
                    </div>
                    <div className="text-xs text-slate-500">Obrigado por confirmar o recebimento do seu pedido.</div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confirmar retirada</div>
                    <div className="text-sm text-slate-600">Digite o código que foi informado pela distribuidora para confirmar a retirada do seu pedido.</div>
                    <input
                      type="text"
                      value={pickupCode}
                      onChange={(e) => setPickupCode(e.target.value.toUpperCase())}
                      placeholder="Digite o código"
                      maxLength={8}
                      className="h-12 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 text-center text-xl font-semibold tracking-[0.2em] text-slate-900 outline-none transition focus:border-cyan-300 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                    />
                    {pickupMessage ? (
                      <div className={`rounded-[14px] border p-3 text-sm font-semibold ${pickupMessage.ok ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                        {pickupMessage.text}
                      </div>
                    ) : null}
                    <button type="button" onClick={handlePickupConfirm} disabled={pickupConfirming || !pickupCode.trim()}
                      className="inline-flex h-12 w-full items-center justify-center rounded-[18px] bg-cyan-600 px-5 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(8,145,178,0.26)] transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50">
                      {pickupConfirming ? "Confirmando..." : "Confirmar retirada"}
                    </button>
                  </div>
                )
              ) : isMultiStop ? (
                /* ROTA MÚLTIPLA */
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Código da parada {routeInfo!.stopOrder}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-600">Código</span>
                    <span className="text-2xl font-semibold tracking-[-0.04em] text-slate-900">{confirmationCode || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-600">Status</span>
                    <span className="text-sm font-semibold text-slate-900">{stopConfirmed ? "✅ Confirmado" : "Aguardando"}</span>
                  </div>
                  <div className="h-px bg-slate-200" />
                  <div className="text-xs text-slate-500">
                    {stopConfirmed ? "Esta parada já foi confirmada." : "Informe este código ao motorista no momento do recebimento."}
                  </div>
                </div>
              ) : (
                /* ENTREGA (FRETE): só mostra se foi confirmado — nunca mostra o código */
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confirmação da entrega</div>
                  {isDeliveryConfirmed ? (
                    <div className="rounded-[18px] border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                      ✅ Entrega confirmada em {formatDateTime(confirmationMeta?.confirmedAt)}
                    </div>
                  ) : (
                    <>
                      <div className="text-sm text-slate-600">Quando o entregador chegar, mostre o código que aparece na seção abaixo para que ele confirme a entrega.</div>
                      <div className="h-px bg-slate-200" />
                      <div className="text-xs text-slate-500">
                        Status: {getConfirmationLabel(overview?.confirmation_status ?? null)}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Aviso de rota múltipla */}
        {isMultiStop ? (
          <div className="rounded-[26px] border border-violet-200 bg-violet-50 p-4 shadow-sm">
            <div className="text-sm font-semibold text-violet-900">
              📦 Este pedido faz parte de uma rota com {routeInfo!.totalStops} paradas
            </div>
            <div className="mt-1 text-sm text-violet-700">
              Você é a parada {routeInfo!.stopOrder}. O motorista chegará até você após concluir as paradas anteriores.
              Quando ele chegar, informe o código <b>{confirmationCode || "—"}</b> para ele.
            </div>
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <MetricCard title="Status da entrega" value={getDeliveryLabel(overview?.delivery_status ?? "PENDENTE")} />
              <MetricCard title="Rastreio" value={getTrackingLabel(overview?.tracking_status ?? null)} />
              {isMultiStop ? (
                <MetricCard title="Sua parada" value={`${routeInfo!.stopOrder} de ${routeInfo!.totalStops}`} subtitle={stopConfirmed ? "Confirmada ✅" : "Aguardando motorista"} />
              ) : (
                <MetricCard title="Confirmação" value={getConfirmationLabel(overview?.confirmation_status ?? null)} />
              )}
              <MetricCard title="Última atualização" value={formatRelativeFromNow(lastSeenAt)} subtitle={formatDateTime(lastSeenAt)} />
            </div>

            {/* Mapa */}
            <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Mapa da entrega</div>
                  <div className="mt-1 text-sm text-slate-600">Posição atual do motorista com atualização automática.</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <SecondaryActionButton onClick={() => setFollowVehicle((prev) => !prev)}>
                    {followVehicle ? "Seguindo veículo" : "Mapa livre"}
                  </SecondaryActionButton>
                  {mapOpenUrl ? (
                    <a href={mapOpenUrl} target="_blank" rel="noreferrer">
                      <SecondaryActionButton>Abrir no Google Maps</SecondaryActionButton>
                    </a>
                  ) : null}
                </div>
              </div>

              {center ? (
                <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200">
                  <div className="h-[480px] w-full">
                    <MapContainer center={center} zoom={16} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
                      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <RecenterMap center={center} followVehicle={followVehicle} />
                      <Circle center={center} radius={Math.max(Number(lastAccuracy ?? 15), 8)} pathOptions={{ color: "#0891b2", fillColor: "#22d3ee", fillOpacity: 0.18 }} />
                      <Marker position={center} icon={cartIcon}>
                        <Popup>
                          <div className="text-sm">
                            <div className="font-semibold">Entrega em andamento</div>
                            <div className="mt-1">Última atualização: {formatDateTime(lastSeenAt)}</div>
                            <div>Precisão: {lastAccuracy ?? "—"}</div>
                          </div>
                        </Popup>
                      </Marker>

                      {/* Marcador de retirada — centro de distribuição */}
                      <Marker position={[PICKUP_LAT, PICKUP_LNG]} icon={pickupIcon}>
                        <Popup>
                          <div className="text-sm">
                            <div className="font-semibold">🏭 Ponto de retirada</div>
                            <div className="mt-1 text-slate-600">{PICKUP_ADDRESS}</div>
                          </div>
                        </Popup>
                      </Marker>

                      {/* Marcador de entrega — loja do cliente */}
                      {storeCoords ? (
                        <Marker position={[storeCoords.lat, storeCoords.lng]} icon={dropoffIcon}>
                          <Popup>
                            <div className="text-sm">
                              <div className="font-semibold">🏪 {storeLabel}</div>
                              <div className="mt-1 text-slate-600">{storeCoords.address}</div>
                            </div>
                          </Popup>
                        </Marker>
                      ) : null}
                    </MapContainer>
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 p-8 text-sm text-slate-500">
                  Ainda não há localização disponível para esta entrega.
                </div>
              )}
            </div>

            {/* Linha do tempo */}
            <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <div className="text-sm font-semibold text-slate-900">Linha do tempo da entrega</div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pedido criado</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(overview?.order_created_at)}</div>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saiu para entrega</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(overview?.delivery_started_at)}</div>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Última atualização</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(lastSeenAt)}</div>
                  <div className="mt-1 text-xs text-slate-500">{formatRelativeFromNow(lastSeenAt)}</div>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Entrega finalizada</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(overview?.delivery_finished_at)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div>
            <div className="xl:sticky xl:top-24">
              <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfd_100%)] p-5 shadow-sm md:p-6">
                <div className="text-lg font-semibold tracking-[-0.02em] text-slate-900">Ações</div>
                <div className="mt-6 grid gap-3">
                  <SecondaryActionButton onClick={() => loadData(true)} disabled={refreshing}>
                    {refreshing ? "Atualizando..." : "Atualizar entrega"}
                  </SecondaryActionButton>
                  <SecondaryActionButton onClick={() => window.history.back()}>Voltar ao pedido</SecondaryActionButton>
                  <PrimaryActionButton onClick={() => setFollowVehicle(true)} disabled={!hasMap}>
                    Centralizar no veículo
                  </PrimaryActionButton>
                </div>

                <div className="mt-6 rounded-[22px] border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Motorista</div>
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-3"><span>Nome</span><span className="font-semibold text-slate-900">{overview?.delivery_driver_name || "Não informado"}</span></div>
                    <div className="flex items-center justify-between gap-3"><span>Telefone</span><span className="font-semibold text-slate-900">{overview?.delivery_driver_phone || "—"}</span></div>
                  </div>
                </div>

                {/* Código de confirmação na sidebar — diferente para retirada e entrega */}
                {isPickup ? (
                  isPickupConfirmed ? (
                    <div className="mt-4 rounded-[22px] border border-green-200 bg-green-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-green-600">Retirada confirmada</div>
                      <div className="mt-2 text-sm font-semibold text-green-700">✅ Confirmado em {formatDateTime(confirmationMeta?.confirmedAt ?? overview?.delivery_finished_at)}</div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-[22px] border border-cyan-200 bg-cyan-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-cyan-600">Confirmar retirada</div>
                      <div className="mt-2 text-sm text-slate-600">Digite o código acima para confirmar que retirou o pedido.</div>
                    </div>
                  )
                ) : isMultiStop ? (
                  <div className="mt-4 rounded-[22px] border border-cyan-200 bg-cyan-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-cyan-600">Código — Parada {routeInfo!.stopOrder}</div>
                    <div className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-900">{confirmationCode || "—"}</div>
                    <div className="mt-2 text-sm text-slate-600">{stopConfirmed ? "✅ Parada já confirmada." : "Mostre ao motorista para concluir."}</div>
                  </div>
                ) : isDeliveryConfirmed ? (
                  <div className="mt-4 rounded-[22px] border border-green-200 bg-green-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-green-600">Entrega confirmada</div>
                    <div className="mt-2 text-sm font-semibold text-green-700">✅ Confirmado em {formatDateTime(confirmationMeta?.confirmedAt)}</div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[22px] border border-cyan-200 bg-cyan-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-cyan-600">Código de confirmação</div>
                    <div className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-900">{confirmationCode || "—"}</div>
                    <div className="mt-2 text-sm text-slate-600">Mostre este código ao motorista para concluir a entrega.</div>
                    {codeExpiresAt ? <div className="mt-1 text-xs text-slate-500">Expira em: {formatDateTime(codeExpiresAt)}</div> : null}
                  </div>
                )}

                <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Posição atual</div>
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-3"><span>Latitude</span><span className="font-semibold text-slate-900">{formatCoord(lastLat)}</span></div>
                    <div className="flex items-center justify-between gap-3"><span>Longitude</span><span className="font-semibold text-slate-900">{formatCoord(lastLng)}</span></div>
                    <div className="flex items-center justify-between gap-3"><span>Precisão</span><span className="font-semibold text-slate-900">{lastAccuracy ?? "—"}</span></div>
                    <div className="flex items-center justify-between gap-3"><span>Atualizado</span><span className="font-semibold text-slate-900">{formatRelativeFromNow(lastSeenAt)}</span></div>
                  </div>
                </div>

                <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Atualização automática</div>
                  <div className="mt-3 text-sm text-slate-600">Esta tela atualiza a cada 3 segundos com a última posição enviada pelo motorista.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}