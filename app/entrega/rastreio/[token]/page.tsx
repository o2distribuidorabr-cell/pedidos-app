"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function trackingTone(status: TrackingStatus) {
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

function getTrackingLabel(status: TrackingStatus) {
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
      return status;
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

  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"green" | "red" | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const lastCoordsRef = useRef<{
    lat: number;
    lng: number;
    accuracy: number | null;
  } | null>(null);

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

  const loadSession = useCallback(
    async (isRefresh = false) => {
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
        const message =
          error instanceof Error ? error.message : "Erro ao carregar entrega.";
        showError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  const stopWatcher = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (heartbeatRef.current !== null && typeof window !== "undefined") {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    setWatching(false);
  }, []);

  const sendLocation = useCallback(
    async (lat: number, lng: number, accuracy?: number | null) => {
      const response = await fetch(
        `/api/logistica/public/session/${token}/location`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat,
            lng,
            accuracy: accuracy ?? null,
          }),
        }
      );

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
    },
    [token]
  );

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

  const pushCoords = useCallback(
    async (nextCoords: { lat: number; lng: number; accuracy: number | null }) => {
      lastCoordsRef.current = nextCoords;
      setCoords(nextCoords);
      await sendLocation(nextCoords.lat, nextCoords.lng, nextCoords.accuracy);
    },
    [sendLocation]
  );

  const startTracking = useCallback(async () => {
    try {
      setStartingTracking(true);
      clearMessage();

      const response = await fetch(
        `/api/logistica/public/session/${token}/start`,
        { method: "POST" }
      );

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
              // evita poluição visual a cada falha pontual
            }
          },
          () => {
            setLocationPermission("denied");
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
          }
        );

        watchIdRef.current = watchId;
        setWatching(true);
      }

      if (typeof window !== "undefined") {
        heartbeatRef.current = window.setInterval(async () => {
          const last = lastCoordsRef.current;
          if (!last) return;

          try {
            await sendLocation(last.lat, last.lng, last.accuracy);
          } catch {
            // evita ruído excessivo
          }
        }, 5000);
      }

      await loadSession(true);
      showSuccess("Rastreio iniciado com sucesso.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao iniciar rastreio.";
      showError(message);
    } finally {
      setStartingTracking(false);
    }
  }, [loadSession, pushCoords, requestBrowserLocation, sendLocation, token]);

  const pauseTracking = useCallback(async () => {
    try {
      setPausingTracking(true);
      clearMessage();

      const response = await fetch(
        `/api/logistica/public/session/${token}/pause`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Erro ao pausar rastreio.");
      }

      stopWatcher();
      await loadSession(true);
      showSuccess("Rastreio pausado.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao pausar rastreio.";
      showError(message);
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

      setSendingCode(true);
      clearMessage();

      const response = await fetch(
        `/api/logistica/public/session/${token}/finish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: code.trim(),
            confirmedBy: "motorista",
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Erro ao finalizar entrega.");
      }

      stopWatcher();
      setCode("");
      await loadSession(true);
      showSuccess("Entrega finalizada com sucesso.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao finalizar entrega.";
      showError(message);
    } finally {
      setSendingCode(false);
    }
  }, [code, loadSession, stopWatcher, token]);

  useEffect(() => {
    loadSession(false);

    return () => {
      stopWatcher();
    };
  }, [loadSession, stopWatcher]);

  const canStart =
    session?.trackingStatus !== "ATIVO" &&
    session?.trackingStatus !== "ENCERRADO" &&
    session?.deliveryStatus !== "ENTREGUE";

  const canPause =
    session?.trackingStatus === "ATIVO" && session?.deliveryStatus !== "ENTREGUE";

  const canFinish = session?.deliveryStatus !== "ENTREGUE";

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8">
          <PageHeader
            title="Entrega em andamento"
            subtitle="Carregando dados da entrega."
          />
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
            <Button
              variant="secondary"
              onClick={() => loadSession(true)}
              disabled={refreshing}
            >
              {refreshing ? "Atualizando..." : "Atualizar"}
            </Button>
          }
        />

        <div className="mt-6 space-y-6">
          {message ? (
            <Card>
              <div
                className={`rounded-xl border p-4 text-sm ${
                  messageTone === "green"
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
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
                {locationPermission === "unknown"
                  ? "Não verificada"
                  : locationPermission === "granted"
                  ? "Permitida"
                  : locationPermission === "denied"
                  ? "Negada"
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
              Mantenha esta página aberta durante a rota para enviar a localização continuamente.
            </div>
          </Card>

          <Card
            title="Finalizar entrega"
            subtitle="Peça ao cliente o código de confirmação para concluir a entrega."
          >
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

          <Card
            title="Informações da sessão"
            subtitle="Resumo simples da operação."
          >
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