"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import L from "leaflet";
import { supabase } from "@/lib/supabaseClient";
import { PageHeader, Input, Badge, Select } from "@/app/components/ui";

type DeliveryStatus =
  | "PENDENTE"
  | "EM_SEPARACAO"
  | "SAIU_PARA_ENTREGA"
  | "ENTREGUE"
  | "OCORRENCIA";

type TrackingStatus = "PENDENTE" | "ATIVO" | "PAUSADO" | "ENCERRADO";
type ConfirmationStatus = "PENDENTE" | "CONFIRMADO" | "EXPIRADO" | "BLOQUEADO";
type DeliveryProvider = "autonomo" | "lalamove";

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
  submitted_at?: string | null;
  approved_at?: string | null;
};

type LalamoveShipmentRow = {
  id: string;
  local_order_id: string;
  provider: "LALAMOVE";
  provider_market: string | null;
  provider_order_id: string | null;
  provider_quote_id: string | null;
  provider_driver_id: string | null;
  provider_status: string | null;
  provider_event_type: string | null;
  share_link: string | null;
  service_type: string | null;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_address: string | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  sender_name: string | null;
  sender_phone: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  price_amount: number | null;
  price_currency: string | null;
  last_quote_payload: any;
  last_order_payload: any;
  last_driver_payload: any;
  last_webhook_payload: any;
  created_at: string | null;
  updated_at: string | null;
};

type LalamoveServiceOption = {
  key: string;
  description: string;
  dimensions: {
    length?: { value?: string; unit?: string };
    width?: { value?: string; unit?: string };
    height?: { value?: string; unit?: string };
  } | null;
  load: { value?: string; unit?: string } | null;
  specialRequests: Array<{
    name: string;
    description: string;
    parent_type?: string;
    max_selection?: number;
  }>;
};

// NOVO: tipos para rotas com múltiplas paradas
type RouteStop = {
  id: string;
  order_id: string;
  stop_order: number;
  status: "PENDENTE" | "CONFIRMADO";
  store_name: string | null;
  address: string | null;
  address_lat: number | null;
  address_lng: number | null;
  confirmation_code: string | null;
  confirmation_code_expires_at: string | null;
};

type RouteData = {
  id: string;
  provider: string;
  status: string;
  driver_name: string | null;
  driver_phone: string | null;
  tracking_token: string | null;
  lalamove_quote_id: string | null;
  lalamove_order_id: string | null;
  lalamove_status: string | null;
  lalamove_share_link: string | null;
  lalamove_price_amount: number | null;
  lalamove_price_currency: string | null;
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
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatRelativeFromNow(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
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

function formatCoord(value: number | null | undefined) {
  if (value == null) return "—";
  return Number(value).toFixed(6);
}

function formatMoney(value: number | null | undefined, currency?: string | null) {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(Number(value));
  } catch {
    return `${Number(value).toFixed(2)} ${currency || "BRL"}`;
  }
}

function getDeliveryStatusLabel(status: DeliveryStatus) {
  const map: Record<DeliveryStatus, string> = {
    PENDENTE: "Pendente", EM_SEPARACAO: "Em separação",
    SAIU_PARA_ENTREGA: "Saiu para entrega", ENTREGUE: "Entregue", OCORRENCIA: "Ocorrência",
  };
  return map[status] ?? status;
}

function getTrackingStatusLabel(status: TrackingStatus | null) {
  if (!status) return "—";
  const map: Record<TrackingStatus, string> = { PENDENTE: "Pendente", ATIVO: "Ativo", PAUSADO: "Pausado", ENCERRADO: "Encerrado" };
  return map[status];
}

function getConfirmationStatusLabel(status: ConfirmationStatus | null) {
  if (!status) return "—";
  const map: Record<ConfirmationStatus, string> = { PENDENTE: "Pendente", CONFIRMADO: "Confirmado", EXPIRADO: "Expirado", BLOQUEADO: "Bloqueado" };
  return map[status];
}

function getProviderLabel(provider: DeliveryProvider) {
  return provider === "lalamove" ? "Lalamove" : "Motorista autônomo";
}

function translateLalamoveSpecialRequestName(name: string) {
  const map: Record<string, string> = {
    LOADING_1DRIVER_MAX030MIN: "Carga/descarga c/ motorista • 30 min",
    LOADING_1DRIVER_MAX060MIN: "Carga/descarga c/ motorista • 1 hora",
    LOADING_1DRIVER_MAX090MIN: "Carga/descarga c/ motorista • 1h30",
    LOADING_1DRIVER_MAX120MIN: "Carga/descarga c/ motorista • 2 horas",
    LOADING_1DRIVER_MAX180MIN: "Carga/descarga c/ motorista • 3 horas",
    LOADING_1DRIVER1HELPER_MAX060MIN: "Carga/descarga c/ motorista + ajudante • 1 hora",
    LOADING_1DRIVER1HELPER_MAX120MIN: "Carga/descarga c/ motorista + ajudante • 2 horas",
    LOADING_1DRIVER1HELPER_MAX180MIN: "Carga/descarga c/ motorista + ajudante • 3 horas",
    LOADING_1DRIVER1HELPER: "Carga/descarga com motorista + ajudante",
    HELPER: "Ajuda do motorista • 30 min",
    HELPER_2: "Ajuda do motorista • 1 hora",
    HELPER_3: "Ajuda do motorista • 1h30",
    THERMAL_BAG_1: "Bolsa térmica",
    REFRIGERATED_VEHICLE: "Veículo refrigerado",
    INSULATED_VEHICLE: "Veículo isolado térmico",
    FROZEN_VEHICLE: "Veículo congelado",
  };
  return map[name] || name.replace(/_/g, " ");
}

function translateLalamoveSpecialRequestDescription(name: string, description?: string) {
  return description || translateLalamoveSpecialRequestName(name);
}

function getServiceLabelPt(service: LalamoveServiceOption | null, key?: string) {
  const serviceKey = (service?.key || key || "").toUpperCase();
  const map: Record<string, string> = {
    CAR: "Carro", CARFOURH: "Carro por 4 horas", HATCHBACK: "Hatch",
    LALAGO: "Moto / entrega leve", LALAGOFOUR: "Moto por 4 horas", LALAPRO: "Moto com baú",
    TRUCK330: "Caminhão 3,30 m", TRUCK_6H: "Caminhão por 6 horas",
    UV_4H: "Utilitário por 4 horas", UV_FIORINO: "Fiorino / utilitário",
    VAN: "Van", VANFOURH: "Van por 4 horas",
  };
  return map[serviceKey] || serviceKey || "—";
}

function getServiceDescriptionPt(service: LalamoveServiceOption | null) {
  const key = (service?.key || "").toUpperCase();
  const map: Record<string, string> = {
    CAR: "Carro com espaço adicional para volumes médios.",
    UV_FIORINO: "Ideal para volumes maiores e materiais.",
    VAN: "Ideal para cargas médias e volumes maiores.",
    TRUCK330: "Ideal para cargas grandes e pesadas.",
    LALAGO: "Ideal para documentos, pequenos pacotes e delivery.",
  };
  return map[key] || service?.description || "—";
}

function humanizeProviderStatus(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}

function deliveryTone(status: DeliveryStatus) {
  const map: Record<DeliveryStatus, "neutral" | "yellow" | "blue" | "green" | "red"> = {
    PENDENTE: "neutral", EM_SEPARACAO: "yellow", SAIU_PARA_ENTREGA: "blue", ENTREGUE: "green", OCORRENCIA: "red",
  };
  return map[status] ?? "neutral";
}

function trackingTone(status: TrackingStatus | null) {
  if (!status) return "neutral" as const;
  const map: Record<TrackingStatus, "neutral" | "yellow" | "blue" | "green"> = {
    ATIVO: "green", PAUSADO: "yellow", ENCERRADO: "neutral", PENDENTE: "blue",
  };
  return map[status];
}

function confirmationTone(status: ConfirmationStatus | null) {
  if (!status) return "neutral" as const;
  const map: Record<ConfirmationStatus, "neutral" | "yellow" | "green" | "red"> = {
    CONFIRMADO: "green", PENDENTE: "yellow", EXPIRADO: "red", BLOQUEADO: "red",
  };
  return map[status];
}

function lalamoveTone(status: string | null | undefined) {
  const s = String(status || "").toUpperCase();
  if (s.includes("DELIVERED") || s.includes("COMPLETED") || s.includes("FINISHED")) return "green" as const;
  if (s.includes("ASSIGNED") || s.includes("PICKED") || s.includes("ONGOING") || s.includes("IN_TRANSIT")) return "blue" as const;
  if (s.includes("PENDING") || s.includes("MATCHING") || s.includes("QUEUE")) return "yellow" as const;
  if (s.includes("CANCEL") || s.includes("FAIL") || s.includes("EXPIRED")) return "red" as const;
  return "neutral" as const;
}

function buildWhatsAppUrl(phone: string, message: string) {
  const cleanPhone = (phone || "").replace(/\D/g, "");
  const encoded = encodeURIComponent(message.trim());
  if (!cleanPhone) return `https://wa.me/?text=${encoded}`;
  return `https://wa.me/${cleanPhone}?text=${encoded}`;
}

function buildDriverMessage(link: string, orderId: string) {
  return [`Pedido ${orderId.slice(0, 8)} saiu para entrega.`, "", "Abra este link para compartilhar sua localização durante esta entrega:", link].join("\n");
}

function buildCustomerCodeMessage(code: string, orderId: string) {
  return [`Seu pedido ${orderId.slice(0, 8)} saiu para entrega.`, "", `Código de confirmação: ${code}`, "Informe este código ao entregador no momento do recebimento."].join("\n");
}

function buildGoogleMapsOpenUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function createDeliveryIcon(emoji = "🛵", bg = "#0891b2") {
  return L.divIcon({
    className: "custom-delivery-marker",
    html: `<div style="width:40px;height:40px;border-radius:9999px;background:${bg};display:flex;align-items:center;justify-content:center;box-shadow:0 10px 24px rgba(8,145,178,0.35);border:3px solid white;font-size:20px;">${emoji}</div>`,
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

function RecenterMap({ center, followVehicle }: { center: [number, number]; followVehicle: boolean }) {
  const { useMap } = require("react-leaflet") as typeof import("react-leaflet");
  const map = useMap();
  useEffect(() => {
    if (!followVehicle) return;
    map.flyTo(center, map.getZoom(), { animate: true, duration: 1.2 });
  }, [center, followVehicle, map]);
  return null;
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = normalizeNumber(value);
    if (parsed != null) return parsed;
  }
  return null;
}

function toIsoDateTime(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function extractLalamoveDriverSnapshot(shipment: LalamoveShipmentRow | null) {
  const driverPayload = shipment?.last_driver_payload ?? null;
  const orderPayload = shipment?.last_order_payload ?? null;
  const webhookPayload = shipment?.last_webhook_payload ?? null;

  console.log("[DRIVER] last_driver_payload:", JSON.stringify(driverPayload, null, 2));
  console.log("[DRIVER] last_order_payload:", JSON.stringify(orderPayload, null, 2));
  console.log("[DRIVER] last_webhook_payload:", JSON.stringify(webhookPayload, null, 2));
  console.log("[DRIVER] provider_driver_id:", shipment?.provider_driver_id);

  const lat = firstNumber(
    driverPayload?.data?.coordinates?.lat, driverPayload?.data?.driver?.coordinates?.lat, driverPayload?.data?.driver?.location?.lat,
    orderPayload?.data?.driver?.coordinates?.lat, orderPayload?.data?.driver?.location?.lat,
    webhookPayload?.data?.driver?.coordinates?.lat, webhookPayload?.data?.driver?.location?.lat
  );
  const lng = firstNumber(
    driverPayload?.data?.coordinates?.lng, driverPayload?.data?.driver?.coordinates?.lng, driverPayload?.data?.driver?.location?.lng,
    orderPayload?.data?.driver?.coordinates?.lng, orderPayload?.data?.driver?.location?.lng,
    webhookPayload?.data?.driver?.coordinates?.lng, webhookPayload?.data?.driver?.location?.lng
  );
  const accuracy = firstNumber(driverPayload?.data?.accuracy, driverPayload?.data?.driver?.accuracy, orderPayload?.data?.driver?.accuracy);
  const updatedAt = firstString(driverPayload?.data?.updatedAt, driverPayload?.data?.driver?.updatedAt, orderPayload?.data?.updatedAt, shipment?.updated_at);
  const driverName = firstString(driverPayload?.data?.name, driverPayload?.data?.driver?.name, orderPayload?.data?.driver?.name, orderPayload?.data?.drivers?.[0]?.name, webhookPayload?.data?.driver?.name, shipment?.provider_driver_id);
  const driverPhone = firstString(driverPayload?.data?.phone, driverPayload?.data?.driver?.phone, orderPayload?.data?.driver?.phone, orderPayload?.data?.drivers?.[0]?.phone, webhookPayload?.data?.driver?.phone);
  const driverPlate = firstString(driverPayload?.data?.plateNumber, driverPayload?.data?.driver?.plateNumber, orderPayload?.data?.driver?.plateNumber);
  const driverPhoto = firstString(driverPayload?.data?.photo, driverPayload?.data?.driver?.photo, orderPayload?.data?.driver?.photo);

  return { lat, lng, accuracy, updatedAt, driverName, driverPhone, driverPlate, driverPhoto };
}

function PrimaryActionButton({ children, onClick, disabled, fullWidth }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; fullWidth?: boolean; }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={["inline-flex h-12 items-center justify-center rounded-[18px] bg-cyan-600 px-5 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(8,145,178,0.26)] transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50", fullWidth ? "w-full" : ""].join(" ")}>
      {children}
    </button>
  );
}

function SecondaryActionButton({ children, onClick, disabled, fullWidth }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; fullWidth?: boolean; }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={["inline-flex h-12 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50", fullWidth ? "w-full" : ""].join(" ")}>
      {children}
    </button>
  );
}

function MetricCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string; }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900 break-words">{value}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

function ProviderChoiceButton({ active, title, subtitle, onClick }: { active: boolean; title: string; subtitle: string; onClick?: () => void; }) {
  return (
    <button type="button" onClick={onClick}
      className={["rounded-[22px] border p-4 text-left transition", active ? "border-cyan-200 bg-cyan-50 shadow-[0_10px_24px_rgba(8,145,178,0.12)]" : "border-slate-200 bg-white hover:bg-slate-50"].join(" ")}>
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-sm text-slate-600">{subtitle}</div>
    </button>
  );
}

export default function AdmLogisticaDetalhePage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const isDispatchMode = searchParams.get("mode") === "dispatch";
  // NOVO: detecta se veio de uma rota com múltiplas paradas
  const routeId = searchParams.get("routeId") ?? null;

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [overview, setOverview] = useState<DeliveryOverviewRow | null>(null);
  const [storeLabel, setStoreLabel] = useState("Sem loja");
  const [shipment, setShipment] = useState<LalamoveShipmentRow | null>(null);

  // NOVO: estado da rota múltipla
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [routeTrackingLink, setRouteTrackingLink] = useState<string | null>(null);

  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [occurrenceNotes, setOccurrenceNotes] = useState("");
  const [driverNameDirty, setDriverNameDirty] = useState(false);
  const [driverPhoneDirty, setDriverPhoneDirty] = useState(false);
  const [deliveryNotesDirty, setDeliveryNotesDirty] = useState(false);
  const [lastGeneratedCode, setLastGeneratedCode] = useState<string | null>(null);

  const [serviceType, setServiceType] = useState("");
  const [pickupAddress, setPickupAddress] = useState(process.env.NEXT_PUBLIC_PICKUP_ADDRESS || "Rua Coronel Salvador Fernandes, 222, Bandeirantes, Contagem, MG, Brasil");
  const [pickupLat, setPickupLat] = useState(process.env.NEXT_PUBLIC_PICKUP_LAT || "-19.9704199");
  const [pickupLng, setPickupLng] = useState(process.env.NEXT_PUBLIC_PICKUP_LNG || "-44.0547074");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [dropoffLat, setDropoffLat] = useState("");
  const [dropoffLng, setDropoffLng] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientRemarks, setRecipientRemarks] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");

  const [availableServices, setAvailableServices] = useState<LalamoveServiceOption[]>([]);
  const [matchedCityLabel, setMatchedCityLabel] = useState("");
  const [selectedSpecialRequests, setSelectedSpecialRequests] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingShipment, setLoadingShipment] = useState(false);
  const [autofilling, setAutofilling] = useState(false);
  const [savingDriver, setSavingDriver] = useState(false);
  const [markingSeparation, setMarkingSeparation] = useState(false);
  const [startingDelivery, setStartingDelivery] = useState(false);
  const [regeneratingCode, setRegeneratingCode] = useState(false);
  const [registeringOccurrence, setRegisteringOccurrence] = useState(false);
  const [settingStatus, setSettingStatus] = useState<null | string>(null);
  const [lalamoveQuoting, setLalamoveQuoting] = useState(false);
  const [lalamoveCreating, setLalamoveCreating] = useState(false);
  const [lalamoveSyncing, setLalamoveSyncing] = useState(false);
  const [lalamoveCancelling, setLalamoveCancelling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"green" | "red" | null>(null);
  const [followVehicle, setFollowVehicle] = useState(true);
  const [mapKey, setMapKey] = useState(0);

  const didInitialFormLoadRef = useRef(false);
  const [showDriverValidation, setShowDriverValidation] = useState(false);
  const didInitialLalamoveLoadRef = useRef(false);
  const didAutofillRef = useRef(false);
  const lastLalamoveMapCoordRef = useRef("");

  const providerFromUrl = searchParams.get("provider");
  const selectedProvider = useMemo<DeliveryProvider>(() => {
    if (providerFromUrl === "lalamove") return "lalamove";
    if (providerFromUrl === "autonomo") return "autonomo";
    if (shipment?.provider === "LALAMOVE") return "lalamove";
    return "autonomo";
  }, [providerFromUrl, shipment?.provider]);

  const isLalamove = selectedProvider === "lalamove";
  const isMultiStop = !!routeId && routeStops.length > 1;
  const isPickup = (order as any)?.delivery_mode === "RETIRADA";

  const showSuccess = (text: string) => { setMessage(text); setMessageTone("green"); };
  const showError = (text: string) => { setMessage(text); setMessageTone("red"); };
  const clearMessage = () => { setMessage(null); setMessageTone(null); };

  const updateProviderParam = useCallback((provider: DeliveryProvider) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("provider", provider);
    if (isDispatchMode) params.set("mode", "dispatch");
    else params.delete("mode");
    if (routeId) params.set("routeId", routeId);
    const query = params.toString();
    router.replace(query ? `/adm/logistica/${id}?${query}` : `/adm/logistica/${id}`);
  }, [searchParams, isDispatchMode, router, id, routeId]);

  const currentSelectedService = useMemo(() => availableServices.find((item) => item.key === serviceType) ?? null, [availableServices, serviceType]);
  const currentSpecialRequests = useMemo(() => currentSelectedService?.specialRequests ?? [], [currentSelectedService]);

  // NOVO: carrega dados da rota múltipla
  const loadRouteData = useCallback(async () => {
    if (!routeId) return;

    const { data: route } = await supabase
      .from("delivery_routes")
      .select("*")
      .eq("id", routeId)
      .single();

    if (!route) return;
    setRouteData(route as RouteData);

    const { data: stops } = await supabase
      .from("delivery_route_stops")
      .select("*")
      .eq("route_id", routeId)
      .order("stop_order", { ascending: true });

    setRouteStops((stops ?? []) as RouteStop[]);

    if (route.tracking_token && typeof window !== "undefined") {
      setRouteTrackingLink(`${window.location.origin}/entrega/rota/${route.tracking_token}`);
    }
  }, [routeId]);

  const loadLalamoveShipment = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoadingShipment(true);

      // Se é rota múltipla, busca dados da rota (não do order_shipments)
      if (routeId) {
        await loadRouteData();
        return;
      }

      const { data, error } = await supabase
        .from("order_shipments")
        .select("id,local_order_id,provider,provider_market,provider_order_id,provider_quote_id,provider_driver_id,provider_status,provider_event_type,share_link,service_type,pickup_address,pickup_lat,pickup_lng,dropoff_address,dropoff_lat,dropoff_lng,sender_name,sender_phone,recipient_name,recipient_phone,price_amount,price_currency,last_quote_payload,last_order_payload,last_driver_payload,last_webhook_payload,created_at,updated_at")
        .eq("local_order_id", id)
        .eq("provider", "LALAMOVE")
        .maybeSingle();

      if (error) throw error;

      const nextShipment = (data ?? null) as LalamoveShipmentRow | null;
      setShipment(nextShipment);

      if (!didInitialLalamoveLoadRef.current) {
        setServiceType(nextShipment?.service_type ?? "");
        setPickupAddress(nextShipment?.pickup_address ?? pickupAddress);
        setPickupLat(nextShipment?.pickup_lat != null ? String(nextShipment.pickup_lat) : pickupLat);
        setPickupLng(nextShipment?.pickup_lng != null ? String(nextShipment.pickup_lng) : pickupLng);
        setDropoffAddress(nextShipment?.dropoff_address ?? "");
        setDropoffLat(nextShipment?.dropoff_lat != null ? String(nextShipment.dropoff_lat) : "");
        setDropoffLng(nextShipment?.dropoff_lng != null ? String(nextShipment.dropoff_lng) : "");
        setSenderName(nextShipment?.sender_name ?? "");
        setSenderPhone(nextShipment?.sender_phone ?? "");
        setRecipientName(nextShipment?.recipient_name ?? "");
        setRecipientPhone(nextShipment?.recipient_phone ?? "");
        didInitialLalamoveLoadRef.current = true;
      }
    } catch (error) {
      if (!silent) showError(error instanceof Error ? error.message : "Não foi possível carregar os dados da Lalamove.");
    } finally {
      if (!silent) setLoadingShipment(false);
    }
  }, [id, routeId, loadRouteData, pickupAddress, pickupLat, pickupLng]);

  const applyServerData = useCallback((data: { order?: OrderRow | null; overview?: DeliveryOverviewRow | null; storeLabel?: string; }, options?: { preserveForm?: boolean; clearFlashMessage?: boolean; }) => {
    const preserveForm = options?.preserveForm ?? true;
    if (options?.clearFlashMessage) clearMessage();

    const nextOrder = (data.order as OrderRow | null) ?? null;
    const nextOverview = (data.overview as DeliveryOverviewRow | null) ?? null;
    const prevLat = overview?.last_lat ?? null;
    const prevLng = overview?.last_lng ?? null;

    setOrder(nextOrder);
    setOverview(nextOverview);
    setStoreLabel(data.storeLabel || "Sem loja");

    const shouldHydrateForm = !preserveForm || !didInitialFormLoadRef.current;
    if (shouldHydrateForm) {
      setDriverName(nextOverview?.delivery_driver_name ?? "");
      setDriverPhone(nextOverview?.delivery_driver_phone ?? "");
      setDeliveryNotes(nextOverview?.delivery_notes ?? "");
      setDriverNameDirty(false); setDriverPhoneDirty(false); setDeliveryNotesDirty(false);
      didInitialFormLoadRef.current = true;
    } else {
      if (!driverNameDirty) setDriverName(nextOverview?.delivery_driver_name ?? "");
      if (!driverPhoneDirty) setDriverPhone(nextOverview?.delivery_driver_phone ?? "");
      if (!deliveryNotesDirty) setDeliveryNotes(nextOverview?.delivery_notes ?? "");
    }

    if (followVehicle && nextOverview?.last_lat != null && nextOverview?.last_lng != null &&
      (nextOverview.last_lat !== prevLat || nextOverview.last_lng !== prevLng)) {
      setMapKey((k) => k + 1);
    }
  }, [overview?.last_lat, overview?.last_lng, followVehicle, driverNameDirty, driverPhoneDirty, deliveryNotesDirty]);

  const loadAllData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const response = await fetch(`/api/logistica/admin/order/${id}/overview`, { method: "GET", cache: "no-store" });
      const data = await response.json();

      if (!response.ok || !data.ok) throw new Error(data.message || "Erro ao carregar logística.");

      applyServerData(data, { preserveForm: true, clearFlashMessage: false });
      await loadLalamoveShipment(true);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Erro ao carregar logística.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, applyServerData, loadLalamoveShipment]);

  const loadLiveOnly = useCallback(async () => {
    try {
      const response = await fetch(`/api/logistica/admin/order/${id}/overview`, { method: "GET", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) return;
      applyServerData(data, { preserveForm: true, clearFlashMessage: false });
      await loadLalamoveShipment(true);
    } catch { /* polling silencioso */ }
  }, [id, applyServerData, loadLalamoveShipment]);

  const handleLalamoveAutofill = useCallback(async (force = false) => {
    try {
      setAutofilling(true);
      const response = await fetch("/api/lalamove/autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: id }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data?.message || "Não foi possível preencher automaticamente.");

      const payload = data.data;
      setMatchedCityLabel(payload.matchedCity ? `${payload.matchedCity.name} • ${payload.matchedCity.locode}` : "Cidade não identificada");
      setAvailableServices(payload.services ?? []);

      if (force || !serviceType) setServiceType(shipment?.service_type || payload.preferredServiceType || payload.services?.[0]?.key || "");
      if (force || !senderName) setSenderName(payload.pickup.name || "");
      if (force || !senderPhone) setSenderPhone(payload.pickup.phone || "");

      // Para rota múltipla, não sobrescreve dropoff (tem múltiplos)
      if (!isMultiStop) {
        if (force || !dropoffAddress) setDropoffAddress(payload.dropoff.address || "");
        if (force || !dropoffLat) setDropoffLat(payload.dropoff.lat != null ? String(payload.dropoff.lat) : "");
        if (force || !dropoffLng) setDropoffLng(payload.dropoff.lng != null ? String(payload.dropoff.lng) : "");
        if (force || !recipientName) setRecipientName(payload.dropoff.name || "");
        if (force || !recipientPhone) setRecipientPhone(payload.dropoff.phone || "");
      }

      didAutofillRef.current = true;
      if (force) showSuccess("Dados da Lalamove preenchidos automaticamente.");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Não foi possível preencher automaticamente.");
    } finally {
      setAutofilling(false);
    }
  }, [id, shipment?.service_type, serviceType, senderName, senderPhone, dropoffAddress, dropoffLat, dropoffLng, recipientName, recipientPhone, isMultiStop]);

  const syncLalamoveSilently = useCallback(async () => {
    const orderId = routeData?.lalamove_order_id ?? shipment?.provider_order_id;
    const driverId = routeData ? null : shipment?.provider_driver_id;
    if (!orderId) return;

    try {
      const orderResponse = await fetch(`/api/lalamove/provider-order/${orderId}`, { method: "GET", cache: "no-store" });
      if (!orderResponse.ok) return;
      const orderData = await orderResponse.json();
      const resolvedDriverId = firstString(orderData?.data?.driverId, driverId) ?? null;

      if (resolvedDriverId) {
        await fetch(`/api/lalamove/provider-order/${orderId}/driver/${resolvedDriverId}`, { method: "GET", cache: "no-store" });
      }
      await loadLalamoveShipment(true);

      // Processa status da Lalamove e atualiza nosso status conforme as regras:
      const lalamoveStatus = String(orderData?.data?.status ?? "").toUpperCase();
      const currentDeliveryStatus = overview?.delivery_status;

      // Regra 1: Lalamove COMPLETED → marca como ENTREGUE automaticamente
      const isLalamoveCompleted = ["COMPLETED", "DELIVERED", "FULFILLED"].some(s => lalamoveStatus.includes(s));
      if (isLalamoveCompleted && currentDeliveryStatus !== "ENTREGUE") {
        await fetch(`/api/logistica/admin/order/${id}/set-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliveryStatus: "ENTREGUE" }),
        }).catch(() => {});
        await loadAllData(true);
        return;
      }

      // Regra 2: Lalamove CANCELED + nosso status SAIU_PARA_ENTREGA → volta para EM_SEPARACAO
      const isLalamoveCanceled = ["CANCEL", "EXPIRED", "REJECTED"].some(s => lalamoveStatus.includes(s));
      if (isLalamoveCanceled && currentDeliveryStatus === "SAIU_PARA_ENTREGA") {
        await fetch(`/api/logistica/admin/order/${id}/set-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliveryStatus: "EM_SEPARACAO" }),
        }).catch(() => {});
        await loadAllData(true);
        return;
      }

      // Regra 3: só marca SAIU_PARA_ENTREGA se Lalamove estiver PICKED_UP ou ON_GOING
      // Se nosso status já é SAIU_PARA_ENTREGA mas Lalamove ainda não coletou, reverte para EM_SEPARACAO
      const isLalamovePickedUp = ["PICKED_UP", "ON_GOING", "IN_TRANSIT", "ONGOING"].some(s => lalamoveStatus.includes(s));
      const isLalamovePending = ["ASSIGNING", "MATCHING", "PENDING", "QUEUE", "ACCEPTED", "ASSIGNED"].some(s => lalamoveStatus.includes(s));

      if (isLalamovePending && currentDeliveryStatus === "SAIU_PARA_ENTREGA") {
        // Lalamove ainda não coletou — volta para EM_SEPARACAO
        await fetch(`/api/logistica/admin/order/${id}/set-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliveryStatus: "EM_SEPARACAO" }),
        }).catch(() => {});
        await loadAllData(true);
        return;
      }

      // Se Lalamove coletou e nosso status ainda é EM_SEPARACAO → avança para SAIU_PARA_ENTREGA
      if (isLalamovePickedUp && currentDeliveryStatus === "EM_SEPARACAO") {
        await fetch(`/api/logistica/admin/order/${id}/set-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliveryStatus: "SAIU_PARA_ENTREGA" }),
        }).catch(() => {});
        await loadAllData(true);
        return;
      }
    } catch { /* sync silenciosa */ }
  }, [routeData, shipment?.provider_order_id, shipment?.provider_driver_id, loadLalamoveShipment, overview?.delivery_status, id, loadAllData]);

  useEffect(() => { loadAllData(false); }, [loadAllData]);
  useEffect(() => { const i = window.setInterval(() => loadLiveOnly(), 5000); return () => window.clearInterval(i); }, [loadLiveOnly]);
  useEffect(() => { if (!isLalamove) return; if (didAutofillRef.current) return; handleLalamoveAutofill(false); }, [isLalamove, handleLalamoveAutofill]);

  useEffect(() => {
    const orderId = routeData?.lalamove_order_id ?? shipment?.provider_order_id;
    if (!isLalamove || !orderId) return;
    const i = window.setInterval(() => syncLalamoveSilently(), 10000);
    return () => window.clearInterval(i);
  }, [isLalamove, routeData, shipment?.provider_order_id, syncLalamoveSilently]);

  // Auto-complete para rota múltipla: detecta quando todas paradas foram confirmadas
  useEffect(() => {
    if (!isMultiStop || !routeStops.length) return;
    const allConfirmed = routeStops.every(s => s.status === "CONFIRMADO");
    if (allConfirmed && overview?.delivery_status !== "ENTREGUE") {
      fetch(`/api/logistica/admin/order/${id}/set-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryStatus: "ENTREGUE" }),
      }).then(() => loadAllData(true)).catch(() => {});
    }
  }, [routeStops, isMultiStop, overview?.delivery_status, id, loadAllData]);

  useEffect(() => {
    if (!currentSelectedService) { setSelectedSpecialRequests([]); return; }
    const validSet = new Set((currentSelectedService.specialRequests ?? []).map((item) => item.name));
    setSelectedSpecialRequests((prev) => prev.filter((item) => validSet.has(item)));
  }, [currentSelectedService]);

  const trackingLink = useMemo(() => {
    if (!overview?.tracking_token || typeof window === "undefined") return "";
    return `${window.location.origin}/entrega/rastreio/${overview.tracking_token}`;
  }, [overview?.tracking_token]);

  const driverWhatsAppUrl = useMemo(() => {
    if (!trackingLink) return "";
    return buildWhatsAppUrl(driverPhone, buildDriverMessage(trackingLink, id));
  }, [driverPhone, id, trackingLink]);

  const customerWhatsAppUrl = useMemo(() => {
    if (!lastGeneratedCode) return "";
    return buildWhatsAppUrl("", buildCustomerCodeMessage(lastGeneratedCode, id));
  }, [id, lastGeneratedCode]);

  const canStartDelivery = overview?.delivery_status !== "SAIU_PARA_ENTREGA" && overview?.delivery_status !== "ENTREGUE";
  // Pedido bloqueado se já foi confirmado por código — nenhum status manual permitido
  const isConfirmedByCode = overview?.confirmation_status === "CONFIRMADO";

  // Pedido bloqueado se Lalamove concluiu a corrida
  const lalamoveCurrentStatus = String(
    (isMultiStop ? routeData?.lalamove_status : shipment?.provider_status) ?? ""
  ).toUpperCase();
  const isLalamoveCompleted = ["COMPLETED", "DELIVERED", "FULFILLED"].some(
    (s) => lalamoveCurrentStatus.includes(s)
  );
  const isLalamoveCanceled = ["CANCEL", "EXPIRED", "REJECTED"].some(
    (s) => lalamoveCurrentStatus.includes(s)
  );

  // Status travado = confirmado por código OU Lalamove concluiu
  const isStatusLocked = isConfirmedByCode || isLalamoveCompleted;

  const driverNameValid = driverName.trim().length > 0;
  const driverPhoneValid = driverPhone.trim().length > 0;
  const driverDataValid = driverNameValid && driverPhoneValid;
  const internalLastLat = overview?.last_lat ?? null;
  const internalLastLng = overview?.last_lng ?? null;
  const internalLastAccuracy = overview?.last_accuracy ?? null;
  const internalLastSeenAt = overview?.last_seen_at ?? null;
  const internalHasMap = internalLastLat != null && internalLastLng != null;
  const internalFormattedCoords = internalHasMap ? `${internalLastLat!.toFixed(5)}, ${internalLastLng!.toFixed(5)}` : "—";
  const internalFormattedCoordsOrText = internalHasMap ? `${internalLastLat!.toFixed(5)}, ${internalLastLng!.toFixed(5)}` : "Sem coordenadas";
  const internalMapOpenUrl = useMemo(() => internalLastLat && internalLastLng ? buildGoogleMapsOpenUrl(internalLastLat, internalLastLng) : "", [internalLastLat, internalLastLng]);

  const lalamoveSnapshot = useMemo(() => extractLalamoveDriverSnapshot(shipment), [shipment]);
  const lalamoveLastLat = lalamoveSnapshot.lat;
  const lalamoveLastLng = lalamoveSnapshot.lng;
  const lalamoveLastAccuracy = lalamoveSnapshot.accuracy;
  const lalamoveLastSeenAt = lalamoveSnapshot.updatedAt ?? shipment?.updated_at ?? null;
  const lalamoveDriverName = lalamoveSnapshot.driverName ?? null;
  const lalamoveDriverPhone = lalamoveSnapshot.driverPhone ?? null;
  const lalamoveDriverPlate = lalamoveSnapshot.driverPlate ?? null;
  const lalamoveHasMap = lalamoveLastLat != null && lalamoveLastLng != null;

  // Coordenadas de retirada (pickup) — sempre disponíveis
  const pickupLatNum = pickupLat ? Number(pickupLat) : null;
  const pickupLngNum = pickupLng ? Number(pickupLng) : null;
  const hasPickup = pickupLatNum != null && Number.isFinite(pickupLatNum) && pickupLngNum != null && Number.isFinite(pickupLngNum);

  // Coordenadas de entrega (dropoff) — da cotação Lalamove ou da loja
  const dropoffLatNum = dropoffLat ? Number(dropoffLat) : null;
  const dropoffLngNum = dropoffLng ? Number(dropoffLng) : null;
  const hasDropoff = dropoffLatNum != null && Number.isFinite(dropoffLatNum) && dropoffLngNum != null && Number.isFinite(dropoffLngNum);
  const lalamoveFormattedCoords = lalamoveHasMap ? `${lalamoveLastLat?.toFixed(5)}, ${lalamoveLastLng?.toFixed(5)}` : "—";
  const lalamoveMapOpenUrl = useMemo(() => lalamoveLastLat && lalamoveLastLng ? buildGoogleMapsOpenUrl(lalamoveLastLat, lalamoveLastLng) : "", [lalamoveLastLat, lalamoveLastLng]);

  const deliveryIcon = useMemo(() => createDeliveryIcon("🛵", "#0891b2"), []);
  const pickupIcon = useMemo(() => createPinIcon("🏭", "#f59e0b"), []);
  const dropoffIcon = useMemo(() => createPinIcon("🏪", "#16a34a"), []);
  const lalamoveIcon = useMemo(() => createDeliveryIcon("🚚", "#7c3aed"), []);

  // Para rota múltipla, usa dados da delivery_routes; para pedido único, usa order_shipments
  const hasLalamoveQuote = isMultiStop ? !!routeData?.lalamove_quote_id : !!shipment?.provider_quote_id;
  const hasLalamoveOrder = isMultiStop ? !!routeData?.lalamove_order_id : !!shipment?.provider_order_id;

  const serviceOptions = useMemo(() => availableServices.map((service) => ({
    value: service.key,
    label: `${getServiceLabelPt(service)} • ${getServiceDescriptionPt(service)}`,
  })), [availableServices]);

  async function handleSaveDriver() {
    try {
      setSavingDriver(true); clearMessage();
      const response = await fetch(`/api/logistica/admin/order/${id}/save-driver`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverName, driverPhone, deliveryNotes }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Erro ao salvar motorista.");
      setDriverNameDirty(false); setDriverPhoneDirty(false); setDeliveryNotesDirty(false);
      await loadAllData(true);
      showSuccess(data.message || "Dados atualizados.");
    } catch (error) { showError(error instanceof Error ? error.message : "Erro ao salvar motorista."); }
    finally { setSavingDriver(false); }
  }

  async function handleMarkSeparation() {
    try {
      setMarkingSeparation(true); clearMessage();
      const response = await fetch(`/api/logistica/admin/order/${id}/mark-separation`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverName, driverPhone, deliveryNotes }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Erro.");
      setDriverNameDirty(false); setDriverPhoneDirty(false); setDeliveryNotesDirty(false);
      await loadAllData(true);
      showSuccess(data.message || "Pedido marcado em separação.");
    } catch (error) { showError(error instanceof Error ? error.message : "Erro."); }
    finally { setMarkingSeparation(false); }
  }

  async function handleStartDelivery() {
    if (!driverDataValid) {
      setShowDriverValidation(true);
      showError("Preencha o nome e telefone do motorista antes de sair para entrega.");
      return;
    }
    try {
      setShowDriverValidation(false);
      setStartingDelivery(true); clearMessage();
      const response = await fetch(`/api/logistica/admin/order/${id}/start-delivery`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverName, driverPhone, deliveryNotes }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Erro ao iniciar entrega.");
      setLastGeneratedCode(data.confirmationCode ?? null);
      setDriverNameDirty(false); setDriverPhoneDirty(false); setDeliveryNotesDirty(false);
      await loadAllData(true);
      showSuccess(data.message || "Entrega iniciada.");
    } catch (error) { showError(error instanceof Error ? error.message : "Erro."); }
    finally { setStartingDelivery(false); }
  }

  async function handleRegenerateCode() {
    try {
      setRegeneratingCode(true); clearMessage();
      const response = await fetch(`/api/logistica/admin/order/${id}/regenerate-code`, { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Erro.");
      setLastGeneratedCode(data.confirmationCode ?? null);
      await loadAllData(true);
      showSuccess(data.message || "Código regenerado.");
    } catch (error) { showError(error instanceof Error ? error.message : "Erro."); }
    finally { setRegeneratingCode(false); }
  }

  async function handleOccurrence() {
    try {
      if (!occurrenceNotes.trim()) { showError("Informe a observação da ocorrência."); return; }
      setRegisteringOccurrence(true); clearMessage();
      const response = await fetch(`/api/logistica/admin/order/${id}/occurrence`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: occurrenceNotes }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Erro.");
      setOccurrenceNotes("");
      await loadAllData(true);
      showSuccess(data.message || "Ocorrência registrada.");
    } catch (error) { showError(error instanceof Error ? error.message : "Erro."); }
    finally { setRegisteringOccurrence(false); }
  }

  async function handleSetStatus(status: DeliveryStatus) {
    if (status === "SAIU_PARA_ENTREGA" && !driverDataValid) {
      setShowDriverValidation(true);
      showError("Preencha o nome e telefone do motorista antes de marcar como saiu para entrega.");
      document.getElementById("driver-form-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    try {
      setSettingStatus(status); clearMessage();

      // Para pedido de RETIRADA marcando EM_SEPARACAO: usa mark-separation para gerar o código automaticamente
      if (isPickup && status === "EM_SEPARACAO") {
        const response = await fetch(`/api/logistica/admin/order/${id}/mark-separation`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.message || "Erro.");
        await loadAllData(true);
        showSuccess("Pedido em separação. Código de retirada gerado — o franqueado pode confirmar no portal.");
        return;
      }

      const response = await fetch(`/api/logistica/admin/order/${id}/set-status`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryStatus: status }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Erro.");
      await loadAllData(true);
      showSuccess(data.message || "Status atualizado.");
    } catch (error) { showError(error instanceof Error ? error.message : "Erro."); }
    finally { setSettingStatus(null); }
  }

  async function handleCopyText(value: string, successMessage: string) {
    try { await navigator.clipboard.writeText(value); showSuccess(successMessage); }
    catch { showError("Não foi possível copiar."); }
  }

  function toggleSpecialRequest(name: string) {
    setSelectedSpecialRequests((prev) => prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]);
  }

  async function handleLalamoveQuote() {
    try {
      clearMessage();
      if (!serviceType.trim()) { showError("Selecione o tipo de veículo da Lalamove."); return; }
      if (!pickupAddress.trim() || !pickupLat.trim() || !pickupLng.trim()) { showError("Dados de coleta incompletos."); return; }
      setLalamoveQuoting(true);

      const body: any = {
        serviceType: serviceType.trim(),
        specialRequests: selectedSpecialRequests,
        scheduleAt: toIsoDateTime(scheduleAt),
        language: "pt_BR",
        pickup: { address: pickupAddress.trim(), lat: pickupLat.trim(), lng: pickupLng.trim() },
      };

      if (isMultiStop && routeId) {
        // Rota múltipla: usa routeId e stops das paradas
        body.routeId = routeId;
        body.stops = routeStops.map((stop) => ({
          address: stop.address ?? "",
          lat: stop.address_lat ?? 0,
          lng: stop.address_lng ?? 0,
        }));
      } else {
        // Pedido único
        if (!dropoffAddress.trim() || !dropoffLat.trim() || !dropoffLng.trim()) { showError("Dados de entrega incompletos."); setLalamoveQuoting(false); return; }
        body.orderId = id;
        body.dropoff = { address: dropoffAddress.trim(), lat: dropoffLat.trim(), lng: dropoffLng.trim() };
      }

      const response = await fetch("/api/lalamove/quote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || data?.message || "Erro ao gerar cotação.");

      await loadAllData(true);
      if (routeId) await loadRouteData();

      const total = normalizeNumber(data?.data?.priceBreakdown?.total) ?? normalizeNumber(data?.priceBreakdown?.total) ?? null;
      const currency = firstString(data?.data?.priceBreakdown?.currency, data?.priceBreakdown?.currency) ?? "BRL";
      showSuccess(total != null ? `Cotação gerada: ${formatMoney(total, currency)}.` : "Cotação Lalamove gerada com sucesso.");
    } catch (error) { showError(error instanceof Error ? error.message : "Erro ao gerar cotação Lalamove."); }
    finally { setLalamoveQuoting(false); }
  }

  async function handleLalamoveCreate() {
    try {
      clearMessage();
      if (!hasLalamoveQuote) { showError("Gere a cotação antes de chamar a Lalamove."); return; }
      if (!senderName.trim() || !senderPhone.trim()) { showError("Revise os dados do remetente."); return; }
      setLalamoveCreating(true);

      const quoteId = isMultiStop ? routeData?.lalamove_quote_id : shipment?.provider_quote_id;

      const body: any = {
        quotationId: quoteId,
        sender: { name: senderName.trim(), phone: senderPhone.trim() },
        partnerName: "Portal American Burger",
        isPODEnabled: false,
      };

      if (isMultiStop && routeId) {
        body.routeId = routeId;
        body.recipients = routeStops.map((stop) => ({
          stopId: "",
          name: stop.store_name ?? "Destinatário",
          phone: "+5531999999999",
        }));
      } else {
        if (!recipientName.trim() || !recipientPhone.trim()) { showError("Revise os dados do destinatário."); setLalamoveCreating(false); return; }
        body.orderId = id;
        body.recipients = [{ stopId: "", name: recipientName.trim(), phone: recipientPhone.trim(), remarks: recipientRemarks.trim() || undefined }];
      }

      const response = await fetch("/api/lalamove/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || data?.message || "Erro ao criar corrida.");

      if (!isMultiStop) {
        await fetch(`/api/logistica/admin/order/${id}/set-status`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliveryStatus: "SAIU_PARA_ENTREGA" }),
        }).catch(() => {});
      }

      await loadAllData(true);
      if (routeId) await loadRouteData();
      showSuccess("Corrida Lalamove criada com sucesso.");
    } catch (error) { showError(error instanceof Error ? error.message : "Erro ao criar corrida Lalamove."); }
    finally { setLalamoveCreating(false); }
  }

  async function handleLalamoveSync(showToast = true) {
    try {
      const orderId = routeData?.lalamove_order_id ?? shipment?.provider_order_id;
      if (!orderId) { if (showToast) showError("Ainda não existe corrida criada na Lalamove."); return; }
      setLalamoveSyncing(true);
      if (showToast) clearMessage();

      const orderResponse = await fetch(`/api/lalamove/provider-order/${orderId}`, { method: "GET", cache: "no-store" });
      const orderData = await orderResponse.json();
      if (!orderResponse.ok) throw new Error(orderData?.error || "Erro ao atualizar a corrida.");

      const driverId = firstString(orderData?.data?.driverId, shipment?.provider_driver_id) ?? null;
      if (driverId) {
        const driverResponse = await fetch(`/api/lalamove/provider-order/${orderId}/driver/${driverId}`, { method: "GET", cache: "no-store" });
        const driverData = await driverResponse.json();
        if (!driverResponse.ok) throw new Error(driverData?.error || "Erro ao atualizar motorista.");
      }

      await loadAllData(true);
      if (routeId) await loadRouteData();
      if (showToast) showSuccess("Dados da corrida Lalamove atualizados.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Erro ao sincronizar Lalamove.";
      if (showToast) showError(text);
    } finally { setLalamoveSyncing(false); }
  }

  async function handleLalamoveCancel() {
    try {
      clearMessage();
      const orderId = routeData?.lalamove_order_id ?? shipment?.provider_order_id;
      if (!orderId) { showError("Ainda não existe corrida criada na Lalamove."); return; }
      setLalamoveCancelling(true);

      const response = await fetch(`/api/lalamove/provider-order/${orderId}/cancel`, {
        method: "POST", headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || data?.message || `Erro HTTP ${response.status}.`);

      if (routeId) {
        await supabase.from("delivery_routes").update({ lalamove_status: "CANCELED", status: "CANCELADA" }).eq("id", routeId);
        await loadRouteData();
      }

      await loadAllData(true);
      showSuccess("Corrida Lalamove cancelada com sucesso.");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Erro ao cancelar corrida.");
    } finally { setLalamoveCancelling(false); }
  }

  function renderProviderSelectorCard() {
    return (
      <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Provedor da entrega</div>
        <div className="mt-1 text-sm text-slate-600">Escolha quem vai conduzir esta entrega dentro da logística.</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ProviderChoiceButton active={selectedProvider === "autonomo"} title="Motorista autônomo" subtitle="Mantém seu fluxo atual com link de rastreio e código de entrega." onClick={() => updateProviderParam("autonomo")} />
          <ProviderChoiceButton active={selectedProvider === "lalamove"} title="Lalamove" subtitle="Cotação automática, chamada rápida e mapa ao vivo no portal." onClick={() => updateProviderParam("lalamove")} />
        </div>
      </div>
    );
  }

  // NOVO: card com paradas da rota múltipla
  function renderRouteStopsCard() {
    if (!isMultiStop) return null;
    return (
      <div className="rounded-[26px] border border-violet-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-slate-900">Rota com múltiplas paradas</div>
            <div className="mt-1 text-sm text-slate-600">{routeStops.length} paradas nesta rota • ordem calculada por distância</div>
          </div>
          <Badge tone="blue">Rota</Badge>
        </div>

        <div className="mt-4 space-y-2">
          {routeStops.map((stop) => (
            <div key={stop.id} className={["rounded-[18px] border p-3", stop.status === "CONFIRMADO" ? "border-green-200 bg-green-50" : "border-slate-200 bg-slate-50"].join(" ")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Parada {stop.stop_order}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{stop.store_name || "Destinatário"}</div>
                  {stop.address ? <div className="mt-1 text-xs text-slate-500">{stop.address}</div> : null}
                  {!stop.address_lat || !stop.address_lng ? <div className="mt-1 text-xs text-red-500">⚠️ Sem coordenadas</div> : null}
                </div>
                <Badge tone={stop.status === "CONFIRMADO" ? "green" : "neutral"}>
                  {stop.status === "CONFIRMADO" ? "✅ Entregue" : "Pendente"}
                </Badge>
              </div>

              {/* Código de confirmação da parada — visível para o admin enviar ao cliente */}
              {stop.status !== "CONFIRMADO" ? (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-[14px] border border-cyan-100 bg-cyan-50 px-3 py-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-cyan-600">Código do cliente</div>
                    <div className="mt-1 text-xl font-semibold tracking-[-0.03em] text-slate-900">
                      {stop.confirmation_code || "—"}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {stop.confirmation_code ? (
                      <>
                        <button type="button"
                          onClick={() => handleCopyText(stop.confirmation_code ?? '', `Código da parada ${stop.stop_order} copiado!`)}
                          className="inline-flex h-8 items-center justify-center rounded-[10px] border border-cyan-200 bg-white px-3 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50">
                          Copiar
                        </button>
                        <a href={`https://wa.me/?text=${encodeURIComponent(`Código de confirmação da entrega: ${stop.confirmation_code}`)}`}
                          target="_blank" rel="noreferrer"
                          className="inline-flex h-8 items-center justify-center rounded-[10px] bg-green-600 px-3 text-xs font-semibold text-white transition hover:bg-green-700">
                          WhatsApp
                        </a>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {/* Link do motorista só aparece para motorista autônomo — Lalamove usa o share link */}
        {routeTrackingLink && !isLalamove ? (
          <div className="mt-4 rounded-[18px] border border-violet-100 bg-violet-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-violet-600">Link do motorista (rota completa)</div>
            <div className="mt-2 text-sm font-semibold text-slate-900 break-all">{routeTrackingLink}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => handleCopyText(routeTrackingLink, "Link copiado!")}
                className="inline-flex h-9 items-center justify-center rounded-[12px] border border-violet-200 bg-white px-3 text-xs font-semibold text-violet-700 transition hover:bg-violet-50">
                Copiar link
              </button>
              <a href={`https://wa.me/?text=${encodeURIComponent(`Sua rota de entregas: ${routeTrackingLink}`)}`} target="_blank" rel="noreferrer"
                className="inline-flex h-9 items-center justify-center rounded-[12px] bg-green-600 px-3 text-xs font-semibold text-white transition hover:bg-green-700">
                Enviar pelo WhatsApp
              </a>
            </div>
          </div>
        ) : null}

        {/* Para Lalamove, orienta que o acompanhamento é pelo share link */}
        {isLalamove ? (
          <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            🚚 O motorista é da Lalamove. Após chamar a corrida, use o <b>share link</b> abaixo para acompanhar a entrega.
          </div>
        ) : null}
      </div>
    );
  }

  function renderLalamoveAutofillActions() {
    return (
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SecondaryActionButton fullWidth onClick={() => handleLalamoveAutofill(true)} disabled={autofilling}>
          {autofilling ? "Preenchendo..." : "Preencher automaticamente"}
        </SecondaryActionButton>
        <SecondaryActionButton fullWidth onClick={() => handleLalamoveSync(true)} disabled={lalamoveSyncing || !hasLalamoveOrder}>
          {lalamoveSyncing ? "Atualizando..." : "Atualizar corrida"}
        </SecondaryActionButton>
      </div>
    );
  }

  function renderLalamoveRequestCard() {
    const quotePrice = isMultiStop ? routeData?.lalamove_price_amount : shipment?.price_amount;
    const quoteCurrency = isMultiStop ? routeData?.lalamove_price_currency : shipment?.price_currency;

    return (
      <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-slate-900">Configuração da corrida Lalamove</div>
            <div className="mt-1 text-sm text-slate-600">
              {isMultiStop ? `Cotação com ${routeStops.length} paradas — calculada automaticamente.` : "A tela já tenta preencher tudo automaticamente."}
            </div>
          </div>
          {loadingShipment ? <Badge tone="neutral">Carregando</Badge> : hasLalamoveQuote ? <Badge tone="green">Cotação salva</Badge> : <Badge tone="neutral">Sem cotação</Badge>}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <div className="rounded-[18px] border border-violet-100 bg-violet-50 p-3 text-sm text-violet-900">
              <b>Cidade Lalamove:</b> {matchedCityLabel || "Carregando identificação automática..."}
            </div>
          </div>

          <Select label="Tipo de veículo" value={serviceType} onChange={setServiceType}
            options={serviceOptions.length > 0 ? serviceOptions : [{ value: "", label: "Sem opções disponíveis" }]} />

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Agendar para</label>
            <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)}
              className="h-12 w-full rounded-[18px] border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-300" />
          </div>

          <div className="md:col-span-2">
            <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Serviço escolhido</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{getServiceLabelPt(currentSelectedService, serviceType)}</div>
              <div className="mt-1 text-sm text-slate-600">{getServiceDescriptionPt(currentSelectedService)}</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-sm text-slate-700">
                <div><span className="font-semibold text-slate-900">Carga:</span> {currentSelectedService?.load?.value || "—"} {currentSelectedService?.load?.unit || ""}</div>
                <div><span className="font-semibold text-slate-900">Comp.:</span> {currentSelectedService?.dimensions?.length?.value || "—"} {currentSelectedService?.dimensions?.length?.unit || ""}</div>
                <div><span className="font-semibold text-slate-900">Larg./Alt.:</span> {currentSelectedService?.dimensions?.width?.value || "—"} x {currentSelectedService?.dimensions?.height?.value || "—"}</div>
              </div>
            </div>
          </div>

          {currentSpecialRequests.length > 0 ? (
            <div className="md:col-span-2">
              <div className="rounded-[18px] border border-slate-200 bg-white p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Solicitações especiais</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {currentSpecialRequests.map((item) => {
                    const active = selectedSpecialRequests.includes(item.name);
                    return (
                      <button key={item.name} type="button" onClick={() => toggleSpecialRequest(item.name)}
                        className={["rounded-full border px-3 py-2 text-xs font-semibold transition", active ? "border-cyan-200 bg-cyan-50 text-cyan-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"].join(" ")}
                        title={translateLalamoveSpecialRequestDescription(item.name, item.description)}>
                        {translateLalamoveSpecialRequestName(item.name)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          <div className="md:col-span-2">
            <Input label="Endereço de coleta" value={pickupAddress} onChange={setPickupAddress} placeholder="Endereço da expedição" />
          </div>
          <Input label="Latitude da coleta" value={pickupLat} onChange={setPickupLat} placeholder="-19.000000" />
          <Input label="Longitude da coleta" value={pickupLng} onChange={setPickupLng} placeholder="-43.000000" />

          {!isMultiStop ? (
            <>
              <div className="md:col-span-2"><Input label="Endereço de entrega" value={dropoffAddress} onChange={setDropoffAddress} placeholder="Endereço da loja" /></div>
              <Input label="Latitude da entrega" value={dropoffLat} onChange={setDropoffLat} placeholder="-19.000000" />
              <Input label="Longitude da entrega" value={dropoffLng} onChange={setDropoffLng} placeholder="-43.000000" />
              <Input label="Destinatário" value={recipientName} onChange={setRecipientName} placeholder="Nome do destinatário" />
              <Input label="Telefone do destinatário" value={recipientPhone} onChange={setRecipientPhone} placeholder="31999999999" />
              <div className="md:col-span-2"><Input label="Observação do destinatário" value={recipientRemarks} onChange={setRecipientRemarks} placeholder="Referência, portaria, quem recebe..." /></div>
            </>
          ) : (
            <div className="md:col-span-2">
              <div className="rounded-[18px] border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
                ℹ️ Modo rota com múltiplas paradas — os endereços de entrega são as {routeStops.length} paradas da rota acima.
              </div>
            </div>
          )}

          <Input label="Remetente" value={senderName} onChange={setSenderName} placeholder="Nome do remetente" />
          <Input label="Telefone do remetente" value={senderPhone} onChange={setSenderPhone} placeholder="31999999999" />
        </div>

        {renderLalamoveAutofillActions()}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SecondaryActionButton fullWidth onClick={handleLalamoveQuote} disabled={lalamoveQuoting}>
            {lalamoveQuoting ? "Cotando..." : "Gerar cotação"}
          </SecondaryActionButton>
          <PrimaryActionButton fullWidth onClick={handleLalamoveCreate} disabled={lalamoveCreating || !hasLalamoveQuote || hasLalamoveOrder}>
            {lalamoveCreating ? "Chamando..." : hasLalamoveOrder ? "Corrida já criada" : "Chamar Lalamove"}
          </PrimaryActionButton>
        </div>

        {hasLalamoveQuote && quotePrice ? (
          <div className="mt-3 rounded-[18px] border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            Cotação: <b>{formatMoney(quotePrice, quoteCurrency)}</b>
          </div>
        ) : null}
      </div>
    );
  }

  function renderLalamoveShipmentCard() {
    const orderId = isMultiStop ? routeData?.lalamove_order_id : shipment?.provider_order_id;
    const quoteId = isMultiStop ? routeData?.lalamove_quote_id : shipment?.provider_quote_id;
    const status = isMultiStop ? routeData?.lalamove_status : shipment?.provider_status;
    const shareLink = isMultiStop ? routeData?.lalamove_share_link : shipment?.share_link;
    const price = isMultiStop ? routeData?.lalamove_price_amount : shipment?.price_amount;
    const currency = isMultiStop ? routeData?.lalamove_price_currency : shipment?.price_currency;

    return (
      <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-slate-900">Corrida Lalamove</div>
            <div className="mt-1 text-sm text-slate-600">Acompanhe cotação, pedido criado e dados retornados pela plataforma.</div>
          </div>
          <Badge tone={lalamoveTone(status)}>{humanizeProviderStatus(status)}</Badge>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cotação</div>
            <div className="mt-2 text-sm font-semibold text-slate-900 break-all">{quoteId || "—"}</div>
          </div>
          <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pedido externo</div>
            <div className="mt-2 text-sm font-semibold text-slate-900 break-all">{orderId || "—"}</div>
          </div>
          <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Motorista</div>
            <div className="mt-2 text-sm font-semibold text-slate-900 break-all">{lalamoveDriverName || shipment?.provider_driver_id || "—"}</div>
            {lalamoveDriverPhone ? <div className="mt-1 text-xs text-slate-500">{lalamoveDriverPhone}</div> : null}
            {lalamoveDriverPlate ? <div className="mt-1 text-xs text-slate-500">Placa: {lalamoveDriverPlate}</div> : null}
          </div>
          <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Valor</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{formatMoney(price, currency)}</div>
          </div>
        </div>

        {shareLink ? (
          <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Share link</div>
            <div className="mt-2 text-sm font-semibold text-slate-900 break-all">{shareLink}</div>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SecondaryActionButton fullWidth onClick={() => handleLalamoveSync(true)} disabled={lalamoveSyncing || !hasLalamoveOrder}>
            {lalamoveSyncing ? "Atualizando..." : "Atualizar corrida"}
          </SecondaryActionButton>
          <SecondaryActionButton fullWidth disabled={!shareLink} onClick={() => shareLink && handleCopyText(shareLink, "Share link copiado.")}>
            Copiar share link
          </SecondaryActionButton>
          <a href={shareLink || "#"} target="_blank" rel="noreferrer" className="block">
            <SecondaryActionButton fullWidth disabled={!shareLink}>Abrir share link</SecondaryActionButton>
          </a>
          <SecondaryActionButton fullWidth disabled={lalamoveCancelling || !hasLalamoveOrder} onClick={handleLalamoveCancel}>
            {lalamoveCancelling ? "Cancelando..." : "Cancelar corrida"}
          </SecondaryActionButton>
        </div>
      </div>
    );
  }

  function renderLalamoveMapCard(heightClass = "h-[360px]") {
    return (
      <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-slate-900">Mapa da corrida</div>
            <div className="mt-1 text-sm text-slate-600">Última posição conhecida do motorista pela Lalamove.</div>
          </div>
          {lalamoveMapOpenUrl ? <a href={lalamoveMapOpenUrl} target="_blank" rel="noreferrer"><SecondaryActionButton>Abrir Maps</SecondaryActionButton></a> : null}
        </div>

        {lalamoveHasMap && lalamoveLastLat != null && lalamoveLastLng != null ? (
          <>
            <div className="mt-4 overflow-hidden rounded-[20px] border border-slate-200">
              <div className={`${heightClass} w-full`}>
                <MapContainer key={mapKey} center={[lalamoveLastLat, lalamoveLastLng]} zoom={16} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
                  <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                  {/* Segue o veículo automaticamente */}
                  <RecenterMap center={[lalamoveLastLat, lalamoveLastLng]} followVehicle={followVehicle} />

                  <Circle center={[lalamoveLastLat, lalamoveLastLng]} radius={Math.max(Number(lalamoveLastAccuracy ?? 15), 8)} pathOptions={{ color: "#7c3aed", fillColor: "#a78bfa", fillOpacity: 0.18 }} />
                  <Marker position={[lalamoveLastLat, lalamoveLastLng]} icon={lalamoveIcon}>
                    <Popup>
                      <div className="text-sm">
                        <div className="font-semibold">Corrida Lalamove</div>
                        {lalamoveDriverName ? <div className="mt-1">Motorista: {lalamoveDriverName}</div> : null}
                        {lalamoveDriverPhone ? <div>Telefone: {lalamoveDriverPhone}</div> : null}
                        {lalamoveDriverPlate ? <div>Placa: {lalamoveDriverPlate}</div> : null}
                        <div className="mt-1">Último check-in: {formatDateTime(lalamoveLastSeenAt)}</div>
                      </div>
                    </Popup>
                  </Marker>

                  {/* Marcador de retirada (pickup) */}
                  {hasPickup ? (
                    <Marker position={[pickupLatNum!, pickupLngNum!]} icon={pickupIcon}>
                      <Popup>
                        <div className="text-sm">
                          <div className="font-semibold">🏭 Ponto de retirada</div>
                          <div className="mt-1 text-slate-600">{pickupAddress || "Endereço de retirada"}</div>
                        </div>
                      </Popup>
                    </Marker>
                  ) : null}

                  {/* Marcador de entrega (dropoff) */}
                  {hasDropoff ? (
                    <Marker position={[dropoffLatNum!, dropoffLngNum!]} icon={dropoffIcon}>
                      <Popup>
                        <div className="text-sm">
                          <div className="font-semibold">🏪 Ponto de entrega</div>
                          <div className="mt-1 text-slate-600">{dropoffAddress || "Endereço de entrega"}</div>
                        </div>
                      </Popup>
                    </Marker>
                  ) : null}
                </MapContainer>
              </div>
            </div>

            {/* Legenda */}
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[14px] border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">🛵 <span>Motorista</span></span>
              <span className="text-slate-300">|</span>
              <span className="inline-flex items-center gap-1">🏭 <span>Retirada</span></span>
              <span className="text-slate-300">|</span>
              <span className="inline-flex items-center gap-1">🏪 <span>Entrega</span></span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <SecondaryActionButton onClick={() => setFollowVehicle((v) => !v)}>
                {followVehicle ? "Seguindo motorista" : "Seguir motorista"}
              </SecondaryActionButton>
              {lalamoveMapOpenUrl ? (
                <a href={lalamoveMapOpenUrl} target="_blank" rel="noreferrer">
                  <SecondaryActionButton>Abrir no Google Maps</SecondaryActionButton>
                </a>
              ) : null}
              {lalamoveDriverPhone ? (
                <a
                  href={`https://wa.me/${lalamoveDriverPhone.replace(/\D/g, "")}?text=${encodeURIComponent("Olá! Sou da equipe de logística. Preciso falar sobre a entrega em andamento.")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <button type="button"
                    className="inline-flex h-12 items-center justify-center rounded-[18px] bg-green-600 px-5 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(22,163,74,0.26)] transition hover:bg-green-700">
                    WhatsApp do motorista
                  </button>
                </a>
              ) : null}
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-[20px] border border-dashed border-slate-300 p-6 text-sm text-slate-500">Ainda não há coordenadas da corrida Lalamove registradas no portal.</div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={isDispatchMode ? "Saída para entrega" : "Logística da entrega"} subtitle="Carregando dados da operação."
          right={<Link href="/adm/logistica"><SecondaryActionButton>Voltar</SecondaryActionButton></Link>} />
        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6"><div className="text-sm text-slate-600">Carregando...</div></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-6">
        <PageHeader title={isDispatchMode ? "Saída para entrega" : "Logística da entrega"} subtitle="Pedido não encontrado."
          right={<Link href="/adm/logistica"><SecondaryActionButton>Voltar</SecondaryActionButton></Link>} />
        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="rounded-[22px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">Não foi possível localizar este pedido.</div>
        </div>
      </div>
    );
  }

  // ===================== RENDER PRINCIPAL =====================

  const pageTitle = isDispatchMode
    ? `Saída para entrega ${id.slice(0, 8)}`
    : isMultiStop
    ? `Logística — Rota com ${routeStops.length} paradas`
    : `Logística do pedido ${id.slice(0, 8)}`;

  const pageSubtitle = isDispatchMode
    ? `Fluxo rápido para expedição • ${getProviderLabel(selectedProvider)}`
    : isMultiStop
    ? `Pedido ${id.slice(0, 8)} • ${getProviderLabel(selectedProvider)}`
    : "Controle operacional da entrega, rastreio e confirmação.";

  return (
    <div className="space-y-6">
      <PageHeader
        title={pageTitle}
        subtitle={pageSubtitle}
        right={
          <div className="flex flex-wrap gap-2">
            <SecondaryActionButton onClick={() => loadAllData(true)} disabled={refreshing}>
              {refreshing ? "Atualizando..." : "Atualizar"}
            </SecondaryActionButton>
            <Link href={isDispatchMode ? "/adm/expedicao" : "/adm/logistica"}>
              <SecondaryActionButton>Voltar</SecondaryActionButton>
            </Link>
            {!isDispatchMode && <Link href={`/adm/pedidos/${id}`}><SecondaryActionButton>Abrir pedido</SecondaryActionButton></Link>}
          </div>
        }
      />

      {message ? (
        <div className={`rounded-[26px] border p-4 text-sm shadow-sm ${messageTone === "green" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {message}
        </div>
      ) : null}

      {/* Para retirada, não mostra seletor de provedor — fluxo é diferente */}
      {!isPickup ? renderProviderSelectorCard() : null}

      {/* NOVO: card de paradas da rota múltipla */}
      {renderRouteStopsCard()}

      {/* Métricas — rota múltipla mostra resumo da rota; pedido único mostra dados do pedido */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {isMultiStop ? (
          <>
            <MetricCard title="Paradas na rota" value={`${routeStops.length} paradas`} subtitle={`${routeStops.filter(s => s.status === "CONFIRMADO").length} concluídas`} />
            <MetricCard title="Lojas" value={routeStops.map(s => s.store_name?.split(" ")[0] ?? "Loja").join(", ")} subtitle="Ordem por distância" />
          </>
        ) : (
          <>
            <MetricCard title="Pedido" value={id.slice(0, 8)} subtitle={String(order.status ?? "—")} />
            <MetricCard title="Loja" value={storeLabel} />
          </>
        )}
        {isLalamove ? (
          <>
            <MetricCard title="Status interno" value={getDeliveryStatusLabel(overview?.delivery_status ?? "PENDENTE")} subtitle={`Saída: ${formatDateTime(overview?.delivery_started_at)}`} />
            <MetricCard title="Status Lalamove" value={humanizeProviderStatus(isMultiStop ? routeData?.lalamove_status : shipment?.provider_status)} subtitle={formatDateTime(shipment?.updated_at)} />
          </>
        ) : (
          <>
            <MetricCard title="Status logístico" value={getDeliveryStatusLabel(overview?.delivery_status ?? "PENDENTE")} subtitle={`Saída: ${formatDateTime(overview?.delivery_started_at)}`} />
            <MetricCard title="Rastreio" value={getTrackingStatusLabel(overview?.tracking_status ?? null)} subtitle={`Check-in: ${formatDateTime(internalLastSeenAt)}`} />
          </>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {isPickup ? (
            /* RETIRADA: card informativo — confirmação é feita pelo cliente no portal */
            <div className="rounded-[30px] border border-amber-200 bg-amber-50 p-5 shadow-sm md:p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-amber-100 text-2xl">🏪</div>
                <div>
                  <div className="text-base font-semibold text-slate-900">Pedido de retirada</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Este pedido não possui entrega — o franqueado retira pessoalmente no centro de distribuição.
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {/* Status atual */}
                <div className="rounded-[20px] border border-amber-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status atual</div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className={["h-3 w-3 rounded-full", overview?.delivery_status === "ENTREGUE" ? "bg-green-500" : "bg-amber-400"].join(" ")} />
                    <span className="text-sm font-semibold text-slate-900">
                      {getDeliveryStatusLabel(overview?.delivery_status ?? "PENDENTE")}
                    </span>
                  </div>
                  {overview?.delivery_finished_at ? (
                    <div className="mt-2 text-xs text-slate-500">
                      Confirmado em: <b>{formatDateTime(overview.delivery_finished_at)}</b>
                    </div>
                  ) : null}
                </div>

                {/* Código de retirada */}
                <div className="rounded-[20px] border border-amber-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Código de retirada</div>
                  {overview?.confirmation_status === "CONFIRMADO" ? (
                    <div className="mt-3">
                      <div className="rounded-[14px] border border-green-200 bg-green-50 p-3">
                        <div className="text-sm font-semibold text-green-700">✅ Retirada confirmada por código</div>
                        <div className="mt-1 text-xs text-green-600">
                          Confirmado em: <b>{formatDateTime(overview?.confirmed_at)}</b>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          O franqueado inseriu o código de retirada no portal — prova de recebimento registrada.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <div className="rounded-[14px] border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                        🔒 O código de retirada é gerado automaticamente quando o pedido entra em separação
                        e fica visível <b>somente para o franqueado</b> no portal dele em{" "}
                        <b>Pedidos → Acompanhar entrega</b>.
                      </div>
                      <div className="mt-3 text-xs text-slate-500">
                        Status do código: <b>{getConfirmationStatusLabel(overview?.confirmation_status ?? null)}</b>
                      </div>
                    </div>
                  )}
                </div>

                {/* Ação — marcar em separação */}
                {overview?.delivery_status === "PENDENTE" || overview?.delivery_status === null ? (
                  <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Ação</div>
                    <SecondaryActionButton fullWidth onClick={handleMarkSeparation} disabled={markingSeparation}>
                      {markingSeparation ? "Processando..." : "Marcar em separação e gerar código"}
                    </SecondaryActionButton>
                    <div className="mt-2 text-xs text-slate-500">
                      Ao marcar em separação, o código de retirada será gerado automaticamente e o franqueado poderá vê-lo no portal.
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : isLalamove ? (
            <>
              {renderLalamoveRequestCard()}
              {renderLalamoveShipmentCard()}
              {renderLalamoveMapCard("h-[460px]")}
            </>
          ) : (
            <>
              {/* Motorista autônomo */}
              <div id="driver-form-section" className={["rounded-[30px] border bg-white p-5 shadow-sm md:p-6", showDriverValidation && !driverDataValid ? "border-red-300" : "border-slate-200"].join(" ")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">Dados do motorista</div>
                  {showDriverValidation && !driverDataValid ? (
                    <div className="text-xs font-semibold text-red-600">⚠️ Obrigatório para sair para entrega</div>
                  ) : null}
                </div>
                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Input label="Nome do motorista *" value={driverName} onChange={(v) => { setDriverName(v); setDriverNameDirty(true); if (v.trim()) setShowDriverValidation(false); }} placeholder="Ex.: Carlos Henrique" />
                    {showDriverValidation && !driverNameValid ? (
                      <div className="mt-1 text-xs font-semibold text-red-500">Nome do motorista é obrigatório</div>
                    ) : null}
                  </div>
                  <div>
                    <Input label="Telefone do motorista *" value={driverPhone} onChange={(v) => { setDriverPhone(v); setDriverPhoneDirty(true); if (v.trim()) setShowDriverValidation(false); }} placeholder="Ex.: 31999999999" />
                    {showDriverValidation && !driverPhoneValid ? (
                      <div className="mt-1 text-xs font-semibold text-red-500">Telefone do motorista é obrigatório</div>
                    ) : null}
                  </div>
                  <div className="md:col-span-2">
                    <Input label="Observações logísticas" value={deliveryNotes} onChange={(v) => { setDeliveryNotes(v); setDeliveryNotesDirty(true); }} placeholder="Ex.: portaria, condomínio, entrega urgente" />
                  </div>
                </div>
                {showDriverValidation && !driverDataValid ? (
                  <div className="mt-4 rounded-[18px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    Preencha o <b>nome</b> e o <b>telefone</b> do motorista antes de sair para entrega.
                  </div>
                ) : null}
                <div className="mt-6 flex flex-wrap gap-3">
                  <PrimaryActionButton onClick={handleSaveDriver} disabled={savingDriver}>{savingDriver ? "Salvando..." : "Salvar motorista"}</PrimaryActionButton>
                  <SecondaryActionButton onClick={handleMarkSeparation} disabled={markingSeparation}>{markingSeparation ? "Processando..." : "Marcar em separação"}</SecondaryActionButton>
                </div>
              </div>

              {!isMultiStop ? (
                <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                  <div className="text-sm font-semibold text-slate-900">Saída para entrega</div>
                  <div className="mt-1 text-sm text-slate-600">Ao iniciar a entrega, o sistema gera link de rastreio e código de confirmação.</div>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <PrimaryActionButton
                      onClick={handleStartDelivery}
                      disabled={startingDelivery || !canStartDelivery || !driverDataValid}>
                      {startingDelivery ? "Gerando..." : "Sair para entrega"}
                    </PrimaryActionButton>
                    {!driverDataValid ? (
                      <button type="button"
                        onClick={() => {
                          setShowDriverValidation(true);
                          document.getElementById("driver-form-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                        className="inline-flex h-12 items-center justify-center rounded-[18px] border border-red-200 bg-red-50 px-5 text-sm font-semibold text-red-600 transition hover:bg-red-100">
                        ⚠️ Preencher dados do motorista
                      </button>
                    ) : null}
                    <SecondaryActionButton onClick={handleRegenerateCode} disabled={regeneratingCode}>
                      {regeneratingCode ? "Gerando..." : "Regenerar código"}
                    </SecondaryActionButton>
                  </div>
                  {!canStartDelivery ? <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Este pedido já saiu para entrega ou já foi concluído.</div> : null}

                  {/* Link rastreio */}
                  <div className="mt-6">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Link do motorista</div>
                    <div className="mt-2 rounded-[18px] border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-900 break-all">{trackingLink || "O link aparecerá após sair para entrega."}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <SecondaryActionButton disabled={!trackingLink} onClick={() => trackingLink && handleCopyText(trackingLink, "Link copiado.")}>Copiar link</SecondaryActionButton>
                      <a href={driverWhatsAppUrl || "#"} target="_blank" rel="noreferrer"><SecondaryActionButton disabled={!trackingLink}>Enviar por WhatsApp</SecondaryActionButton></a>
                    </div>
                  </div>

                  {/* Código de confirmação — SOMENTE o cliente vê o código */}
                  <div className="mt-6">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confirmação de entrega</div>
                    {overview?.confirmation_status === "CONFIRMADO" ? (
                      <div className="mt-3 rounded-[18px] border border-green-200 bg-green-50 p-3">
                        <div className="text-sm font-semibold text-green-700">
                          ✅ Entrega confirmada por código
                        </div>
                        <div className="mt-1 text-xs text-slate-600">
                          Confirmado em: {formatDateTime(overview?.confirmed_at)}
                          {overview?.confirmed_by ? ` • por: ${overview.confirmed_by}` : ""}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          O cliente inseriu o código de confirmação pessoalmente no portal.
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-[18px] border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                        🔒 O código de confirmação é visível apenas para o cliente no portal dele — isso garante que somente quem recebeu o pedido pode confirmar a entrega.
                        <div className="mt-2 text-xs text-slate-500">
                          Status atual: {overview?.confirmation_status ? getConfirmationStatusLabel(overview.confirmation_status) : "Aguardando saída para entrega"}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Mapa */}
              {internalHasMap && internalLastLat != null && internalLastLng != null ? (
                <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                  <div className="text-sm font-semibold text-slate-900">Mapa e rastreio</div>
                  <div className="mt-4 overflow-hidden rounded-[24px] border border-slate-200">
                    <div className="h-[460px] w-full">
                      <MapContainer key={mapKey} center={[internalLastLat, internalLastLng]} zoom={16} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
                        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <Circle center={[internalLastLat, internalLastLng]} radius={Math.max(Number(internalLastAccuracy ?? 15), 8)} pathOptions={{ color: "#0891b2", fillColor: "#22d3ee", fillOpacity: 0.18 }} />
                        <Marker position={[internalLastLat, internalLastLng]} icon={deliveryIcon}>
                          <Popup><div className="text-sm"><div className="font-semibold">Entrega em andamento</div><div className="mt-1">Check-in: {formatDateTime(internalLastSeenAt)}</div></div></Popup>
                        </Marker>

                        {/* Marcador de retirada (pickup) */}
                        {hasPickup ? (
                          <Marker position={[pickupLatNum!, pickupLngNum!]} icon={pickupIcon}>
                            <Popup>
                              <div className="text-sm">
                                <div className="font-semibold">🏭 Ponto de retirada</div>
                                <div className="mt-1 text-slate-600">{pickupAddress || "Endereço de retirada"}</div>
                              </div>
                            </Popup>
                          </Marker>
                        ) : null}

                        {/* Marcador de entrega (dropoff) */}
                        {hasDropoff ? (
                          <Marker position={[dropoffLatNum!, dropoffLngNum!]} icon={dropoffIcon}>
                            <Popup>
                              <div className="text-sm">
                                <div className="font-semibold">🏪 Ponto de entrega</div>
                                <div className="mt-1 text-slate-600">{dropoffAddress || "Endereço de entrega"}</div>
                              </div>
                            </Popup>
                          </Marker>
                        ) : null}
                      </MapContainer>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <SecondaryActionButton disabled={!internalHasMap} onClick={() => { setFollowVehicle(true); setMapKey((k) => k + 1); }}>Centralizar no mapa</SecondaryActionButton>
                    {internalMapOpenUrl ? <a href={internalMapOpenUrl} target="_blank" rel="noreferrer"><SecondaryActionButton>Abrir no Google Maps</SecondaryActionButton></a> : null}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Sidebar */}
        <div>
          <div className="xl:sticky xl:top-24">
            <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <div className="text-lg font-semibold tracking-[-0.02em] text-slate-900">Ações</div>
              <div className="mt-6 grid gap-3">
                <SecondaryActionButton onClick={() => loadAllData(true)} disabled={refreshing}>{refreshing ? "Atualizando..." : "Atualizar entrega"}</SecondaryActionButton>
                {isLalamove && <SecondaryActionButton onClick={() => handleLalamoveAutofill(true)} disabled={autofilling}>{autofilling ? "Preenchendo..." : "Preencher automático"}</SecondaryActionButton>}
                {isLalamove && <SecondaryActionButton onClick={() => handleLalamoveSync(true)} disabled={lalamoveSyncing || !hasLalamoveOrder}>{lalamoveSyncing ? "Sincronizando..." : "Sincronizar Lalamove"}</SecondaryActionButton>}
                <Link href={isDispatchMode ? "/adm/expedicao" : "/adm/logistica"}><SecondaryActionButton>Voltar</SecondaryActionButton></Link>
                <Link href={`/adm/pedidos/${id}`}><PrimaryActionButton>Abrir pedido</PrimaryActionButton></Link>
              </div>

              <div className="mt-6 rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resumo rápido</div>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <div className="flex items-center justify-between gap-3"><span>Status</span><Badge tone={deliveryTone(overview?.delivery_status ?? "PENDENTE")}>{getDeliveryStatusLabel(overview?.delivery_status ?? "PENDENTE")}</Badge></div>
                  {isLalamove ? (
                    <>
                      <div className="flex items-center justify-between gap-3"><span>Lalamove</span><Badge tone={lalamoveTone(isMultiStop ? routeData?.lalamove_status : shipment?.provider_status)}>{humanizeProviderStatus(isMultiStop ? routeData?.lalamove_status : shipment?.provider_status)}</Badge></div>
                      <div className="flex items-center justify-between gap-3"><span>Motorista</span><span className="font-semibold text-slate-900 text-right">{lalamoveDriverName || "Não atribuído"}</span></div>
                      {lalamoveDriverPhone ? (
                        <>
                          <div className="flex items-center justify-between gap-3">
                            <span>Telefone</span>
                            <span className="font-semibold text-slate-900">{lalamoveDriverPhone}</span>
                          </div>
                          <a
                            href={`https://wa.me/${lalamoveDriverPhone.replace(/\D/g, "")}?text=${encodeURIComponent("Olá! Sou da equipe de logística. Preciso falar sobre a entrega em andamento.")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex w-full h-12 items-center justify-center rounded-[18px] bg-green-600 px-5 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(22,163,74,0.26)] transition hover:bg-green-700"
                          >
                            WhatsApp do motorista
                          </a>
                        </>
                      ) : null}
                      {lalamoveDriverPlate ? <div className="flex items-center justify-between gap-3"><span>Placa</span><span className="font-semibold text-slate-900">{lalamoveDriverPlate}</span></div> : null}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3"><span>Rastreio</span><Badge tone={trackingTone(overview?.tracking_status ?? null)}>{getTrackingStatusLabel(overview?.tracking_status ?? null)}</Badge></div>
                      <div className="flex items-center justify-between gap-3"><span>Motorista</span><span className="font-semibold text-slate-900">{overview?.delivery_driver_name || "Não informado"}</span></div>
                    </>
                  )}
                  {isMultiStop ? (
                    <div className="flex items-center justify-between gap-3">
                      <span>Paradas</span>
                      <span className="font-semibold text-slate-900">{routeStops.filter(s => s.status === "CONFIRMADO").length}/{routeStops.length} concluídas</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Registrar ocorrência</div>
                <div className="mt-3"><Input value={occurrenceNotes} onChange={setOccurrenceNotes} placeholder="Descreva a ocorrência" /></div>
                <div className="mt-4"><SecondaryActionButton onClick={handleOccurrence} disabled={registeringOccurrence}>{registeringOccurrence ? "Registrando..." : "Registrar ocorrência"}</SecondaryActionButton></div>
              </div>

              <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ajuste manual</div>
                <div className="mt-4 grid grid-cols-1 gap-3">
                  {/* Retirada — aviso no topo, ajuste limitado a Recebido/Em Separação */}
                  {isPickup ? (
                    <div className="rounded-[18px] border border-amber-100 bg-amber-50 p-3 text-xs text-amber-700">
                      🏪 Pedido de retirada — apenas <b>Recebido</b> e <b>Em separação</b> podem ser ajustados. A confirmação é feita pelo franqueado no portal via código.
                    </div>
                  ) : null}

                  {/* Status travado — confirmado por código ou Lalamove concluída */}
                  {isStatusLocked ? (
                    <div className={["rounded-[18px] border p-4", isLalamoveCompleted ? "border-violet-200 bg-violet-50" : "border-green-200 bg-green-50"].join(" ")}>
                      <div className={["text-sm font-semibold", isLalamoveCompleted ? "text-violet-700" : "text-green-700"].join(" ")}>
                        🔒 Status bloqueado
                      </div>
                      <div className={["mt-1 text-xs", isLalamoveCompleted ? "text-violet-600" : "text-green-600"].join(" ")}>
                        {isLalamoveCompleted
                          ? `A corrida foi concluída pela Lalamove. O status não pode mais ser alterado manualmente.`
                          : `Este pedido foi confirmado por código de entrega em ${formatDateTime(overview?.confirmed_at)}. O status não pode mais ser alterado manualmente.`
                        }
                      </div>
                    </div>
                  ) : isLalamoveCanceled && isLalamove ? (
                    <div className="rounded-[18px] border border-amber-200 bg-amber-50 p-4">
                      <div className="text-sm font-semibold text-amber-700">⚠️ Corrida cancelada</div>
                      <div className="mt-1 text-xs text-amber-600">
                        A corrida Lalamove foi cancelada. O pedido voltou automaticamente para Em separação.
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Para retirada: só mostra Recebido e Em Separação. Para entrega: mostra até Saiu para Entrega */}
                      {(isPickup
                        ? ["PENDENTE", "EM_SEPARACAO"] as DeliveryStatus[]
                        : ["PENDENTE", "EM_SEPARACAO", "SAIU_PARA_ENTREGA"] as DeliveryStatus[]
                      ).map((s) => {
                        const needsDriver = s === "SAIU_PARA_ENTREGA" && !driverDataValid;
                        return (
                          <button key={s} type="button"
                            disabled={settingStatus === s}
                            onClick={() => handleSetStatus(s)}
                            className={["inline-flex h-12 w-full items-center justify-center rounded-[18px] border px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                              needsDriver
                                ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                                : "border-slate-200 bg-white text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] hover:bg-slate-50"
                            ].join(" ")}>
                            {settingStatus === s ? "Alterando..." : needsDriver ? `⚠️ Marcar: ${getDeliveryStatusLabel(s)}` : `Marcar: ${getDeliveryStatusLabel(s)}`}
                          </button>
                        );
                      })}
                      <div className="rounded-[18px] border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
                        {isPickup
                          ? "🔒 Retirada confirmada pelo franqueado no portal via código gerado automaticamente."
                          : "🔒 Entregue só é marcado automaticamente — via código de confirmação do cliente ou Lalamove."}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}