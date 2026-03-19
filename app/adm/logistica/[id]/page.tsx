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
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
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

  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} dia(s) atrás`;
}

function formatCoord(value: number | null | undefined) {
  if (value == null) return "—";
  return Number(value).toFixed(6);
}

function formatMoney(value: number | null | undefined, currency?: string | null) {
  if (value == null) return "—";

  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency || "BRL",
    }).format(Number(value));
  } catch {
    return `${Number(value).toFixed(2)} ${currency || "BRL"}`;
  }
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

    DRIVER_HELP_AND_EXTRA_ASSISTANT_1: "Motorista + assistente extra • 1 hora",
    DRIVER_HELP_AND_EXTRA_ASSISTANT_2: "Motorista + assistente extra • 2 horas",
    DRIVER_HELP_AND_EXTRA_ASSISTANT_3: "Motorista + assistente extra • 3 horas",

    THERMAL_BAG_1: "Bolsa térmica",

    RENTAL_TIME_1HR: "Tempo adicional • 1 hora",
    RENTAL_TIME_2HR: "Tempo adicional • 2 horas",
    RENTAL_TIME_3HR: "Tempo adicional • 3 horas",
    RENTAL_TIME_4HR: "Tempo adicional • 4 horas",

    HOURLY_RENTAL_1: "Hora extra • 1 hora",
    HOURLY_RENTAL_2: "Hora extra • 2 horas",
    HOURLY_RENTAL_3: "Hora extra • 3 horas",
    HOURLY_RENTAL_4: "Hora extra • 4 horas",

    WAITING_TIME_030MIN: "Tempo de espera • 30 min",
    WAITING_TIME_060MIN: "Tempo de espera • 1 hora",
    WAITING_TIME_1: "Fila/espera • 30 min",
    WAITING_TIME_2: "Fila/espera • 1 hora",

    HOUSE_MOVING_MAX120MIN: "Mudança • tempo extra 2 horas",
    HOUSE_MOVING_MAX180MIN: "Mudança • tempo extra 3 horas",
    HOUSE_MOVING_MAX240MIN: "Mudança • tempo extra 4 horas",

    MOVING_SERVICE_1: "Mudança + assistente • 2 horas",
    MOVING_SERVICE_2: "Mudança + assistente • 3 horas",
    MOVING_SERVICE_3: "Mudança + assistente • 4 horas",

    EXTRA_TIME_1: "Tempo extra • 1 hora",
    EXTRA_TIME_2: "Tempo extra • 2 horas",
    EXTRA_TIME_3: "Tempo extra • 4 horas",

    REFRIGERATED_VEHICLE: "Veículo refrigerado",
    INSULATED_VEHICLE: "Veículo isolado térmico",
    FROZEN_VEHICLE: "Veículo congelado",
    REFRIGERATED_UV_1: "UV refrigerado • isolado",
    REFRIGERATED_UV_2: "UV refrigerado • -1°C a -15°C",
    REFRIGERATED_UV_3: "UV refrigerado • abaixo de -15°C",
  };

  return map[name] || name.replace(/_/g, " ");
}

function translateLalamoveSpecialRequestDescription(
  name: string,
  description?: string
) {
  const map: Record<string, string> = {
    LOADING_1DRIVER_MAX030MIN: "Ajuda do motorista no carregamento ou descarregamento por até 30 minutos.",
    LOADING_1DRIVER_MAX060MIN: "Ajuda do motorista no carregamento ou descarregamento por até 1 hora.",
    LOADING_1DRIVER_MAX090MIN: "Ajuda do motorista no carregamento ou descarregamento por até 1 hora e 30 minutos.",
    LOADING_1DRIVER_MAX120MIN: "Ajuda do motorista no carregamento ou descarregamento por até 2 horas.",
    LOADING_1DRIVER_MAX180MIN: "Ajuda do motorista no carregamento ou descarregamento por até 3 horas.",

    LOADING_1DRIVER1HELPER_MAX060MIN: "Motorista com 1 ajudante por até 1 hora.",
    LOADING_1DRIVER1HELPER_MAX120MIN: "Motorista com 1 ajudante por até 2 horas.",
    LOADING_1DRIVER1HELPER_MAX180MIN: "Motorista com 1 ajudante por até 3 horas.",

    LOADING_1DRIVER1HELPER: "Carga e descarga feitas por motorista com 1 ajudante.",
    HELPER: "Ajuda adicional do motorista.",
    HELPER_2: "Ajuda adicional do motorista por até 1 hora.",
    HELPER_3: "Ajuda adicional do motorista por até 1 hora e 30 minutos.",
    THERMAL_BAG_1: "Entrega com bolsa térmica.",
  };

  return map[name] || description || translateLalamoveSpecialRequestName(name);
}

function getServiceLabelPt(service: LalamoveServiceOption | null, key?: string) {
  const serviceKey = (service?.key || key || "").toUpperCase();

  const map: Record<string, string> = {
    CAR: "Carro",
    CARFOURH: "Carro por 4 horas",
    HATCHBACK: "Hatch",
    LALAGO: "Moto / entrega leve",
    LALAGOFOUR: "Moto por 4 horas",
    LALAPRO: "Moto com baú",
    TRUCK330: "Caminhão 3,30 m",
    TRUCK_6H: "Caminhão por 6 horas",
    UV_4H: "Utilitário por 4 horas",
    UV_FIORINO: "Fiorino / utilitário",
    VAN: "Van",
    VANFOURH: "Van por 4 horas",
  };

  return map[serviceKey] || serviceKey || "—";
}

function getServiceDescriptionPt(service: LalamoveServiceOption | null) {
  const key = (service?.key || "").toUpperCase();

  const map: Record<string, string> = {
    CAR: "Carro com espaço adicional para volumes médios.",
    CARFOURH: "Carro disponível por até 4 horas.",
    HATCHBACK: "Ideal para pacotes médios e compras.",
    LALAGO: "Ideal para documentos, pequenos pacotes e delivery.",
    LALAGOFOUR: "Entregas com moto por até 4 horas.",
    LALAPRO: "Moto com baú, com mais espaço que a categoria comum.",
    TRUCK330: "Ideal para cargas grandes e pesadas.",
    TRUCK_6H: "Caminhão disponível por até 6 horas.",
    UV_4H: "Utilitário disponível por até 4 horas.",
    UV_FIORINO: "Ideal para volumes maiores e materiais.",
    VAN: "Ideal para cargas médias e volumes maiores.",
    VANFOURH: "Van disponível por até 4 horas.",
  };

  if (map[key]) return map[key];
  return service?.description || "—";
}

function translateSpecialRequestName(name: string) {
  const map: Record<string, string> = {
    LOADING_1DRIVER_MAX030MIN: "Ajuda do motorista na carga/descarga até 30 min",
    LOADING_1DRIVER_MAX060MIN: "Ajuda do motorista na carga/descarga até 1h",
    LOADING_1DRIVER_MAX090MIN: "Ajuda do motorista na carga/descarga até 1h30",
    LOADING_1DRIVER_MAX120MIN: "Ajuda do motorista na carga/descarga até 2h",
    LOADING_1DRIVER_MAX180MIN: "Ajuda do motorista na carga/descarga até 3h",

    LOADING_1DRIVER1HELPER: "Motorista + 1 ajudante",
    LOADING_1DRIVER1HELPER_MAX060MIN: "Motorista + 1 ajudante até 1h",
    LOADING_1DRIVER1HELPER_MAX120MIN: "Motorista + 1 ajudante até 2h",
    LOADING_1DRIVER1HELPER_MAX180MIN: "Motorista + 1 ajudante até 3h",

    HELPER: "Ajuda do motorista até 30 min / 1h",
    HELPER_2: "Ajuda do motorista até 1h / 2h",
    HELPER_3: "Ajuda do motorista até 1h30 / 3h",

    DRIVER_HELP_AND_EXTRA_ASSISTANT_1: "Motorista + ajudante extra até 1h",
    DRIVER_HELP_AND_EXTRA_ASSISTANT_2: "Motorista + ajudante extra até 2h",
    DRIVER_HELP_AND_EXTRA_ASSISTANT_3: "Motorista + ajudante extra até 3h",

    THERMAL_BAG_1: "Bolsa térmica",

    RENTAL_TIME_1HR: "Tempo extra até 1h",
    RENTAL_TIME_2HR: "Tempo extra até 2h",
    RENTAL_TIME_3HR: "Tempo extra até 3h",
    RENTAL_TIME_4HR: "Tempo extra até 4h",

    HOURLY_RENTAL_1: "Serviço extra 1h",
    HOURLY_RENTAL_2: "Serviço extra 2h",
    HOURLY_RENTAL_3: "Serviço extra 3h / 4h",
    HOURLY_RENTAL_4: "Serviço extra 4h",

    WAITING_TIME_030MIN: "Tempo de espera até 30 min",
    WAITING_TIME_060MIN: "Tempo de espera até 1h",
    WAITING_TIME_1: "Fila / espera até 30 min",
    WAITING_TIME_2: "Fila / espera até 1h",

    HOUSE_MOVING_MAX120MIN: "Mudança / tempo extra até 2h",
    HOUSE_MOVING_MAX180MIN: "Mudança / tempo extra até 3h",
    HOUSE_MOVING_MAX240MIN: "Mudança / tempo extra até 4h",

    MOVING_SERVICE_1: "Mudança com ajudante extra até 2h",
    MOVING_SERVICE_2: "Mudança com ajudante extra até 3h",
    MOVING_SERVICE_3: "Mudança com ajudante extra até 4h",

    REFRIGERATED_VEHICLE: "Veículo refrigerado",
    INSULATED_VEHICLE: "Veículo isotérmico",
    FROZEN_VEHICLE: "Veículo congelado",
    REFRIGERATED_UV_1: "Utilitário refrigerado (isotérmico)",
    REFRIGERATED_UV_2: "Utilitário refrigerado (-1°C a -15°C)",
    REFRIGERATED_UV_3: "Utilitário refrigerado (abaixo de -15°C)",
  };

  return map[name] || name;
}

function humanizeProviderStatus(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
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

function confirmationTone(status: ConfirmationStatus | null) {
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

function lalamoveTone(status: string | null | undefined) {
  const normalized = String(status || "").toUpperCase();

  if (
    normalized.includes("DELIVERED") ||
    normalized.includes("COMPLETED") ||
    normalized.includes("FINISHED")
  ) {
    return "green" as const;
  }

  if (
    normalized.includes("ASSIGNED") ||
    normalized.includes("PICKED") ||
    normalized.includes("ONGOING") ||
    normalized.includes("IN_TRANSIT") ||
    normalized.includes("ON_GOING") ||
    normalized.includes("DRIVER")
  ) {
    return "blue" as const;
  }

  if (
    normalized.includes("PENDING") ||
    normalized.includes("MATCHING") ||
    normalized.includes("QUEUE") ||
    normalized.includes("QUEUING") ||
    normalized.includes("PROCESSING")
  ) {
    return "yellow" as const;
  }

  if (
    normalized.includes("CANCEL") ||
    normalized.includes("FAIL") ||
    normalized.includes("EXPIRED") ||
    normalized.includes("REJECT")
  ) {
    return "red" as const;
  }

  return "neutral" as const;
}

function buildWhatsAppUrl(phone: string, message: string) {
  const cleanPhone = (phone || "").replace(/\D/g, "");
  const encoded = encodeURIComponent(message.trim());

  if (!cleanPhone) return `https://wa.me/?text=${encoded}`;
  return `https://wa.me/${cleanPhone}?text=${encoded}`;
}

