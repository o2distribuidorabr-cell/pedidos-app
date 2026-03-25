"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import {
  PageHeader,
  Card,
  Button,
  Input,
  Badge,
} from "@/app/components/ui";

type DeliveryStatus =
  | "PENDENTE"
  | "EM_SEPARACAO"
  | "SAIU_PARA_ENTREGA"
  | "ENTREGUE"
  | "OCORRENCIA";

type TrackingStatus = "PENDENTE" | "ATIVO" | "PAUSADO" | "ENCERRADO";

type ConfirmationStatus = "PENDENTE" | "CONFIRMADO" | "EXPIRADO" | "BLOQUEADO";

type PublicSessionPayload = {
  sessionId: string;
  orderId: string;
  driverName: string | null;
  driverPhone: string | null;
  trackingStatus: TrackingStatus;
  deliveryStatus: DeliveryStatus;
  startedAt: string | null;
  endedAt: string | null;
  lastSeenAt: string | null;
  confirmationStatus: ConfirmationStatus | null;
  codeExpiresAt: string | null;
  dropoffAddress: string | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
};

type Props = {
  params: Promise<{ token: string }>;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function deliveryTone(status: DeliveryStatus) {
  switch (status) {
    case "PENDENTE": return "neutral" as const;
    case "EM_SEPARACAO": return "yellow" as const;
    case "SAIU_PARA_ENTREGA": return "blue" as const;
    case "ENTREGUE": return "green" as const;
    case "OCORRENCIA": return "red" as const;
    default: return "neutral" as const;
  }
}

function trackingTone(status: TrackingStatus) {
  switch (status) {
    case "PENDENTE": return "blue" as const;
    case "ATIVO": return "green" as const;
    case "PAUSADO": return "yellow" as const;
    case "ENCERRADO": return "neutral" as const;
    default: return "neutral" as const;
  }
}

function confirmationTone(status: ConfirmationStatus | null) {
  switch (status) {
    case "PENDENTE": return "yellow" as const;
    case "CONFIRMADO": return "green" as const;
    case "EXPIRADO": return "red" as const;
    case "BLOQUEADO": return "red" as const;
    default: return "neutral" as const;
  }
}

function getDeliveryLabel(status: DeliveryStatus) {
  switch (status) {
    case "PENDENTE": return "Pendente";
    case "EM_SEPARACAO": return "Em separação";
    case "SAIU_PARA_ENTREGA": return "Saiu para entrega";
    case "ENTREGUE": return "Entregue";
    case "OCORRENCIA": return "Ocorrência";
    default: return status;
  }
}

function getTrackingLabel(status: TrackingStatus) {
  switch (status) {
    case "PENDENTE": return "Pendente";
    case "ATIVO": return "Ativo";
    case "PAUSADO": return "Pausado";
    case "ENCERRADO": return "Encerrado";
    default: return status;
  }
}

function getConfirmationLabel(status: ConfirmationStatus | null) {
  switch (status) {
    case "PENDENTE": return "Pendente";
    case "CONFIRMADO": return "Confirmado";
    case "EXPIRADO": return "Expirado";
    case "BLOQUEADO": return "Bloqueado";
    default: return "—";
  }
}

// Detecta se está rodando no Chrome Android
function isChrome(): boolean {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isChromeBrowser = /Chrome/i.test(ua) && !/EdgA|OPR|Samsung/i.test(ua);
  return !isAndroid || isChromeBrowser;
}

// Monta URL do Waze com destino
function buildWazeUrl(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

// Monta URL do Google Maps com destino
function buildGoogleMapsUrl(lat: number, lng: number, address: string): string {
  const dest = address
    ? encodeURIComponent(address)
    : `${lat},${lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
}

// Calcula distância em metros entre dois pontos usando fórmula de Haversine
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const DELIVERY_RADIUS_METERS = 200;
// Se a precisão do GPS for pior que isso, não bloqueia — pode ser erro do dispositivo
const GPS_ACCURACY_THRESHOLD = 50;

export default function EntregaRastreioTokenPage({ params }: Props) {
  const { token } = use(params);

  const [session, setSession] = useState<PublicSessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [code, setCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [startingTracking, setStartingTracking] = useState(false);
  const [pausingTracking, setPausingTracking] = useState(false);

  const [locationPermission, setLocationPermission] = useState<
    "unknown" | "granted" | "denied" | "unsupported"
  >("unknown");

  const [coords, setCoords] = useState<{
    lat: number;
    lng: number;
    accuracy: number | null;
  } | null>(null);

  const [watching, setWatching] = useState(false);
  const [swActive, setSwActive] = useState(false);
  const [isChromeBrowser, setIsChromeBrowser] = useState(true);

  // PWA install
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"green" | "red" | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const lastCoordsRef = useRef<{ lat: number; lng: number; accuracy: number | null } | null>(null);
  const swRef = useRef<ServiceWorker | null>(null);

  const showSuccess = (text: string) => { setMessage(text); setMessageTone("green"); };
  const showError = (text: string) => { setMessage(text); setMessageTone("red"); };
  const clearMessage = () => { setMessage(null); setMessageTone(null); };

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Detecta navegador
    setIsChromeBrowser(isChrome());

    // Captura prompt de instalação PWA
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    // Registra Service Worker para background tracking
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw-tracking.js")
        .then((registration) => {
          const sw = registration.active || registration.waiting || registration.installing;
          if (sw) swRef.current = sw;

          navigator.serviceWorker.addEventListener("message", (event) => {
            const { type, payload } = event.data || {};
            if (type === "LOCATION_UPDATE" && payload?.lat && payload?.lng) {
              const nextCoords = {
                lat: payload.lat,
                lng: payload.lng,
                accuracy: payload.accuracy ?? null,
              };
              lastCoordsRef.current = nextCoords;
              setCoords(nextCoords);
            }
          });

          setSwActive(true);
        })
        .catch(() => {
          // Service Worker não disponível — continua com watchPosition normal
        });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  async function handleInstallPWA() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
      setShowInstallBanner(false);
      setInstallPrompt(null);
    }
  }

  const loadSession = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const response = await fetch(`/api/logistica/public/session/${token}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Não foi possível carregar a entrega.");
      }

      setSession(data.session as PublicSessionPayload);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro ao carregar entrega.";
      showError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  const stopWatcher = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (heartbeatRef.current !== null && typeof window !== "undefined") {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    if (swRef.current) {
      swRef.current.postMessage({ type: "STOP_TRACKING" });
    }

    setWatching(false);
  }, []);

  const sendLocation = useCallback(async (lat: number, lng: number, accuracy?: number | null) => {
    const response = await fetch(`/api/logistica/public/session/${token}/location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng, accuracy: accuracy ?? null }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || "Erro ao enviar localização.");
    }

    setSession((current) =>
      current
        ? {
            ...current,
            trackingStatus: data.session.status,
            startedAt: data.session.started_at,
            lastSeenAt: data.session.last_seen_at,
          }
        : current
    );
  }, [token]);

  const requestBrowserLocation = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationPermission("unsupported");
      throw new Error("Geolocalização não suportada neste dispositivo.");
    }

    return new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    });
  }, []);

  const pushCoords = useCallback(async (nextCoords: { lat: number; lng: number; accuracy: number | null }) => {
    lastCoordsRef.current = nextCoords;
    setCoords(nextCoords);
    await sendLocation(nextCoords.lat, nextCoords.lng, nextCoords.accuracy);
  }, [sendLocation]);

  const startTracking = useCallback(async () => {
    try {
      setStartingTracking(true);
      clearMessage();

      const response = await fetch(`/api/logistica/public/session/${token}/start`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Erro ao iniciar rastreio.");
      }

      const initialPosition = await requestBrowserLocation();
      setLocationPermission("granted");

      const initialCoords = {
        lat: initialPosition.coords.latitude,
        lng: initialPosition.coords.longitude,
        accuracy: initialPosition.coords.accuracy ?? null,
      };

      await pushCoords(initialCoords);

      // Ativa o Service Worker para rastreio em background (Android Chrome)
      if (swActive && "serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const sw = registration.active;
        if (sw) {
          swRef.current = sw;
          sw.postMessage({ type: "START_TRACKING", payload: { token } });
        }
      }

      // watchPosition como complemento quando tela estiver aberta
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        const watchId = navigator.geolocation.watchPosition(
          async (position) => {
            const nextCoords = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy ?? null,
            };
            try {
              await pushCoords(nextCoords);
            } catch {
              // sem poluição visual
            }
          },
          () => { setLocationPermission("denied"); },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );

        watchIdRef.current = watchId;
        setWatching(true);
      }

      // Heartbeat a cada 5s de segurança
      if (typeof window !== "undefined") {
        heartbeatRef.current = window.setInterval(async () => {
          const last = lastCoordsRef.current;
          if (!last) return;
          try {
            await sendLocation(last.lat, last.lng, last.accuracy);
          } catch {
            // sem ruído
          }
        }, 5000);
      }

      await loadSession(true);
      showSuccess(
        swActive
          ? "Rastreio iniciado. Pode abrir o Waze ou Maps normalmente."
          : "Rastreio iniciado. Mantenha esta tela aberta durante a rota."
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro ao iniciar rastreio.";
      showError(msg);
    } finally {
      setStartingTracking(false);
    }
  }, [loadSession, pushCoords, requestBrowserLocation, sendLocation, swActive, token]);

  const pauseTracking = useCallback(async () => {
    try {
      setPausingTracking(true);
      clearMessage();

      const response = await fetch(`/api/logistica/public/session/${token}/pause`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Erro ao pausar rastreio.");
      }

      stopWatcher();
      await loadSession(true);
      showSuccess("Rastreio pausado.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro ao pausar rastreio.";
      showError(msg);
    } finally {
      setPausingTracking(false);
    }
  }, [loadSession, stopWatcher, token]);

  const finalizeDelivery = useCallback(async () => {
    try {
      if (!code.trim()) {
        showError("Digite o código de confirmação.");
        return;
      }

      // Validação de proximidade — só bloqueia se GPS tiver boa precisão e estiver fora do raio
      if (session?.dropoffLat != null && session?.dropoffLng != null) {
        if (!coords) {
          // Sem GPS — permite confirmar com aviso no log, não bloqueia
          console.warn("GPS indisponível na confirmação.");
        } else {
          const precisao = coords.accuracy ?? 999;
          const gpsConfiavel = precisao <= GPS_ACCURACY_THRESHOLD;

          if (gpsConfiavel) {
            const distancia = haversineMeters(
              coords.lat,
              coords.lng,
              session.dropoffLat,
              session.dropoffLng
            );

            if (distancia > DELIVERY_RADIUS_METERS) {
              const distFormatada = distancia >= 1000
                ? `${(distancia / 1000).toFixed(1)} km`
                : `${Math.round(distancia)} metros`;
              showError(
                `Você está a ${distFormatada} do ponto de entrega. ` +
                `Aproxime-se a menos de ${DELIVERY_RADIUS_METERS} metros para confirmar.`
              );
              return;
            }
          }
          // GPS com precisão ruim (> 50m) — não bloqueia para não prejudicar
          // o motorista por falha do dispositivo
        }
      }

      setSendingCode(true);
      clearMessage();

      const response = await fetch(`/api/logistica/public/session/${token}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), confirmedBy: "motorista" }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Erro ao finalizar entrega.");
      }

      stopWatcher();
      setCode("");
      await loadSession(true);
      showSuccess("Entrega finalizada com sucesso.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro ao finalizar entrega.";
      showError(msg);
    } finally {
      setSendingCode(false);
    }
  }, [code, coords, session, loadSession, stopWatcher, token]);

  useEffect(() => {
    loadSession(false);
    return () => { stopWatcher(); };
  }, [loadSession, stopWatcher]);

  const canStart =
    session?.trackingStatus !== "ATIVO" &&
    session?.trackingStatus !== "ENCERRADO" &&
    session?.deliveryStatus !== "ENTREGUE";

  const canPause =
    session?.trackingStatus === "ATIVO" && session?.deliveryStatus !== "ENTREGUE";

  const canFinish = session?.deliveryStatus !== "ENTREGUE";

  const hasDropoff =
    session?.dropoffLat != null && session?.dropoffLng != null;

  const wazeUrl = hasDropoff
    ? buildWazeUrl(session!.dropoffLat!, session!.dropoffLng!)
    : null;

  const mapsUrl = hasDropoff
    ? buildGoogleMapsUrl(session!.dropoffLat!, session!.dropoffLng!, session?.dropoffAddress ?? "")
    : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8">
          <PageHeader title="Entrega em andamento" subtitle="Carregando dados da entrega." />
          <div className="mt-6">
            <Card>
              <div className="text-sm text-slate-500">Carregando...</div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8">
          <PageHeader
            title="Entrega não encontrada"
            subtitle="Este link pode estar inválido ou expirado."
          />
          <div className="mt-6">
            <Card>
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                Não foi possível localizar esta sessão de entrega.
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8">
        <PageHeader
          title={`Entrega ${session.orderId.slice(0, 8)}`}
          subtitle="Compartilhe sua localização durante a rota e confirme a entrega com o código do cliente."
          right={
            <Button variant="secondary" onClick={() => loadSession(true)} disabled={refreshing}>
              {refreshing ? "Atualizando..." : "Atualizar"}
            </Button>
          }
        />

        <div className="mt-6 space-y-6">

          {/* Alerta: não está no Chrome */}
          {!isChromeBrowser ? (
            <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-semibold text-amber-900">
                ⚠️ Use o Google Chrome para melhor rastreio
              </div>
              <div className="mt-1 text-sm text-amber-700">
                Você está usando outro navegador. Para o rastreio continuar funcionando
                enquanto usa o Waze ou Maps, abra este link no <b>Google Chrome</b>.
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => {
                    if (navigator.clipboard) {
                      navigator.clipboard.writeText(window.location.href);
                    }
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-[12px] bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-700"
                >
                  Copiar link para abrir no Chrome
                </button>
              </div>
            </div>
          ) : null}

          {/* Banner de instalação PWA */}
          {showInstallBanner && !isInstalled && isChromeBrowser ? (
            <div className="rounded-[20px] border border-cyan-200 bg-cyan-50 p-4">
              <div className="text-sm font-semibold text-cyan-900">
                📱 Instale o app de rastreio
              </div>
              <div className="mt-1 text-sm text-cyan-700">
                Instale para continuar enviando sua localização mesmo com o Waze ou Maps aberto.
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleInstallPWA}
                  className="inline-flex h-10 items-center justify-center rounded-[14px] bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-700"
                >
                  Instalar agora
                </button>
                <button
                  type="button"
                  onClick={() => setShowInstallBanner(false)}
                  className="inline-flex h-10 items-center justify-center rounded-[14px] border border-cyan-200 bg-white px-4 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-50"
                >
                  Agora não
                </button>
              </div>
            </div>
          ) : null}

          {/* Badge de background ativo */}
          {swActive && watching ? (
            <div className="rounded-[20px] border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              ✅ Rastreio em background ativo — pode abrir o Waze ou Maps normalmente.
            </div>
          ) : null}

          {message ? (
            <Card>
              <div className={`rounded-xl border p-4 text-sm ${
                messageTone === "green"
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}>
                {message}
              </div>
            </Card>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card title="Status da entrega">
              <Badge tone={deliveryTone(session.deliveryStatus)}>
                {getDeliveryLabel(session.deliveryStatus)}
              </Badge>
              <div className="mt-3 text-sm text-slate-500">
                Início: {formatDateTime(session.startedAt)}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                Encerramento: {formatDateTime(session.endedAt)}
              </div>
            </Card>

            <Card title="Rastreio">
              <Badge tone={trackingTone(session.trackingStatus)}>
                {getTrackingLabel(session.trackingStatus)}
              </Badge>
              <div className="mt-3 text-sm text-slate-500">
                Última atualização: {formatDateTime(session.lastSeenAt)}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                Permissão:{" "}
                {locationPermission === "unknown" ? "Não verificada"
                  : locationPermission === "granted" ? "Permitida"
                  : locationPermission === "denied" ? "Negada"
                  : "Não suportada"}
              </div>
            </Card>

            <Card title="Código">
              <Badge tone={confirmationTone(session.confirmationStatus)}>
                {getConfirmationLabel(session.confirmationStatus)}
              </Badge>
              <div className="mt-3 text-sm text-slate-500">
                Expira em: {formatDateTime(session.codeExpiresAt)}
              </div>
            </Card>
          </div>

          {/* Navegar até o destino */}
          {hasDropoff ? (
            <Card
              title="Navegar até o destino"
              subtitle={session.dropoffAddress ?? "Endereço de entrega"}
            >
              <div className="mt-2 flex flex-wrap gap-3">
                {wazeUrl ? (
                  <a
                    href={wazeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-[18px] bg-[#33CCFF] px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
                  >
                    🚗 Abrir no Waze
                  </a>
                ) : null}

                {mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-[18px] bg-[#4285F4] px-5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
                  >
                    🗺️ Abrir no Google Maps
                  </a>
                ) : null}
              </div>
            </Card>
          ) : null}

          <Card
            title="Sua localização"
            subtitle="Ao iniciar, sua localização será compartilhada somente durante esta entrega."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">Latitude</div>
                <div className="mt-2 text-sm font-medium text-slate-900">
                  {coords ? coords.lat.toFixed(6) : "—"}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">Longitude</div>
                <div className="mt-2 text-sm font-medium text-slate-900">
                  {coords ? coords.lng.toFixed(6) : "—"}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">Precisão</div>
                <div className="mt-2 text-sm font-medium text-slate-900">
                  {coords?.accuracy ?? "—"}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={startTracking} disabled={!canStart || startingTracking}>
                {startingTracking ? "Iniciando..." : "Iniciar rastreio"}
              </Button>

              <Button
                variant="secondary"
                onClick={pauseTracking}
                disabled={!canPause || pausingTracking}
              >
                {pausingTracking ? "Pausando..." : "Pausar rastreio"}
              </Button>
            </div>

            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
              {swActive
                ? "✅ Rastreio em background disponível. Após iniciar, pode abrir o Waze ou Maps normalmente."
                : "Mantenha esta página aberta durante a rota para enviar a localização continuamente."}
            </div>
          </Card>

          <Card
            title="Finalizar entrega"
            subtitle="Peça ao cliente o código de confirmação para concluir a entrega."
          >
            {/* Indicador de proximidade */}
            {session.dropoffLat != null && session.dropoffLng != null ? (
              coords ? (() => {
                const dist = haversineMeters(coords.lat, coords.lng, session.dropoffLat!, session.dropoffLng!);
                const precisao = coords.accuracy ?? 999;
                const gpsConfiavel = precisao <= GPS_ACCURACY_THRESHOLD;
                const dentro = dist <= DELIVERY_RADIUS_METERS;
                const distFormatada = dist >= 1000
                  ? `${(dist / 1000).toFixed(1)} km`
                  : `${Math.round(dist)} m`;

                if (!gpsConfiavel) {
                  return (
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                      ⚠️ GPS com precisão baixa ({Math.round(precisao)}m). A validação de proximidade está desativada — confirme normalmente.
                    </div>
                  );
                }

                return (
                  <div className={`mb-4 rounded-xl border p-3 text-sm font-semibold ${
                    dentro
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}>
                    {dentro
                      ? `✅ Você está a ${distFormatada} do ponto de entrega — dentro do raio permitido.`
                      : `📍 Você está a ${distFormatada} do ponto de entrega. Aproxime-se a menos de ${DELIVERY_RADIUS_METERS}m para confirmar.`
                    }
                    {" "}<span className="font-normal opacity-70">(GPS: ±{Math.round(precisao)}m)</span>
                  </div>
                );
              })()
              : (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  ⚠️ GPS não disponível. Confirme normalmente — a validação de proximidade foi ignorada.
                </div>
              )
            ) : null}

            <Input
              label="Código do cliente"
              value={code}
              onChange={setCode}
              placeholder="Digite o código informado pelo cliente"
            />

            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={finalizeDelivery} disabled={!canFinish || sendingCode}>
                {sendingCode ? "Confirmando..." : "Confirmar entrega"}
              </Button>
            </div>

            {session.deliveryStatus === "ENTREGUE" ? (
              <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                Esta entrega já foi concluída.
              </div>
            ) : null}
          </Card>

          <Card title="Informações da sessão" subtitle="Resumo simples da operação.">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">Pedido</div>
                <div className="mt-2 text-base font-semibold text-slate-900">
                  {session.orderId.slice(0, 8)}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-500">Motorista</div>
                <div className="mt-2 text-base font-semibold text-slate-900">
                  {session.driverName || "Não informado"}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {session.driverPhone || "—"}
                </div>
              </div>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}