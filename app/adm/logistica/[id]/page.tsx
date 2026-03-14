"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import L from "leaflet";
import { PageHeader, Input, Badge } from "@/app/components/ui";

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
  submitted_at?: string | null;
  approved_at?: string | null;
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

function createDeliveryIcon() {
  return L.divIcon({
    className: "custom-delivery-marker",
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

export default function AdmLogisticaDetalhePage({ params }: Props) {
  const { id } = use(params);

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [overview, setOverview] = useState<DeliveryOverviewRow | null>(null);
  const [storeLabel, setStoreLabel] = useState("Sem loja");

  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [occurrenceNotes, setOccurrenceNotes] = useState("");

  const [lastGeneratedCode, setLastGeneratedCode] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [savingDriver, setSavingDriver] = useState(false);
  const [markingSeparation, setMarkingSeparation] = useState(false);
  const [startingDelivery, setStartingDelivery] = useState(false);
  const [regeneratingCode, setRegeneratingCode] = useState(false);
  const [registeringOccurrence, setRegisteringOccurrence] = useState(false);
  const [settingStatus, setSettingStatus] = useState<null | string>(null);

  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"green" | "red" | null>(null);

  const [followVehicle, setFollowVehicle] = useState(true);
  const [mapKey, setMapKey] = useState(0);

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

  const loadData = useCallback(
    async (isRefresh = false) => {
      try {
        if (!isRefresh) clearMessage();

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

        const nextOverview = (data.overview as DeliveryOverviewRow | null) ?? null;
        const prevLat = overview?.last_lat ?? null;
        const prevLng = overview?.last_lng ?? null;

        setOrder((data.order as OrderRow) ?? null);
        setOverview(nextOverview);
        setStoreLabel(data.storeLabel || "Sem loja");

        setDriverName(data.overview?.delivery_driver_name ?? "");
        setDriverPhone(data.overview?.delivery_driver_phone ?? "");
        setDeliveryNotes(data.overview?.delivery_notes ?? "");

        if (
          followVehicle &&
          nextOverview?.last_lat != null &&
          nextOverview?.last_lng != null &&
          (nextOverview.last_lat !== prevLat || nextOverview.last_lng !== prevLng)
        ) {
          setMapKey((k) => k + 1);
        }
      } catch (error) {
        const text =
          error instanceof Error ? error.message : "Erro ao carregar logística.";
        showError(text);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id, overview?.last_lat, overview?.last_lng, followVehicle]
  );

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadData(true);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [loadData]);

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

  const lastLat = overview?.last_lat ?? null;
  const lastLng = overview?.last_lng ?? null;
  const lastAccuracy = overview?.last_accuracy ?? null;
  const lastSeenAt = overview?.last_seen_at ?? null;

  const hasMap = lastLat != null && lastLng != null;
  const formattedCoords = hasMap ? `${lastLat.toFixed(5)}, ${lastLng.toFixed(5)}` : "—";
  const formattedCoordsOrText = hasMap ? `${lastLat.toFixed(5)}, ${lastLng.toFixed(5)}` : "Sem coordenadas";

  const mapOpenUrl = useMemo(() => {
    if (lastLat == null || lastLng == null) return "";
    return buildGoogleMapsOpenUrl(lastLat, lastLng);
  }, [lastLat, lastLng]);

  const deliveryIcon = useMemo(() => createDeliveryIcon(), []);

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

      await loadData(true);
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

      await loadData(true);
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

      await loadData(true);
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

      await loadData(true);
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
      await loadData(true);
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

      await loadData(true);
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

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Logística da entrega"
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
          title="Logística da entrega"
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Logística do pedido ${id.slice(0, 8)}`}
        subtitle="Controle operacional da entrega, rastreio e confirmação."
        right={
          <div className="flex flex-wrap gap-2">
            <SecondaryActionButton onClick={() => loadData(true)} disabled={refreshing}>
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
                {formatDateTime(lastSeenAt)}{" "}
                {lastSeenAt ? `(${formatRelativeFromNow(lastSeenAt)})` : ""}
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
          subtitle={`Check-in: ${formatDateTime(lastSeenAt)}`}
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
                onChange={setDriverName}
                placeholder="Ex.: Carlos Henrique"
              />

              <Input
                label="Telefone do motorista"
                value={driverPhone}
                onChange={setDriverPhone}
                placeholder="Ex.: 31999999999"
              />

              <div className="md:col-span-2">
                <Input
                  label="Observações logísticas"
                  value={deliveryNotes}
                  onChange={setDeliveryNotes}
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

            {hasMap && lastLat != null && lastLng != null ? (
              <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200">
                <div className="h-[460px] w-full">
                  <MapContainer
                    key={mapKey}
                    center={[lastLat, lastLng]}
                    zoom={16}
                    scrollWheelZoom
                    style={{ height: "100%", width: "100%" }}
                  >
                    <TileLayer
                      attribution='&copy; OpenStreetMap contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    <Circle
                      center={[lastLat, lastLng]}
                      radius={Math.max(Number(lastAccuracy ?? 15), 8)}
                      pathOptions={{
                        color: "#0891b2",
                        fillColor: "#22d3ee",
                        fillOpacity: 0.18,
                      }}
                    />

                    <Marker position={[lastLat, lastLng]} icon={deliveryIcon}>
                      <Popup>
                        <div className="text-sm">
                          <div className="font-semibold">Entrega em andamento</div>
                          <div className="mt-1">
                            Último check-in: {formatDateTime(lastSeenAt)}
                          </div>
                          <div>Precisão: {lastAccuracy ?? "—"}</div>
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
                  {formatDateTime(lastSeenAt)}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {formatRelativeFromNow(lastSeenAt)}
                </div>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Coordenadas
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-900">
                  {formattedCoords}
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
                disabled={!hasMap}
                onClick={() => {
                  setFollowVehicle(true);
                  setMapKey((k) => k + 1);
                }}
              >
                Centralizar no mapa
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
                  onClick={() => loadData(true)}
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
                      {formatDateTime(lastSeenAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Posição</span>
                    <span className="max-w-[160px] truncate font-semibold text-slate-900">
                      {formattedCoordsOrText}
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
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}