function buildDriverMessage(link: string, orderId: string) {
  return [
    `Pedido ${orderId.slice(0, 8)} saiu para entrega.`,
    "",
    "Abra este link para compartilhar sua localização durante esta entrega:",
    link,
  ].join("\n");
}

function buildCustomerCodeMessage(code: string, orderId: string) {
  return [
    `Seu pedido ${orderId.slice(0, 8)} saiu para entrega.`,
    "",
    `Código de confirmação: ${code}`,
    "Informe este código ao entregador no momento do recebimento.",
  ].join("\n");
}

function buildGoogleMapsOpenUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function createDeliveryIcon(emoji = "🛵", bg = "#0891b2") {
  return L.divIcon({
    className: "custom-delivery-marker",
    html: `
      <div style="
        width:40px;
        height:40px;
        border-radius:9999px;
        background:${bg};
        display:flex;
        align-items:center;
        justify-content:center;
        box-shadow:0 10px 24px rgba(8,145,178,0.35);
        border:3px solid white;
        font-size:20px;
      ">${emoji}</div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });
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

// FIX: expanded driver info extraction to cover more Lalamove payload structures
function extractLalamoveDriverSnapshot(shipment: LalamoveShipmentRow | null) {
  const driverPayload = shipment?.last_driver_payload ?? null;
  const orderPayload = shipment?.last_order_payload ?? null;
  const webhookPayload = shipment?.last_webhook_payload ?? null;

  // DIAGNÓSTICO: loga os payloads brutos para identificar a estrutura real
  console.log("[DRIVER] last_driver_payload:", JSON.stringify(driverPayload, null, 2));
  console.log("[DRIVER] last_order_payload:", JSON.stringify(orderPayload, null, 2));
  console.log("[DRIVER] last_webhook_payload:", JSON.stringify(webhookPayload, null, 2));
  console.log("[DRIVER] provider_driver_id:", shipment?.provider_driver_id);

  const lat = firstNumber(
    driverPayload?.data?.coordinates?.lat,
    driverPayload?.data?.coordinates?.latitude,
    driverPayload?.data?.driver?.coordinates?.lat,
    driverPayload?.data?.driver?.coordinates?.latitude,
    driverPayload?.data?.driver?.location?.lat,
    driverPayload?.data?.driver?.location?.latitude,
    orderPayload?.data?.driver?.coordinates?.lat,
    orderPayload?.data?.driver?.coordinates?.latitude,
    orderPayload?.data?.driver?.location?.lat,
    orderPayload?.data?.driver?.location?.latitude,
    webhookPayload?.data?.driver?.coordinates?.lat,
    webhookPayload?.data?.driver?.coordinates?.latitude,
    webhookPayload?.data?.driver?.location?.lat,
    webhookPayload?.data?.driver?.location?.latitude
  );

  const lng = firstNumber(
    driverPayload?.data?.coordinates?.lng,
    driverPayload?.data?.coordinates?.lon,
    driverPayload?.data?.coordinates?.longitude,
    driverPayload?.data?.driver?.coordinates?.lng,
    driverPayload?.data?.driver?.coordinates?.lon,
    driverPayload?.data?.driver?.coordinates?.longitude,
    driverPayload?.data?.driver?.location?.lng,
    driverPayload?.data?.driver?.location?.lon,
    driverPayload?.data?.driver?.location?.longitude,
    orderPayload?.data?.driver?.coordinates?.lng,
    orderPayload?.data?.driver?.coordinates?.lon,
    orderPayload?.data?.driver?.coordinates?.longitude,
    orderPayload?.data?.driver?.location?.lng,
    orderPayload?.data?.driver?.location?.lon,
    orderPayload?.data?.driver?.location?.longitude,
    webhookPayload?.data?.driver?.coordinates?.lng,
    webhookPayload?.data?.driver?.coordinates?.lon,
    webhookPayload?.data?.driver?.coordinates?.longitude,
    webhookPayload?.data?.driver?.location?.lng,
    webhookPayload?.data?.driver?.location?.lon,
    webhookPayload?.data?.driver?.location?.longitude
  );

  const accuracy = firstNumber(
    driverPayload?.data?.accuracy,
    driverPayload?.data?.driver?.accuracy,
    driverPayload?.data?.driver?.location?.accuracy,
    orderPayload?.data?.driver?.accuracy,
    orderPayload?.data?.driver?.location?.accuracy,
    webhookPayload?.data?.driver?.accuracy,
    webhookPayload?.data?.driver?.location?.accuracy
  );

  const updatedAt = firstString(
    driverPayload?.data?.updatedAt,
    driverPayload?.data?.timestamp,
    driverPayload?.data?.driver?.updatedAt,
    orderPayload?.data?.updatedAt,
    orderPayload?.data?.driver?.updatedAt,
    webhookPayload?.data?.updatedAt,
    webhookPayload?.data?.driver?.updatedAt,
    shipment?.updated_at
  );

  // FIX: expanded name extraction to cover more Lalamove response structures
  const driverName = firstString(
    driverPayload?.data?.name,
    driverPayload?.data?.driver?.name,
    driverPayload?.data?.driverInfo?.name,
    orderPayload?.data?.driver?.name,
    orderPayload?.data?.driverInfo?.name,
    orderPayload?.data?.drivers?.[0]?.name,
    webhookPayload?.data?.driver?.name,
    webhookPayload?.data?.driverInfo?.name,
    webhookPayload?.data?.drivers?.[0]?.name,
    shipment?.provider_driver_id
  );

  // FIX: expanded phone extraction to cover more Lalamove response structures
  const driverPhone = firstString(
    driverPayload?.data?.phone,
    driverPayload?.data?.driver?.phone,
    driverPayload?.data?.driverInfo?.phone,
    driverPayload?.data?.driver?.phoneNumber,
    orderPayload?.data?.driver?.phone,
    orderPayload?.data?.driverInfo?.phone,
    orderPayload?.data?.driver?.phoneNumber,
    orderPayload?.data?.drivers?.[0]?.phone,
    orderPayload?.data?.drivers?.[0]?.phoneNumber,
    webhookPayload?.data?.driver?.phone,
    webhookPayload?.data?.driverInfo?.phone,
    webhookPayload?.data?.driver?.phoneNumber,
    webhookPayload?.data?.drivers?.[0]?.phone
  );

  // FIX: also extract plate and photo for richer display
  const driverPlate = firstString(
    driverPayload?.data?.plateNumber,
    driverPayload?.data?.driver?.plateNumber,
    driverPayload?.data?.driverInfo?.plateNumber,
    orderPayload?.data?.driver?.plateNumber,
    orderPayload?.data?.driverInfo?.plateNumber,
    webhookPayload?.data?.driver?.plateNumber,
    webhookPayload?.data?.driverInfo?.plateNumber
  );

  const driverPhoto = firstString(
    driverPayload?.data?.photo,
    driverPayload?.data?.driver?.photo,
    driverPayload?.data?.driverInfo?.photo,
    orderPayload?.data?.driver?.photo,
    orderPayload?.data?.driverInfo?.photo,
    webhookPayload?.data?.driver?.photo,
    webhookPayload?.data?.driverInfo?.photo
  );

  return {
    lat,
    lng,
    accuracy,
    updatedAt,
    driverName,
    driverPhone,
    driverPlate,
    driverPhoto,
  };
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
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900 break-words">
        {value}
      </div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

function ProviderChoiceButton({
  active,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-[22px] border p-4 text-left transition",
        active
          ? "border-cyan-200 bg-cyan-50 shadow-[0_10px_24px_rgba(8,145,178,0.12)]"
          : "border-slate-200 bg-white hover:bg-slate-50",
      ].join(" ")}
    >
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

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [overview, setOverview] = useState<DeliveryOverviewRow | null>(null);
  const [storeLabel, setStoreLabel] = useState("Sem loja");

  const [shipment, setShipment] = useState<LalamoveShipmentRow | null>(null);

  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [occurrenceNotes, setOccurrenceNotes] = useState("");

  const [driverNameDirty, setDriverNameDirty] = useState(false);
  const [driverPhoneDirty, setDriverPhoneDirty] = useState(false);
  const [deliveryNotesDirty, setDeliveryNotesDirty] = useState(false);

  const [lastGeneratedCode, setLastGeneratedCode] = useState<string | null>(null);

  const [serviceType, setServiceType] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupLat, setPickupLat] = useState("");
  const [pickupLng, setPickupLng] = useState("");
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

  const showSuccess = (text: string) => {
    setMessage(text);
    setMessageTone("green");
  };

  const showError = (text: string) => {
    setMessage(text);
    setMessageTone("red");
  };

  const clearMessage = () => {
    setMessage(null);
    setMessageTone(null);
  };

  const updateProviderParam = useCallback(
    (provider: DeliveryProvider) => {
      const params = new URLSearchParams(searchParams.toString());

      params.set("provider", provider);

      if (isDispatchMode) params.set("mode", "dispatch");
      else params.delete("mode");

      const query = params.toString();
      router.replace(query ? `/adm/logistica/${id}?${query}` : `/adm/logistica/${id}`);
    },
    [searchParams, isDispatchMode, router, id]
  );

  const currentSelectedService = useMemo(
    () => availableServices.find((item) => item.key === serviceType) ?? null,
    [availableServices, serviceType]
  );

  const currentSpecialRequests = useMemo(
    () => currentSelectedService?.specialRequests ?? [],
    [currentSelectedService]
  );

  const loadLalamoveShipment = useCallback(
    async (silent = false) => {
      try {
        if (!silent) setLoadingShipment(true);

        const { data, error } = await supabase
          .from("order_shipments")
          .select(`
            id,
            local_order_id,
            provider,
            provider_market,
            provider_order_id,
            provider_quote_id,
            provider_driver_id,
            provider_status,
            provider_event_type,
            share_link,
            service_type,
            pickup_address,
            pickup_lat,
            pickup_lng,
            dropoff_address,
            dropoff_lat,
            dropoff_lng,
            sender_name,
            sender_phone,
            recipient_name,
            recipient_phone,
            price_amount,
            price_currency,
            last_quote_payload,
            last_order_payload,
            last_driver_payload,
            last_webhook_payload,
            created_at,
            updated_at
          `)
          .eq("local_order_id", id)
          .eq("provider", "LALAMOVE")
          .maybeSingle();

        if (error) throw error;

        const nextShipment = (data ?? null) as LalamoveShipmentRow | null;
        setShipment(nextShipment);

        if (!didInitialLalamoveLoadRef.current) {
          setServiceType(nextShipment?.service_type ?? "");
          setPickupAddress(nextShipment?.pickup_address ?? "");
          setPickupLat(
            nextShipment?.pickup_lat != null ? String(nextShipment.pickup_lat) : ""
          );
          setPickupLng(
            nextShipment?.pickup_lng != null ? String(nextShipment.pickup_lng) : ""
          );
          setDropoffAddress(nextShipment?.dropoff_address ?? "");
          setDropoffLat(
            nextShipment?.dropoff_lat != null ? String(nextShipment.dropoff_lat) : ""
          );
          setDropoffLng(
            nextShipment?.dropoff_lng != null ? String(nextShipment.dropoff_lng) : ""
          );
          setSenderName(nextShipment?.sender_name ?? "");
          setSenderPhone(nextShipment?.sender_phone ?? "");
          setRecipientName(nextShipment?.recipient_name ?? "");
          setRecipientPhone(nextShipment?.recipient_phone ?? "");
          didInitialLalamoveLoadRef.current = true;
        }
      } catch (error) {
        if (!silent) {
          const text =
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os dados da Lalamove.";
          showError(text);
        }
      } finally {
        if (!silent) setLoadingShipment(false);
      }
    },
    [id]
  );

  const applyServerData = useCallback(
    (
      data: {
        order?: OrderRow | null;
        overview?: DeliveryOverviewRow | null;
        storeLabel?: string;
      },
      options?: {
        preserveForm?: boolean;
        clearFlashMessage?: boolean;
      }
    ) => {
      const preserveForm = options?.preserveForm ?? true;
      const clearFlashMessage = options?.clearFlashMessage ?? false;

      if (clearFlashMessage) clearMessage();

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
        setDriverNameDirty(false);
        setDriverPhoneDirty(false);
        setDeliveryNotesDirty(false);
        didInitialFormLoadRef.current = true;
      } else {
        if (!driverNameDirty) setDriverName(nextOverview?.delivery_driver_name ?? "");
        if (!driverPhoneDirty) setDriverPhone(nextOverview?.delivery_driver_phone ?? "");
        if (!deliveryNotesDirty) setDeliveryNotes(nextOverview?.delivery_notes ?? "");
      }

      if (
        followVehicle &&
        nextOverview?.last_lat != null &&
        nextOverview?.last_lng != null &&
        (nextOverview.last_lat !== prevLat || nextOverview.last_lng !== prevLng)
      ) {
        setMapKey((k) => k + 1);
      }
    },
    [
      overview?.last_lat,
      overview?.last_lng,
      followVehicle,
      driverNameDirty,
      driverPhoneDirty,
      deliveryNotesDirty,
    ]
  );

  const loadAllData = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        const response = await fetch(`/api/logistica/admin/order/${id}/overview`, {
          method: "GET",
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(data.message || "Erro ao carregar logística.");
        }

        applyServerData(data, {
          preserveForm: true,
          clearFlashMessage: false,
        });

        await loadLalamoveShipment(true);
      } catch (error) {
        const text =
          error instanceof Error ? error.message : "Erro ao carregar logística.";
        showError(text);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id, applyServerData, loadLalamoveShipment]
  );

  const loadLiveOnly = useCallback(async () => {
    try {
      const response = await fetch(`/api/logistica/admin/order/${id}/overview`, {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.ok) return;

      applyServerData(data, {
        preserveForm: true,
        clearFlashMessage: false,
      });

      await loadLalamoveShipment(true);
    } catch {
      // polling silencioso
    }
  }, [id, applyServerData, loadLalamoveShipment]);

  const handleLalamoveAutofill = useCallback(
    async (force = false) => {
      try {
        setAutofilling(true);

        const response = await fetch("/api/lalamove/autofill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: id }),
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(
            data?.message || "Não foi possível preencher automaticamente a Lalamove."
          );
        }

        const payload = data.data as {
          matchedCity: { locode: string; name: string } | null;
          preferredServiceType: string | null;
          services: LalamoveServiceOption[];
          pickup: {
            address: string;
            lat: number | null;
            lng: number | null;
            name: string;
            phone: string;
          };
          dropoff: {
            address: string;
            lat: number | null;
            lng: number | null;
            name: string;
            phone: string;
            city?: string | null;
            state?: string | null;
          };
        };

        setMatchedCityLabel(
          payload.matchedCity
            ? `${payload.matchedCity.name} • ${payload.matchedCity.locode}`
            : "Cidade não identificada"
        );

        setAvailableServices(payload.services ?? []);

        if (force || !serviceType) {
          setServiceType(
            shipment?.service_type ||
              payload.preferredServiceType ||
              payload.services?.[0]?.key ||
              ""
          );
        }

        if (force || !pickupAddress) setPickupAddress(payload.pickup.address || "");
        if (force || !pickupLat) {
          setPickupLat(
            payload.pickup.lat != null ? String(payload.pickup.lat) : ""
          );
        }
        if (force || !pickupLng) {
          setPickupLng(
            payload.pickup.lng != null ? String(payload.pickup.lng) : ""
          );
        }

        if (force || !dropoffAddress) setDropoffAddress(payload.dropoff.address || "");
        if (force || !dropoffLat) {
          setDropoffLat(
            payload.dropoff.lat != null ? String(payload.dropoff.lat) : ""
          );
        }
        if (force || !dropoffLng) {
          setDropoffLng(
            payload.dropoff.lng != null ? String(payload.dropoff.lng) : ""
          );
        }

        if (force || !senderName) setSenderName(payload.pickup.name || "");
        if (force || !senderPhone) setSenderPhone(payload.pickup.phone || "");
        if (force || !recipientName) setRecipientName(payload.dropoff.name || "");
        if (force || !recipientPhone) setRecipientPhone(payload.dropoff.phone || "");

        didAutofillRef.current = true;

        if (force) {
          showSuccess("Dados da Lalamove preenchidos automaticamente.");
        }
      } catch (error) {
        const text =
          error instanceof Error
            ? error.message
            : "Não foi possível preencher a Lalamove automaticamente.";
        showError(text);
      } finally {
        setAutofilling(false);
      }
    },
    [
      id,
      shipment?.service_type,
      serviceType,
      pickupAddress,
      pickupLat,
      pickupLng,
      dropoffAddress,
      dropoffLat,
      dropoffLng,
      senderName,
      senderPhone,
      recipientName,
      recipientPhone,
    ]
  );

  const syncLalamoveSilently = useCallback(async () => {
    if (!shipment?.provider_order_id) return;

    try {
      const orderResponse = await fetch(
        `/api/lalamove/provider-order/${shipment.provider_order_id}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      if (!orderResponse.ok) return;

      const orderData = await orderResponse.json();
      const driverId =
        firstString(orderData?.data?.driverId, shipment.provider_driver_id) ?? null;

      if (driverId) {
        await fetch(
          `/api/lalamove/provider-order/${shipment.provider_order_id}/driver/${driverId}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );
      }

      await loadLalamoveShipment(true);
    } catch {
      // sync silenciosa
    }
  }, [shipment?.provider_order_id, shipment?.provider_driver_id, loadLalamoveShipment]);

  useEffect(() => {
    loadAllData(false);
  }, [loadAllData]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadLiveOnly();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [loadLiveOnly]);

  useEffect(() => {
    if (!isLalamove) return;
    if (didAutofillRef.current) return;
    handleLalamoveAutofill(false);
  }, [isLalamove, handleLalamoveAutofill]);

  useEffect(() => {
    if (!isLalamove) return;
    if (!shipment?.provider_order_id) return;

    const interval = window.setInterval(() => {
      syncLalamoveSilently();
    }, 10000);

    return () => window.clearInterval(interval);
  }, [isLalamove, shipment?.provider_order_id, syncLalamoveSilently]);

  useEffect(() => {
    const coordKey = `${shipment?.provider_order_id || ""}|${firstNumber(
      shipment?.last_driver_payload?.data?.coordinates?.lat,
      shipment?.last_driver_payload?.data?.driver?.coordinates?.lat,
      shipment?.last_driver_payload?.data?.driver?.location?.lat,
      shipment?.last_order_payload?.data?.driver?.coordinates?.lat,
      shipment?.last_order_payload?.data?.driver?.location?.lat
    ) || ""}|${firstNumber(
      shipment?.last_driver_payload?.data?.coordinates?.lng,
      shipment?.last_driver_payload?.data?.driver?.coordinates?.lng,
      shipment?.last_driver_payload?.data?.driver?.location?.lng,
      shipment?.last_order_payload?.data?.driver?.coordinates?.lng,
      shipment?.last_order_payload?.data?.driver?.location?.lng
    ) || ""}`;

    if (!followVehicle) return;
    if (!coordKey.trim()) return;
    if (coordKey === lastLalamoveMapCoordRef.current) return;

    lastLalamoveMapCoordRef.current = coordKey;
    setMapKey((k) => k + 1);
  }, [shipment, followVehicle]);

  useEffect(() => {
    if (!currentSelectedService) {
      setSelectedSpecialRequests([]);
      return;
    }

    const validSet = new Set(
      (currentSelectedService.specialRequests ?? []).map((item) => item.name)
    );

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

  const canStartDelivery =
    overview?.delivery_status !== "SAIU_PARA_ENTREGA" &&
    overview?.delivery_status !== "ENTREGUE";

  const internalLastLat = overview?.last_lat ?? null;
  const internalLastLng = overview?.last_lng ?? null;
  const internalLastAccuracy = overview?.last_accuracy ?? null;
  const internalLastSeenAt = overview?.last_seen_at ?? null;

  const internalHasMap = internalLastLat != null && internalLastLng != null;
  const internalFormattedCoords = internalHasMap
    ? `${internalLastLat.toFixed(5)}, ${internalLastLng.toFixed(5)}`
    : "—";
  const internalFormattedCoordsOrText = internalHasMap
    ? `${internalLastLat.toFixed(5)}, ${internalLastLng.toFixed(5)}`
    : "Sem coordenadas";

  const internalMapOpenUrl = useMemo(() => {
    if (internalLastLat == null || internalLastLng == null) return "";
    return buildGoogleMapsOpenUrl(internalLastLat, internalLastLng);
  }, [internalLastLat, internalLastLng]);

  const lalamoveSnapshot = useMemo(
    () => extractLalamoveDriverSnapshot(shipment),
    [shipment]
  );

  const lalamoveLastLat = lalamoveSnapshot.lat;
  const lalamoveLastLng = lalamoveSnapshot.lng;
  const lalamoveLastAccuracy = lalamoveSnapshot.accuracy;
  const lalamoveLastSeenAt = lalamoveSnapshot.updatedAt ?? shipment?.updated_at ?? null;
  const lalamoveDriverName = lalamoveSnapshot.driverName ?? null;
  const lalamoveDriverPhone = lalamoveSnapshot.driverPhone ?? null;
  // FIX: expose plate and photo from snapshot
  const lalamoveDriverPlate = lalamoveSnapshot.driverPlate ?? null;
  const lalamoveDriverPhoto = lalamoveSnapshot.driverPhoto ?? null;
  const lalamoveHasMap = lalamoveLastLat != null && lalamoveLastLng != null;

  const lalamoveFormattedCoords = lalamoveHasMap
    ? `${lalamoveLastLat?.toFixed(5)}, ${lalamoveLastLng?.toFixed(5)}`
    : "—";

  const lalamoveMapOpenUrl = useMemo(() => {
    if (lalamoveLastLat == null || lalamoveLastLng == null) return "";
    return buildGoogleMapsOpenUrl(lalamoveLastLat, lalamoveLastLng);
  }, [lalamoveLastLat, lalamoveLastLng]);

  const deliveryIcon = useMemo(() => createDeliveryIcon("🛵", "#0891b2"), []);
  const lalamoveIcon = useMemo(() => createDeliveryIcon("🚚", "#7c3aed"), []);

  const hasLalamoveQuote = !!shipment?.provider_quote_id;
  const hasLalamoveOrder = !!shipment?.provider_order_id;

  const serviceOptions = useMemo(
    () =>
      availableServices.map((service) => ({
        value: service.key,
        label: `${getServiceLabelPt(service)} • ${getServiceDescriptionPt(service)}`,
      })),
    [availableServices]
  );

  async function handleSaveDriver() {
    try {
      setSavingDriver(true);
      clearMessage();

      const response = await fetch(`/api/logistica/admin/order/${id}/save-driver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverName,
          driverPhone,
          deliveryNotes,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Erro ao salvar dados do motorista.");
      }

      setDriverNameDirty(false);
      setDriverPhoneDirty(false);
      setDeliveryNotesDirty(false);

      await loadAllData(true);
      showSuccess(data.message || "Dados atualizados com sucesso.");
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Erro ao salvar motorista.";
      showError(text);
    } finally {
      setSavingDriver(false);
    }
  }

  async function handleMarkSeparation() {
    try {
      setMarkingSeparation(true);
      clearMessage();

      const response = await fetch(`/api/logistica/admin/order/${id}/mark-separation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverName,
          driverPhone,
          deliveryNotes,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Erro ao marcar em separação.");
      }

      setDriverNameDirty(false);
      setDriverPhoneDirty(false);
      setDeliveryNotesDirty(false);

      await loadAllData(true);
      showSuccess(data.message || "Pedido marcado em separação.");
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Erro ao marcar separação.";
      showError(text);
    } finally {
      setMarkingSeparation(false);
    }
  }

  async function handleStartDelivery() {
    try {
      setStartingDelivery(true);
      clearMessage();

      const response = await fetch(`/api/logistica/admin/order/${id}/start-delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverName,
          driverPhone,
          deliveryNotes,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Erro ao iniciar entrega.");
      }

      setLastGeneratedCode(data.confirmationCode ?? null);
      setDriverNameDirty(false);
      setDriverPhoneDirty(false);
      setDeliveryNotesDirty(false);

      await loadAllData(true);
      showSuccess(data.message || "Entrega iniciada com sucesso.");
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Erro ao iniciar entrega.";
      showError(text);
    } finally {
      setStartingDelivery(false);
    }
  }

  async function handleRegenerateCode() {
    try {
      setRegeneratingCode(true);
      clearMessage();

      const response = await fetch(`/api/logistica/admin/order/${id}/regenerate-code`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Erro ao regenerar código.");
      }

      setLastGeneratedCode(data.confirmationCode ?? null);

      await loadAllData(true);
      showSuccess(data.message || "Código regenerado com sucesso.");
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Erro ao regenerar código.";
      showError(text);
    } finally {
      setRegeneratingCode(false);
    }
  }

  async function handleOccurrence() {
    try {
      if (!occurrenceNotes.trim()) {
        showError("Informe a observação da ocorrência.");
        return;
      }

      setRegisteringOccurrence(true);
      clearMessage();

      const response = await fetch(`/api/logistica/admin/order/${id}/occurrence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: occurrenceNotes,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Erro ao registrar ocorrência.");
      }

      setOccurrenceNotes("");
      await loadAllData(true);
      showSuccess(data.message || "Ocorrência registrada com sucesso.");
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Erro ao registrar ocorrência.";
      showError(text);
    } finally {
      setRegisteringOccurrence(false);
    }
  }

  async function handleSetStatus(status: DeliveryStatus) {
    try {
      setSettingStatus(status);
      clearMessage();

      const response = await fetch(`/api/logistica/admin/order/${id}/set-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryStatus: status }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Erro ao atualizar status.");
      }

      await loadAllData(true);
      showSuccess(data.message || "Status atualizado com sucesso.");
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Erro ao atualizar status.";
      showError(text);
    } finally {
      setSettingStatus(null);
    }
  }

  async function handleCopyText(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      showSuccess(successMessage);
    } catch {
      showError("Não foi possível copiar.");
    }
  }

  function toggleSpecialRequest(name: string) {
    setSelectedSpecialRequests((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  }

  async function handleLalamoveQuote() {
    try {
      clearMessage();

      if (!serviceType.trim()) {
        showError("Selecione o tipo de veículo da Lalamove.");
        return;
      }

      if (!pickupAddress.trim() || !pickupLat.trim() || !pickupLng.trim()) {
        showError("A coleta ainda não está completa. Revise os dados automáticos.");
        return;
      }

      if (!dropoffAddress.trim() || !dropoffLat.trim() || !dropoffLng.trim()) {
        showError("A entrega ainda não está completa. Revise os dados automáticos.");
        return;
      }

      setLalamoveQuoting(true);

      const response = await fetch("/api/lalamove/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: id,
          serviceType: serviceType.trim(),
          specialRequests: selectedSpecialRequests,
          scheduleAt: toIsoDateTime(scheduleAt),
          language: "pt_BR",
          pickup: {
            address: pickupAddress.trim(),
            lat: pickupLat.trim(),
            lng: pickupLng.trim(),
          },
          dropoff: {
            address: dropoffAddress.trim(),
            lat: dropoffLat.trim(),
            lng: dropoffLng.trim(),
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || data?.message || "Erro ao gerar cotação da Lalamove."
        );
      }

      await loadAllData(true);

      const total =
        normalizeNumber(data?.data?.priceBreakdown?.total) ??
        normalizeNumber(data?.priceBreakdown?.total) ??
        shipment?.price_amount ??
        null;

      const currency =
        firstString(data?.data?.priceBreakdown?.currency, data?.priceBreakdown?.currency) ??
        "BRL";

      if (total != null) {
        showSuccess(`Cotação gerada: ${formatMoney(total, currency)}.`);
      } else {
        showSuccess("Cotação Lalamove gerada com sucesso.");
      }
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Erro ao gerar cotação Lalamove.";
      showError(text);
    } finally {
      setLalamoveQuoting(false);
    }
  }

  async function handleLalamoveCreate() {
    try {
      clearMessage();

      if (!shipment?.provider_quote_id) {
        showError("Gere a cotação antes de chamar a Lalamove.");
        return;
      }

      if (!senderName.trim() || !senderPhone.trim()) {
        showError("Revise os dados do remetente.");
        return;
      }

      if (!recipientName.trim() || !recipientPhone.trim()) {
        showError("Revise os dados do destinatário.");
        return;
      }

      setLalamoveCreating(true);

      const response = await fetch("/api/lalamove/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: id,
          quotationId: shipment.provider_quote_id,
          sender: {
            name: senderName.trim(),
            phone: senderPhone.trim(),
          },
          recipient: {
            name: recipientName.trim(),
            phone: recipientPhone.trim(),
            remarks: recipientRemarks.trim() || undefined,
          },
          partnerName: "Portal American Burger",
          isPODEnabled: false,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || data?.message || "Erro ao criar corrida na Lalamove."
        );
      }

      try {
        await fetch(`/api/logistica/admin/order/${id}/set-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliveryStatus: "SAIU_PARA_ENTREGA" }),
        });
      } catch {
        // sem bloqueio
      }

      await loadAllData(true);
      showSuccess("Corrida Lalamove criada com sucesso.");
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Erro ao criar corrida Lalamove.";
      showError(text);
    } finally {
      setLalamoveCreating(false);
    }
  }

  // FIX: handleLalamoveSync now correctly defined at component level (not nested inside itself)
  async function handleLalamoveSync(showToast = true) {
    try {
      if (!shipment?.provider_order_id) {
        if (showToast) showError("Ainda não existe corrida criada na Lalamove.");
        return;
      }

      setLalamoveSyncing(true);
      if (showToast) clearMessage();

      const orderResponse = await fetch(
        `/api/lalamove/provider-order/${shipment.provider_order_id}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const orderData = await orderResponse.json();

      if (!orderResponse.ok) {
        throw new Error(
          orderData?.error || orderData?.message || "Erro ao atualizar a corrida."
        );
      }

      const driverId =
        firstString(orderData?.data?.driverId, shipment.provider_driver_id) ?? null;

      if (driverId) {
        const driverResponse = await fetch(
          `/api/lalamove/provider-order/${shipment.provider_order_id}/driver/${driverId}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const driverData = await driverResponse.json();

        if (!driverResponse.ok) {
          throw new Error(
            driverData?.error || driverData?.message || "Erro ao atualizar motorista."
          );
        }
      }

      await loadAllData(true);

      if (showToast) {
        showSuccess("Dados da corrida Lalamove atualizados.");
      }
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Erro ao sincronizar Lalamove.";
      if (showToast) showError(text);
    } finally {
      setLalamoveSyncing(false);
    }
  }

  // FIX: handleLalamoveCancel now correctly defined at component level (was duplicated and nested inside handleLalamoveSync)
  async function handleLalamoveCancel() {
    try {
      clearMessage();

      if (!shipment?.provider_order_id) {
        showError("Ainda não existe corrida criada na Lalamove.");
        return;
      }

      setLalamoveCancelling(true);

      // DIAGNÓSTICO: loga o ID antes de chamar
      console.log("[CANCEL] provider_order_id:", shipment.provider_order_id);

      const url = `/api/lalamove/provider-order/${shipment.provider_order_id}/cancel`;
      console.log("[CANCEL] URL:", url);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      // DIAGNÓSTICO: loga status e resposta completa
      console.log("[CANCEL] HTTP status:", response.status);
      console.log("[CANCEL] Resposta completa:", JSON.stringify(data, null, 2));

      if (!response.ok) {
        throw new Error(
          data?.error || data?.message || `Erro HTTP ${response.status} ao cancelar corrida na Lalamove.`
        );
      }

      await loadAllData(true);
      showSuccess("Corrida Lalamove cancelada com sucesso.");
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "Erro ao cancelar corrida.";
      console.error("[CANCEL] Erro:", text);
      showError(text);
    } finally {
      setLalamoveCancelling(false);
    }
  }

  function renderProviderSelectorCard() {
    return (
      <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Provedor da entrega
        </div>
        <div className="mt-1 text-sm text-slate-600">
          Escolha quem vai conduzir esta entrega dentro da logística.
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ProviderChoiceButton
            active={selectedProvider === "autonomo"}
            title="Motorista autônomo"
            subtitle="Mantém seu fluxo atual com link de rastreio e código de entrega."
            onClick={() => updateProviderParam("autonomo")}
          />

          <ProviderChoiceButton
            active={selectedProvider === "lalamove"}
            title="Lalamove"
            subtitle="Cotação automática, chamada rápida e mapa ao vivo no portal."
            onClick={() => updateProviderParam("lalamove")}
          />
        </div>
      </div>
    );
  }

  function renderLalamoveAutofillActions() {
    return (
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SecondaryActionButton
          fullWidth
          onClick={() => handleLalamoveAutofill(true)}
          disabled={autofilling}
        >
          {autofilling ? "Preenchendo..." : "Preencher automaticamente"}
        </SecondaryActionButton>

        <SecondaryActionButton
          fullWidth
          onClick={() => handleLalamoveSync(true)}
          disabled={lalamoveSyncing || !shipment?.provider_order_id}
        >
          {lalamoveSyncing ? "Atualizando..." : "Atualizar corrida"}
        </SecondaryActionButton>
      </div>
    );
  }

  function renderLalamoveRequestCard() {
    return (
      <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-slate-900">
              Configuração da corrida Lalamove
            </div>
            <div className="mt-1 text-sm text-slate-600">
              A tela já tenta preencher tudo automaticamente.
            </div>
          </div>

          {loadingShipment ? (
            <Badge tone="neutral">Carregando</Badge>
          ) : shipment?.provider_quote_id ? (
            <Badge tone="green">Cotação salva</Badge>
          ) : (
            <Badge tone="neutral">Sem cotação</Badge>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <div className="rounded-[18px] border border-violet-100 bg-violet-50 p-3 text-sm text-violet-900">
              <b>Cidade Lalamove:</b> {matchedCityLabel || "Carregando identificação automática..."}
            </div>
          </div>

          <Select
            label="Tipo de veículo"
            value={serviceType}
            onChange={setServiceType}
            options={
              serviceOptions.length > 0
                ? serviceOptions
                : [{ value: "", label: "Sem opções disponíveis" }]
            }
          />

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Agendar para
            </label>
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="h-12 w-full rounded-[18px] border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-300"
            />
          </div>

          <div className="md:col-span-2">
            <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Serviço escolhido
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {getServiceLabelPt(currentSelectedService, serviceType)}
              </div>

              <div className="mt-1 text-sm text-slate-600">
                {getServiceDescriptionPt(currentSelectedService)}
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3 text-sm text-slate-700">
                <div>
                  <span className="font-semibold text-slate-900">Carga:</span>{" "}
                  {currentSelectedService?.load?.value || "—"}{" "}
                  {currentSelectedService?.load?.unit || ""}
                </div>
                <div>
                  <span className="font-semibold text-slate-900">Comp.:</span>{" "}
                  {currentSelectedService?.dimensions?.length?.value || "—"}{" "}
                  {currentSelectedService?.dimensions?.length?.unit || ""}
                </div>
                <div>
                  <span className="font-semibold text-slate-900">Larg./Alt.:</span>{" "}
                  {currentSelectedService?.dimensions?.width?.value || "—"} x{" "}
                  {currentSelectedService?.dimensions?.height?.value || "—"}{" "}
                  {currentSelectedService?.dimensions?.height?.unit || ""}
                </div>
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="rounded-[18px] border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Solicitações especiais
              </div>

              {currentSpecialRequests.length === 0 ? (
                <div className="mt-2 text-sm text-slate-500">
                  Este serviço não trouxe opções especiais.
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {currentSpecialRequests.map((item) => {
                    const active = selectedSpecialRequests.includes(item.name);

                    return (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => toggleSpecialRequest(item.name)}
                        className={[
                          "rounded-full border px-3 py-2 text-xs font-semibold transition",
                          active
                            ? "border-cyan-200 bg-cyan-50 text-cyan-700"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                        ].join(" ")}
                        title={translateLalamoveSpecialRequestDescription(item.name, item.description)}
                      >
                        {translateLalamoveSpecialRequestName(item.name)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="md:col-span-2">
            <Input
              label="Endereço de coleta"
              value={pickupAddress}
              onChange={setPickupAddress}
              placeholder="Endereço da expedição"
            />
          </div>

          <Input
            label="Latitude da coleta"
            value={pickupLat}
            onChange={setPickupLat}
            placeholder="-19.000000"
          />

          <Input
            label="Longitude da coleta"
            value={pickupLng}
            onChange={setPickupLng}
            placeholder="-43.000000"
          />

          <div className="md:col-span-2">
            <Input
              label="Endereço de entrega"
              value={dropoffAddress}
              onChange={setDropoffAddress}
              placeholder="Endereço da loja"
            />
          </div>

          <Input
            label="Latitude da entrega"
            value={dropoffLat}
            onChange={setDropoffLat}
            placeholder="-19.000000"
          />

          <Input
            label="Longitude da entrega"
            value={dropoffLng}
            onChange={setDropoffLng}
            placeholder="-43.000000"
          />

          <Input
            label="Remetente"
            value={senderName}
            onChange={setSenderName}
            placeholder="Nome do remetente"
          />

          <Input
            label="Telefone do remetente"
            value={senderPhone}
            onChange={setSenderPhone}
            placeholder="31999999999"
          />

          <Input
            label="Destinatário"
            value={recipientName}
            onChange={setRecipientName}
            placeholder="Nome do destinatário"
          />

          <Input
            label="Telefone do destinatário"
            value={recipientPhone}
            onChange={setRecipientPhone}
            placeholder="31999999999"
          />

          <div className="md:col-span-2">
            <Input
              label="Observação do destinatário"
              value={recipientRemarks}
              onChange={setRecipientRemarks}
              placeholder="Referência, portaria, quem recebe..."
            />
          </div>
        </div>

        {renderLalamoveAutofillActions()}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SecondaryActionButton
            fullWidth
            onClick={handleLalamoveQuote}
            disabled={lalamoveQuoting}
          >
            {lalamoveQuoting ? "Cotando..." : "Gerar cotação"}
          </SecondaryActionButton>

          <PrimaryActionButton
            fullWidth
            onClick={handleLalamoveCreate}
            disabled={lalamoveCreating || !hasLalamoveQuote || hasLalamoveOrder}
          >
            {lalamoveCreating
              ? "Chamando..."
              : hasLalamoveOrder
              ? "Corrida já criada"
              : "Chamar Lalamove"}
          </PrimaryActionButton>
        </div>
      </div>
    );
  }

  function renderLalamoveShipmentCard() {
    return (
      <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-slate-900">Corrida Lalamove</div>
            <div className="mt-1 text-sm text-slate-600">
              Acompanhe cotação, pedido criado e dados retornados pela plataforma.
            </div>
          </div>

          <Badge tone={lalamoveTone(shipment?.provider_status)}>
            {humanizeProviderStatus(shipment?.provider_status)}
          </Badge>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Cotação
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900 break-all">
              {shipment?.provider_quote_id || "—"}
            </div>
          </div>

          <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Pedido externo
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900 break-all">
              {shipment?.provider_order_id || "—"}
            </div>
          </div>

          {/* FIX: driver card now shows name, phone AND plate when available */}
          <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Motorista
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900 break-all">
              {lalamoveDriverName || shipment?.provider_driver_id || "—"}
            </div>
            {lalamoveDriverPhone ? (
              <div className="mt-1 text-xs text-slate-500">{lalamoveDriverPhone}</div>
            ) : null}
            {lalamoveDriverPlate ? (
              <div className="mt-1 text-xs text-slate-500">Placa: {lalamoveDriverPlate}</div>
            ) : null}
          </div>

          <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Valor
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900">
              {formatMoney(shipment?.price_amount, shipment?.price_currency)}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Share link
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900 break-all">
              {shipment?.share_link || "—"}
            </div>
          </div>

          <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Último evento / Atualização
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900">
              {humanizeProviderStatus(shipment?.provider_event_type)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {formatDateTime(shipment?.updated_at)}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SecondaryActionButton
            fullWidth
            onClick={() => handleLalamoveSync(true)}
            disabled={lalamoveSyncing || !shipment?.provider_order_id}
          >
            {lalamoveSyncing ? "Atualizando..." : "Atualizar corrida"}
          </SecondaryActionButton>

          <SecondaryActionButton
            fullWidth
            disabled={!shipment?.share_link}
            onClick={() =>
              shipment?.share_link &&
              handleCopyText(shipment.share_link, "Share link copiado.")
            }
          >
            Copiar share link
          </SecondaryActionButton>

          <a
            href={shipment?.share_link || "#"}
            target="_blank"
            rel="noreferrer"
            className="block"
          >
            <SecondaryActionButton fullWidth disabled={!shipment?.share_link}>
              Abrir share link
            </SecondaryActionButton>
          </a>

          <SecondaryActionButton
            fullWidth
            disabled={settingStatus === "SAIU_PARA_ENTREGA"}
            onClick={() => handleSetStatus("SAIU_PARA_ENTREGA")}
          >
            {settingStatus === "SAIU_PARA_ENTREGA"
              ? "Alterando..."
              : "Marcar saiu para entrega"}
          </SecondaryActionButton>

          <SecondaryActionButton
            fullWidth
            disabled={lalamoveCancelling || !shipment?.provider_order_id}
            onClick={handleLalamoveCancel}
          >
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
            <div className="mt-1 text-sm text-slate-600">
              Última posição conhecida do motorista pela Lalamove.
            </div>
          </div>

          {lalamoveMapOpenUrl ? (
            <a href={lalamoveMapOpenUrl} target="_blank" rel="noreferrer">
              <SecondaryActionButton>Abrir Maps</SecondaryActionButton>
            </a>
          ) : null}
        </div>

        {lalamoveHasMap && lalamoveLastLat != null && lalamoveLastLng != null ? (
          <>
            <div className="mt-4 overflow-hidden rounded-[20px] border border-slate-200">
              <div className={`${heightClass} w-full`}>
                <MapContainer
                  key={mapKey}
                  center={[lalamoveLastLat, lalamoveLastLng]}
                  zoom={16}
                  scrollWheelZoom
                  style={{ height: "100%", width: "100%" }}
                >
                  <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />

                  <Circle
                    center={[lalamoveLastLat, lalamoveLastLng]}
                    radius={Math.max(Number(lalamoveLastAccuracy ?? 15), 8)}
                    pathOptions={{
                      color: "#7c3aed",
                      fillColor: "#a78bfa",
                      fillOpacity: 0.18,
                    }}
                  />

                  <Marker position={[lalamoveLastLat, lalamoveLastLng]} icon={lalamoveIcon}>
                    <Popup>
                      <div className="text-sm">
                        <div className="font-semibold">Corrida Lalamove</div>
                        {lalamoveDriverName ? (
                          <div className="mt-1">Motorista: {lalamoveDriverName}</div>
                        ) : null}
                        {lalamoveDriverPhone ? (
                          <div>Telefone: {lalamoveDriverPhone}</div>
                        ) : null}
                        {lalamoveDriverPlate ? (
                          <div>Placa: {lalamoveDriverPlate}</div>
                        ) : null}
                        <div className="mt-1">
                          Último check-in: {formatDateTime(lalamoveLastSeenAt)}
                        </div>
                        <div>Precisão: {lalamoveLastAccuracy ?? "—"}</div>
                      </div>
                    </Popup>
                  </Marker>
                </MapContainer>
              </div>
            </div>

            {/* FIX: map bottom info now shows driver name, phone AND plate */}
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Coordenadas
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {lalamoveFormattedCoords}
                </div>
              </div>

              <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Última atualização
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {formatDateTime(lalamoveLastSeenAt)}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {formatRelativeFromNow(lalamoveLastSeenAt)}
                </div>
              </div>

              <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Motorista
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {lalamoveDriverName || "—"}
                </div>
                {lalamoveDriverPhone ? (
                  <div className="mt-1 text-xs text-slate-500">{lalamoveDriverPhone}</div>
                ) : null}
              </div>

              <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Placa
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {lalamoveDriverPlate || "—"}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <SecondaryActionButton
                disabled={!lalamoveHasMap}
                onClick={() => {
                  setFollowVehicle(true);
                  setMapKey((k) => k + 1);
                }}
              >
                Centralizar no mapa
              </SecondaryActionButton>

              {lalamoveMapOpenUrl ? (
                <a href={lalamoveMapOpenUrl} target="_blank" rel="noreferrer">
                  <SecondaryActionButton>Abrir no Google Maps</SecondaryActionButton>
                </a>
              ) : null}
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-[20px] border border-dashed border-slate-300 p-6 text-sm text-slate-500">
            Ainda não há coordenadas da corrida Lalamove registradas no portal.
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={isDispatchMode ? "Saída para entrega" : "Logística da entrega"}
          subtitle="Carregando dados da operação."
          right={
            <Link href="/adm/logistica">
              <SecondaryActionButton>Voltar</SecondaryActionButton>
            </Link>
          }
        />

        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="text-sm text-slate-600">Carregando...</div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={isDispatchMode ? "Saída para entrega" : "Logística da entrega"}
          subtitle="Pedido não encontrado."
          right={
            <Link href="/adm/logistica">
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
    );
  }

  if (isDispatchMode) {
    return (
      <div className="space-y-4 md:space-y-6">
        <PageHeader
          title={`Saída para entrega ${id.slice(0, 8)}`}
          subtitle={`Fluxo rápido para expedição • ${getProviderLabel(selectedProvider)}`}
          right={
            <div className="flex flex-wrap gap-2">
              <SecondaryActionButton onClick={() => loadAllData(true)} disabled={refreshing}>
                {refreshing ? "Atualizando..." : "Atualizar"}
              </SecondaryActionButton>

              <Link href="/adm/expedicao">
                <SecondaryActionButton>Voltar</SecondaryActionButton>
              </Link>
            </div>
          }
        />

        {message ? (
          <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
            <div
              className={`rounded-[18px] border p-3 text-sm ${
                messageTone === "green"
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {message}
            </div>
          </div>
        ) : null}

        {renderProviderSelectorCard()}

        {!isLalamove ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Pedido"
                value={id.slice(0, 8)}
                subtitle={String(order.status ?? "—")}
              />
              <MetricCard title="Loja" value={storeLabel} />
              <MetricCard
                title="Status"
                value={getDeliveryStatusLabel(overview?.delivery_status ?? "PENDENTE")}
                subtitle={`Rastreio: ${getTrackingStatusLabel(overview?.tracking_status ?? null)}`}
              />
              <MetricCard
                title="Último check-in"
                value={formatRelativeFromNow(internalLastSeenAt)}
                subtitle={formatDateTime(internalLastSeenAt)}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-4">
                <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                  <div className="text-base font-semibold text-slate-900">
                    Dados do motorista
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    Preencha e já inicie a saída de forma rápida.
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4">
                    <Input
                      label="Nome do motorista"
                      value={driverName}
                      onChange={(v) => {
                        setDriverName(v);
                        setDriverNameDirty(true);
                      }}
                      placeholder="Ex.: Carlos Henrique"
                    />

                    <Input
                      label="Telefone do motorista"
                      value={driverPhone}
                      onChange={(v) => {
                        setDriverPhone(v);
                        setDriverPhoneDirty(true);
                      }}
                      placeholder="Ex.: 31999999999"
                    />

                    <Input
                      label="Observações"
                      value={deliveryNotes}
                      onChange={(v) => {
                        setDeliveryNotes(v);
                        setDeliveryNotesDirty(true);
                      }}
                      placeholder="Portaria, condomínio, referência..."
                    />
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <SecondaryActionButton
                      fullWidth
                      onClick={handleSaveDriver}
                      disabled={savingDriver}
                    >
                      {savingDriver ? "Salvando..." : "Salvar motorista"}
                    </SecondaryActionButton>

                    <SecondaryActionButton
                      fullWidth
                      onClick={handleMarkSeparation}
                      disabled={markingSeparation}
                    >
                      {markingSeparation ? "Processando..." : "Em separação"}
                    </SecondaryActionButton>
                  </div>

                  <div className="mt-3">
                    <PrimaryActionButton
                      fullWidth
                      onClick={handleStartDelivery}
                      disabled={startingDelivery || !canStartDelivery}
                    >
                      {startingDelivery ? "Gerando..." : "Sair para entrega"}
                    </PrimaryActionButton>
                  </div>

                  {!canStartDelivery ? (
                    <div className="mt-3 rounded-[18px] border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                      Este pedido já saiu para entrega ou já foi concluído.
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                  <div className="text-base font-semibold text-slate-900">Link do rastreio</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Gere e envie rapidamente para o motorista.
                  </div>

                  <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-900 break-all">
                    {trackingLink || "O link aparecerá após sair para entrega."}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3">
                    <SecondaryActionButton
                      fullWidth
                      disabled={!trackingLink}
                      onClick={() =>
                        trackingLink &&
                        handleCopyText(trackingLink, "Link do motorista copiado.")
                      }
                    >
                      Copiar link
                    </SecondaryActionButton>

                    <a
                      href={driverWhatsAppUrl || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      <PrimaryActionButton fullWidth disabled={!trackingLink}>
                        Enviar por WhatsApp
                      </PrimaryActionButton>
                    </a>

                    <a
                      href={trackingLink || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      <SecondaryActionButton fullWidth disabled={!trackingLink}>
                        Abrir link
                      </SecondaryActionButton>
                    </a>
                  </div>
                </div>

                <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                  <div className="text-base font-semibold text-slate-900">
                    Código de confirmação
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    Mostre ou envie ao cliente.
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Código
                      </div>
                      <div className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-900">
                        {lastGeneratedCode || "—"}
                      </div>
                    </div>

                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Status
                      </div>
                      <div className="mt-2">
                        <Badge tone={confirmationTone(overview?.confirmation_status ?? null)}>
                          {getConfirmationStatusLabel(overview?.confirmation_status ?? null)}
                        </Badge>
                      </div>
                    </div>

                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Expiração
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        {formatDateTime(overview?.code_expires_at)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <SecondaryActionButton
                      fullWidth
                      onClick={handleRegenerateCode}
                      disabled={regeneratingCode}
                    >
                      {regeneratingCode ? "Gerando..." : "Regenerar código"}
                    </SecondaryActionButton>

                    <a
                      href={customerWhatsAppUrl || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      <SecondaryActionButton fullWidth disabled={!lastGeneratedCode}>
                        Enviar código ao cliente
                      </SecondaryActionButton>
                    </a>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfd_100%)] p-4 shadow-sm md:p-5">
                  <div className="text-base font-semibold text-slate-900">Resumo rápido</div>

                  <div className="mt-4 space-y-3 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <span>Status entrega</span>
                      <Badge tone={deliveryTone(overview?.delivery_status ?? "PENDENTE")}>
                        {getDeliveryStatusLabel(overview?.delivery_status ?? "PENDENTE")}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span>Rastreio</span>
                      <Badge tone={trackingTone(overview?.tracking_status ?? null)}>
                        {getTrackingStatusLabel(overview?.tracking_status ?? null)}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span>Check-in</span>
                      <span className="font-semibold text-slate-900">
                        {formatRelativeFromNow(internalLastSeenAt)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span>Motorista</span>
                      <span className="font-semibold text-slate-900 text-right">
                        {overview?.delivery_driver_name || "Não informado"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span>Telefone</span>
                      <span className="font-semibold text-slate-900 text-right">
                        {overview?.delivery_driver_phone || "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {internalHasMap && internalLastLat != null && internalLastLng != null ? (
                  <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-slate-900">Mapa</div>
                        <div className="mt-1 text-sm text-slate-600">
                          Última posição recebida
                        </div>
                      </div>

                      {internalMapOpenUrl ? (
                        <a href={internalMapOpenUrl} target="_blank" rel="noreferrer">
                          <SecondaryActionButton>Abrir Maps</SecondaryActionButton>
                        </a>
                      ) : null}
                    </div>

                    <div className="mt-4 overflow-hidden rounded-[20px] border border-slate-200">
                      <div className="h-[300px] w-full">
                        <MapContainer
                          key={mapKey}
                          center={[internalLastLat, internalLastLng]}
                          zoom={16}
                          scrollWheelZoom
                          style={{ height: "100%", width: "100%" }}
                        >
                          <TileLayer
                            attribution='&copy; OpenStreetMap contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          />

                          <Circle
                            center={[internalLastLat, internalLastLng]}
                            radius={Math.max(Number(internalLastAccuracy ?? 15), 8)}
                            pathOptions={{
                              color: "#0891b2",
                              fillColor: "#22d3ee",
                              fillOpacity: 0.18,
                            }}
                          />

                          <Marker position={[internalLastLat, internalLastLng]} icon={deliveryIcon}>
                            <Popup>
                              <div className="text-sm">
                                <div className="font-semibold">Entrega em andamento</div>
                                <div className="mt-1">
                                  Último check-in: {formatDateTime(internalLastSeenAt)}
                                </div>
                                <div>Precisão: {internalLastAccuracy ?? "—"}</div>
                              </div>
                            </Popup>
                          </Marker>
                        </MapContainer>
                      </div>
                    </div>

                    <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Coordenadas</span>
                        <span className="font-semibold text-slate-900">
                          {internalFormattedCoords}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                    <div className="text-base font-semibold text-slate-900">Mapa</div>
                    <div className="mt-4 rounded-[20px] border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                      Ainda não há coordenadas registradas para esta entrega.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Pedido"
                value={id.slice(0, 8)}
                subtitle={String(order.status ?? "—")}
              />
              <MetricCard title="Loja" value={storeLabel} />
              <MetricCard
                title="Status interno"
                value={getDeliveryStatusLabel(overview?.delivery_status ?? "PENDENTE")}
                subtitle={`Atualizado em ${formatDateTime(overview?.delivery_started_at)}`}
              />
              <MetricCard
                title="Status Lalamove"
                value={humanizeProviderStatus(shipment?.provider_status)}
                subtitle={formatDateTime(shipment?.updated_at)}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-4">
                {renderLalamoveRequestCard()}
                {renderLalamoveShipmentCard()}
              </div>

              <div className="space-y-4">
                <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#faf7ff_100%)] p-4 shadow-sm md:p-5">
                  <div className="text-base font-semibold text-slate-900">Resumo rápido</div>

                  <div className="mt-4 space-y-3 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <span>Provedor</span>
                      <Badge tone="blue">Lalamove</Badge>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span>Status interno</span>
                      <Badge tone={deliveryTone(overview?.delivery_status ?? "PENDENTE")}>
                        {getDeliveryStatusLabel(overview?.delivery_status ?? "PENDENTE")}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span>Status externo</span>
                      <Badge tone={lalamoveTone(shipment?.provider_status)}>
                        {humanizeProviderStatus(shipment?.provider_status)}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span>Motorista</span>
                      <span className="font-semibold text-slate-900 text-right">
                        {lalamoveDriverName || "Não atribuído"}
                      </span>
                    </div>

                    {lalamoveDriverPhone ? (
                      <div className="flex items-center justify-between gap-3">
                        <span>Telefone</span>
                        <span className="font-semibold text-slate-900 text-right">
                          {lalamoveDriverPhone}
                        </span>
                      </div>
                    ) : null}

                    {lalamoveDriverPlate ? (
                      <div className="flex items-center justify-between gap-3">
                        <span>Placa</span>
                        <span className="font-semibold text-slate-900 text-right">
                          {lalamoveDriverPlate}
                        </span>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between gap-3">
                      <span>Último check-in</span>
                      <span className="font-semibold text-slate-900 text-right">
                        {formatRelativeFromNow(lalamoveLastSeenAt)}
                      </span>
                    </div>
                  </div>
                </div>

                {renderLalamoveMapCard("h-[300px]")}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isLalamove) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={`Logística do pedido ${id.slice(0, 8)}`}
          subtitle="Controle operacional da entrega com Lalamove."
          right={
            <div className="flex flex-wrap gap-2">
              <SecondaryActionButton onClick={() => loadAllData(true)} disabled={refreshing}>
                {refreshing ? "Atualizando..." : "Atualizar"}
              </SecondaryActionButton>

              <Link href="/adm/logistica">
                <SecondaryActionButton>Voltar</SecondaryActionButton>
              </Link>

              <Link href={`/adm/pedidos/${id}`}>
                <SecondaryActionButton>Abrir pedido</SecondaryActionButton>
              </Link>
            </div>
          }
        />

        {message ? (
          <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div
              className={`rounded-[22px] border p-4 text-sm ${
                messageTone === "green"
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {message}
            </div>
          </div>
        ) : null}

        {renderProviderSelectorCard()}

        <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f8f5ff_100%)] p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={deliveryTone(overview?.delivery_status ?? "PENDENTE")}>
                  {getDeliveryStatusLabel(overview?.delivery_status ?? "PENDENTE")}
                </Badge>

                <Badge tone={lalamoveTone(shipment?.provider_status)}>
                  {humanizeProviderStatus(shipment?.provider_status)}
                </Badge>

                <Badge tone="blue">Lalamove</Badge>
              </div>

              <div className="mt-4 text-sm leading-7 text-slate-700">
                <div>
                  <span className="font-semibold text-slate-900">Loja:</span> {storeLabel}
                </div>
                <div>
                  <span className="font-semibold text-slate-900">Status do pedido:</span>{" "}
                  {String(order.status ?? "—")}
                </div>
                <div>
                  <span className="font-semibold text-slate-900">Pedido externo:</span>{" "}
                  {shipment?.provider_order_id || "—"}
                </div>
                <div>
                  <span className="font-semibold text-slate-900">Última atualização:</span>{" "}
                  {formatDateTime(lalamoveLastSeenAt)}{" "}
                  {lalamoveLastSeenAt ? `(${formatRelativeFromNow(lalamoveLastSeenAt)})` : ""}
                </div>
              </div>
            </div>

            <div className="w-full max-w-sm rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Resumo da corrida
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-600">Cotação</span>
                  <span className="text-sm font-semibold text-slate-900 break-all text-right">
                    {shipment?.provider_quote_id || "—"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-600">Valor</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {formatMoney(shipment?.price_amount, shipment?.price_currency)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-600">Motorista</span>
                  <span className="text-sm font-semibold text-slate-900 text-right">
                    {lalamoveDriverName || shipment?.provider_driver_id || "—"}
                  </span>
                </div>

                {lalamoveDriverPhone ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-600">Telefone</span>
                    <span className="text-sm font-semibold text-slate-900 text-right">
                      {lalamoveDriverPhone}
                    </span>
                  </div>
                ) : null}

                {lalamoveDriverPlate ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-600">Placa</span>
                    <span className="text-sm font-semibold text-slate-900 text-right">
                      {lalamoveDriverPlate}
                    </span>
                  </div>
                ) : null}

                <div className="h-px bg-slate-200" />

                <div className="text-xs text-slate-500 break-all">
                  {shipment?.share_link || "O share link aparecerá após a criação da corrida."}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Pedido"
            value={id.slice(0, 8)}
            subtitle={String(order.status ?? "—")}
          />
          <MetricCard
            title="Status interno"
            value={getDeliveryStatusLabel(overview?.delivery_status ?? "PENDENTE")}
            subtitle={`Saída: ${formatDateTime(overview?.delivery_started_at)}`}
          />
          <MetricCard
            title="Status Lalamove"
            value={humanizeProviderStatus(shipment?.provider_status)}
            subtitle={`Evento: ${humanizeProviderStatus(shipment?.provider_event_type)}`}
          />
          <MetricCard
            title="Último check-in"
            value={formatRelativeFromNow(lalamoveLastSeenAt)}
            subtitle={formatDateTime(lalamoveLastSeenAt)}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            {renderLalamoveRequestCard()}
            {renderLalamoveShipmentCard()}
            {renderLalamoveMapCard("h-[460px]")}
          </div>

          <div>
            <div className="xl:sticky xl:top-24">
              <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#faf7ff_100%)] p-5 shadow-sm md:p-6">
                <div className="text-lg font-semibold tracking-[-0.02em] text-slate-900">
                  Ações
                </div>

                <div className="mt-1 text-sm text-slate-600">
                  Navegação rápida e ajustes operacionais.
                </div>

                <div className="mt-6 grid gap-3">
                  <SecondaryActionButton
                    onClick={() => loadAllData(true)}
                    disabled={refreshing}
                  >
                    {refreshing ? "Atualizando..." : "Atualizar entrega"}
                  </SecondaryActionButton>

                  <SecondaryActionButton
                    onClick={() => handleLalamoveAutofill(true)}
                    disabled={autofilling}
                  >
                    {autofilling ? "Preenchendo..." : "Preencher automático"}
                  </SecondaryActionButton>

                  <SecondaryActionButton
                    onClick={() => handleLalamoveSync(true)}
                    disabled={lalamoveSyncing || !shipment?.provider_order_id}
                  >
                    {lalamoveSyncing ? "Sincronizando..." : "Sincronizar Lalamove"}
                  </SecondaryActionButton>

                  <Link href="/adm/logistica">
                    <SecondaryActionButton>Voltar</SecondaryActionButton>
                  </Link>

                  <Link href={`/adm/pedidos/${id}`}>
                    <PrimaryActionButton>Abrir pedido</PrimaryActionButton>
                  </Link>
                </div>

                <div className="mt-6 rounded-[22px] border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Painel da entrega
                  </div>

                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <span>Motorista</span>
                      <span className="font-semibold text-slate-900">
                        {lalamoveDriverName || "Não informado"}
                      </span>
                    </div>

                    {lalamoveDriverPhone ? (
                      <div className="flex items-center justify-between gap-3">
                        <span>Telefone</span>
                        <span className="font-semibold text-slate-900">
                          {lalamoveDriverPhone}
                        </span>
                      </div>
                    ) : null}

                    {lalamoveDriverPlate ? (
                      <div className="flex items-center justify-between gap-3">
                        <span>Placa</span>
                        <span className="font-semibold text-slate-900">
                          {lalamoveDriverPlate}
                        </span>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between gap-3">
                      <span>Pedido externo</span>
                      <span className="font-semibold text-slate-900 break-all text-right">
                        {shipment?.provider_order_id || "—"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span>Check-in</span>
                      <span className="font-semibold text-slate-900">
                        {formatDateTime(lalamoveLastSeenAt)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span>Posição</span>
                      <span className="max-w-[160px] truncate font-semibold text-slate-900">
                        {lalamoveFormattedCoords || "Sem coordenadas"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Registrar ocorrência
                  </div>

                  <div className="mt-3">
                    <Input
                      value={occurrenceNotes}
                      onChange={setOccurrenceNotes}
                      placeholder="Descreva a ocorrência"
                    />
                  </div>

                  <div className="mt-4">
                    <SecondaryActionButton
                      onClick={handleOccurrence}
                      disabled={registeringOccurrence}
                    >
                      {registeringOccurrence ? "Registrando..." : "Registrar ocorrência"}
                    </SecondaryActionButton>
                  </div>
                </div>

                <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Ajuste manual
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3">
                    <SecondaryActionButton
                      disabled={settingStatus === "PENDENTE"}
                      onClick={() => handleSetStatus("PENDENTE")}
                    >
                      {settingStatus === "PENDENTE"
                        ? "Alterando..."
                        : "Voltar para pendente"}
                    </SecondaryActionButton>

                    <SecondaryActionButton
                      disabled={settingStatus === "EM_SEPARACAO"}
                      onClick={() => handleSetStatus("EM_SEPARACAO")}
                    >
                      {settingStatus === "EM_SEPARACAO"
                        ? "Alterando..."
                        : "Marcar em separação"}
                    </SecondaryActionButton>

                    <SecondaryActionButton
                      disabled={settingStatus === "SAIU_PARA_ENTREGA"}
                      onClick={() => handleSetStatus("SAIU_PARA_ENTREGA")}
                    >
                      {settingStatus === "SAIU_PARA_ENTREGA"
                        ? "Alterando..."
                        : "Marcar saiu para entrega"}
                    </SecondaryActionButton>

                    <SecondaryActionButton
                      disabled={settingStatus === "ENTREGUE"}
                      onClick={() => handleSetStatus("ENTREGUE")}
                    >
                      {settingStatus === "ENTREGUE"
                        ? "Alterando..."
                        : "Marcar como entregue"}
                    </SecondaryActionButton>
                  </div>
                </div>

                <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Observações
                  </div>

                  <div className="mt-3 text-sm text-slate-600 whitespace-pre-wrap">
                    {overview?.delivery_notes || recipientRemarks || "—"}
                  </div>
                </div>

                <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Coordenadas detalhadas
                  </div>

                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <span>Latitude</span>
                      <span className="font-semibold text-slate-900">
                        {formatCoord(lalamoveLastLat)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span>Longitude</span>
                      <span className="font-semibold text-slate-900">
                        {formatCoord(lalamoveLastLng)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span>Precisão</span>
                      <span className="font-semibold text-slate-900">
                        {lalamoveLastAccuracy ?? "—"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Share link
                  </div>

                  <div className="mt-3 text-sm font-semibold text-slate-900 break-all">
                    {shipment?.share_link || "—"}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3">
                    <SecondaryActionButton
                      disabled={!shipment?.share_link}
                      onClick={() =>
                        shipment?.share_link &&
                        handleCopyText(shipment.share_link, "Share link copiado.")
                      }
                    >
                      Copiar share link
                    </SecondaryActionButton>

                    <a
                      href={shipment?.share_link || "#"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <SecondaryActionButton disabled={!shipment?.share_link}>
                        Abrir share link
                      </SecondaryActionButton>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Logística do pedido ${id.slice(0, 8)}`}
        subtitle="Controle operacional da entrega, rastreio e confirmação."
        right={
          <div className="flex flex-wrap gap-2">
            <SecondaryActionButton onClick={() => loadAllData(true)} disabled={refreshing}>
              {refreshing ? "Atualizando..." : "Atualizar"}
            </SecondaryActionButton>

            <Link href="/adm/logistica">
              <SecondaryActionButton>Voltar</SecondaryActionButton>
            </Link>

            <Link href={`/adm/pedidos/${id}`}>
              <SecondaryActionButton>Abrir pedido</SecondaryActionButton>
            </Link>
          </div>
        }
      />

      {message ? (
        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div
            className={`rounded-[22px] border p-4 text-sm ${
              messageTone === "green"
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message}
          </div>
        </div>
      ) : null}

      {renderProviderSelectorCard()}

      <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={deliveryTone(overview?.delivery_status ?? "PENDENTE")}>
                {getDeliveryStatusLabel(overview?.delivery_status ?? "PENDENTE")}
              </Badge>

              <Badge tone={trackingTone(overview?.tracking_status ?? null)}>
                {getTrackingStatusLabel(overview?.tracking_status ?? null)}
              </Badge>

              <Badge tone={confirmationTone(overview?.confirmation_status ?? null)}>
                {getConfirmationStatusLabel(overview?.confirmation_status ?? null)}
              </Badge>
            </div>

            <div className="mt-4 text-sm leading-7 text-slate-700">
              <div>
                <span className="font-semibold text-slate-900">Loja:</span> {storeLabel}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Status do pedido:</span>{" "}
                {String(order.status ?? "—")}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Criado em:</span>{" "}
                {formatDateTime((order.created_at as string) ?? null)}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Último check-in:</span>{" "}
                {formatDateTime(internalLastSeenAt)}{" "}
                {internalLastSeenAt ? `(${formatRelativeFromNow(internalLastSeenAt)})` : ""}
              </div>
            </div>
          </div>

          <div className="w-full max-w-sm rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Confirmação da entrega
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-600">Código atual</span>
                <span className="text-2xl font-semibold tracking-[-0.04em] text-slate-900">
                  {lastGeneratedCode || "—"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-600">Tentativas</span>
                <span className="text-sm font-semibold text-slate-900">
                  {overview?.attempts ?? 0}
                  {overview?.max_attempts ? ` / ${overview.max_attempts}` : ""}
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
                O código completo aparece quando gerado ou regenerado nesta sessão.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Pedido"
          value={id.slice(0, 8)}
          subtitle={String(order.status ?? "—")}
        />
        <MetricCard
          title="Status logístico"
          value={getDeliveryStatusLabel(overview?.delivery_status ?? "PENDENTE")}
          subtitle={`Saída: ${formatDateTime(overview?.delivery_started_at)}`}
        />
        <MetricCard
          title="Rastreio"
          value={getTrackingStatusLabel(overview?.tracking_status ?? null)}
          subtitle={`Check-in: ${formatDateTime(internalLastSeenAt)}`}
        />
        <MetricCard
          title="Confirmação"
          value={getConfirmationStatusLabel(overview?.confirmation_status ?? null)}
          subtitle={`Confirmado em: ${formatDateTime(overview?.confirmed_at)}`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="text-sm font-semibold text-slate-900">Dados do motorista</div>
            <div className="mt-1 text-sm text-slate-600">
              Preencha o responsável pela entrega e observações logísticas.
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Nome do motorista"
                value={driverName}
                onChange={(v) => {
                  setDriverName(v);
                  setDriverNameDirty(true);
                }}
                placeholder="Ex.: Carlos Henrique"
              />

              <Input
                label="Telefone do motorista"
                value={driverPhone}
                onChange={(v) => {
                  setDriverPhone(v);
                  setDriverPhoneDirty(true);
                }}
                placeholder="Ex.: 31999999999"
              />

              <div className="md:col-span-2">
                <Input
                  label="Observações logísticas"
                  value={deliveryNotes}
                  onChange={(v) => {
                    setDeliveryNotes(v);
                    setDeliveryNotesDirty(true);
                  }}
                  placeholder="Ex.: portaria, condomínio, entrega urgente"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <PrimaryActionButton onClick={handleSaveDriver} disabled={savingDriver}>
                {savingDriver ? "Salvando..." : "Salvar motorista"}
              </PrimaryActionButton>

              <SecondaryActionButton
                onClick={handleMarkSeparation}
                disabled={markingSeparation}
              >
                {markingSeparation ? "Processando..." : "Marcar em separação"}
              </SecondaryActionButton>
            </div>
          </div>

          <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="text-sm font-semibold text-slate-900">Saída para entrega</div>
            <div className="mt-1 text-sm text-slate-600">
              Ao iniciar a entrega, o sistema gera link de rastreio e código de confirmação.
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </div>
                <div className="mt-3">
                  <Badge tone={deliveryTone(overview?.delivery_status ?? "PENDENTE")}>
                    {getDeliveryStatusLabel(overview?.delivery_status ?? "PENDENTE")}
                  </Badge>
                </div>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Rastreio
                </div>
                <div className="mt-3">
                  <Badge tone={trackingTone(overview?.tracking_status ?? null)}>
                    {getTrackingStatusLabel(overview?.tracking_status ?? null)}
                  </Badge>
                </div>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Código
                </div>
                <div className="mt-3">
                  <Badge tone={confirmationTone(overview?.confirmation_status ?? null)}>
                    {getConfirmationStatusLabel(overview?.confirmation_status ?? null)}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <PrimaryActionButton
                onClick={handleStartDelivery}
                disabled={startingDelivery || !canStartDelivery}
              >
                {startingDelivery ? "Gerando..." : "Sair para entrega"}
              </PrimaryActionButton>

              <SecondaryActionButton
                onClick={handleRegenerateCode}
                disabled={regeneratingCode}
              >
                {regeneratingCode ? "Gerando..." : "Regenerar código"}
              </SecondaryActionButton>
            </div>

            {!canStartDelivery ? (
              <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Este pedido já saiu para entrega ou já foi concluído.
              </div>
            ) : null}
          </div>

          <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="text-sm font-semibold text-slate-900">Mapa e rastreio da entrega</div>
            <div className="mt-1 text-sm text-slate-600">
              Acompanhe a posição atual do motorista e envie o link temporário.
            </div>

            {internalHasMap && internalLastLat != null && internalLastLng != null ? (
              <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200">
                <div className="h-[460px] w-full">
                  <MapContainer
                    key={mapKey}
                    center={[internalLastLat, internalLastLng]}
                    zoom={16}
                    scrollWheelZoom
                    style={{ height: "100%", width: "100%" }}
                  >
                    <TileLayer
                      attribution='&copy; OpenStreetMap contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    <Circle
                      center={[internalLastLat, internalLastLng]}
                      radius={Math.max(Number(internalLastAccuracy ?? 15), 8)}
                      pathOptions={{
                        color: "#0891b2",
                        fillColor: "#22d3ee",
                        fillOpacity: 0.18,
                      }}
                    />

                    <Marker position={[internalLastLat, internalLastLng]} icon={deliveryIcon}>
                      <Popup>
                        <div className="text-sm">
                          <div className="font-semibold">Entrega em andamento</div>
                          <div className="mt-1">
                            Último check-in: {formatDateTime(internalLastSeenAt)}
                          </div>
                          <div>Precisão: {internalLastAccuracy ?? "—"}</div>
                        </div>
                      </Popup>
                    </Marker>
                  </MapContainer>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 p-8 text-sm text-slate-500">
                Ainda não há coordenadas registradas para esta entrega.
              </div>
            )}

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Link do motorista
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-900 break-all">
                  {trackingLink || "—"}
                </div>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Última atualização
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-900">
                  {formatDateTime(internalLastSeenAt)}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {formatRelativeFromNow(internalLastSeenAt)}
                </div>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Coordenadas
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-900">
                  {internalFormattedCoords}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <SecondaryActionButton
                disabled={!trackingLink}
                onClick={() =>
                  trackingLink &&
                  handleCopyText(trackingLink, "Link do motorista copiado.")
                }
              >
                Copiar link
              </SecondaryActionButton>

              <a href={trackingLink || "#"} target="_blank" rel="noreferrer">
                <SecondaryActionButton disabled={!trackingLink}>
                  Abrir link
                </SecondaryActionButton>
              </a>

              <a href={driverWhatsAppUrl || "#"} target="_blank" rel="noreferrer">
                <SecondaryActionButton disabled={!trackingLink}>
                  Enviar por WhatsApp
                </SecondaryActionButton>
              </a>

              <SecondaryActionButton
                disabled={!internalHasMap}
                onClick={() => {
                  setFollowVehicle(true);
                  setMapKey((k) => k + 1);
                }}
              >
                Centralizar no mapa
              </SecondaryActionButton>

              {internalMapOpenUrl ? (
                <a href={internalMapOpenUrl} target="_blank" rel="noreferrer">
                  <SecondaryActionButton>Abrir no Google Maps</SecondaryActionButton>
                </a>
              ) : null}
            </div>
          </div>

          <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="text-sm font-semibold text-slate-900">Código de confirmação</div>
            <div className="mt-1 text-sm text-slate-600">
              O código completo aparece somente quando gerado ou regenerado nesta sessão.
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </div>
                <div className="mt-3">
                  <Badge tone={confirmationTone(overview?.confirmation_status ?? null)}>
                    {getConfirmationStatusLabel(overview?.confirmation_status ?? null)}
                  </Badge>
                </div>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Código visível agora
                </div>
                <div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-900">
                  {lastGeneratedCode || "—"}
                </div>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Expiração
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-900">
                  {formatDateTime(overview?.code_expires_at)}
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Tentativas
                </div>
                <div className="mt-3 text-xl font-semibold text-slate-900">
                  {overview?.attempts ?? 0}
                  {overview?.max_attempts ? ` / ${overview.max_attempts}` : ""}
                </div>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Confirmado em
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-900">
                  {formatDateTime(overview?.confirmed_at)}
                </div>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Confirmado por
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-900">
                  {overview?.confirmed_by ?? "—"}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <SecondaryActionButton
                disabled={!lastGeneratedCode}
                onClick={() =>
                  lastGeneratedCode &&
                  handleCopyText(lastGeneratedCode, "Código copiado.")
                }
              >
                Copiar código
              </SecondaryActionButton>

              <a href={customerWhatsAppUrl || "#"} target="_blank" rel="noreferrer">
                <SecondaryActionButton disabled={!lastGeneratedCode}>
                  Enviar código ao cliente
                </SecondaryActionButton>
              </a>
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
                Navegação rápida e comandos operacionais.
              </div>

              <div className="mt-6 grid gap-3">
                <SecondaryActionButton
                  onClick={() => loadAllData(true)}
                  disabled={refreshing}
                >
                  {refreshing ? "Atualizando..." : "Atualizar entrega"}
                </SecondaryActionButton>

                <Link href="/adm/logistica">
                  <SecondaryActionButton>Voltar</SecondaryActionButton>
                </Link>

                <Link href={`/adm/pedidos/${id}`}>
                  <PrimaryActionButton>Abrir pedido</PrimaryActionButton>
                </Link>
              </div>

              <div className="mt-6 rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Painel da entrega
                </div>

                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <div className="flex items-center justify-between gap-3">
                    <span>Motorista</span>
                    <span className="font-semibold text-slate-900">
                      {overview?.delivery_driver_name || "Não informado"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Saída</span>
                    <span className="font-semibold text-slate-900">
                      {formatDateTime(overview?.delivery_started_at)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Check-in</span>
                    <span className="font-semibold text-slate-900">
                      {formatDateTime(internalLastSeenAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Posição</span>
                    <span className="max-w-[160px] truncate font-semibold text-slate-900">
                      {internalFormattedCoordsOrText}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Registrar ocorrência
                </div>

                <div className="mt-3">
                  <Input
                    value={occurrenceNotes}
                    onChange={setOccurrenceNotes}
                    placeholder="Descreva a ocorrência"
                  />
                </div>

                <div className="mt-4">
                  <SecondaryActionButton
                    onClick={handleOccurrence}
                    disabled={registeringOccurrence}
                  >
                    {registeringOccurrence ? "Registrando..." : "Registrar ocorrência"}
                  </SecondaryActionButton>
                </div>
              </div>

              <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Ajuste manual
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3">
                  <SecondaryActionButton
                    disabled={settingStatus === "PENDENTE"}
                    onClick={() => handleSetStatus("PENDENTE")}
                  >
                    {settingStatus === "PENDENTE"
                      ? "Alterando..."
                      : "Voltar para pendente"}
                  </SecondaryActionButton>

                  <SecondaryActionButton
                    disabled={settingStatus === "EM_SEPARACAO"}
                    onClick={() => handleSetStatus("EM_SEPARACAO")}
                  >
                    {settingStatus === "EM_SEPARACAO"
                      ? "Alterando..."
                      : "Marcar em separação"}
                  </SecondaryActionButton>
                </div>
              </div>

              <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Observações
                </div>

                <div className="mt-3 text-sm text-slate-600 whitespace-pre-wrap">
                  {overview?.delivery_notes || "—"}
                </div>
              </div>

              <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Coordenadas detalhadas
                </div>

                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <div className="flex items-center justify-between gap-3">
                    <span>Latitude</span>
                    <span className="font-semibold text-slate-900">
                      {formatCoord(internalLastLat)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Longitude</span>
                    <span className="font-semibold text-slate-900">
                      {formatCoord(internalLastLng)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Precisão</span>
                    <span className="font-semibold text-slate-900">
                      {internalLastAccuracy ?? "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
