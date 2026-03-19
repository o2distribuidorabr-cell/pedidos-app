"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Input, PageHeader } from "@/app/components/ui";

type Stop = {
  id: string;
  orderId: string;
  stopOrder: number;
  status: "PENDENTE" | "CONFIRMADO";
  storeName: string | null;
  address: string | null;
  addressLat: number | null;
  addressLng: number | null;
  confirmedAt: string | null;
  confirmationCode: string | null;
  codeExpiresAt: string | null;
};

type RouteData = {
  id: string;
  provider: string;
  status: string;
  driverName: string | null;
  driverPhone: string | null;
  notes: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

type Props = {
  params: Promise<{ token: string }>;
};

function buildWazeUrl(lat: number, lng: number) {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

function buildMapsUrl(lat: number, lng: number, address: string) {
  const dest = address ? encodeURIComponent(address) : `${lat},${lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return "—";
  }
}

export default function RotaMotoristPage({ params }: Props) {
  const { token } = use(params);

  const [route, setRoute] = useState<RouteData | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [currentStopIndex, setCurrentStopIndex] = useState(-1);
  const [totalStops, setTotalStops] = useState(0);
  const [completedStops, setCompletedStops] = useState(0);

  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"green" | "red">("green");
  const [routeFinished, setRouteFinished] = useState(false);

  const showSuccess = (text: string) => { setMessage(text); setMessageTone("green"); };
  const showError = (text: string) => { setMessage(text); setMessageTone("red"); };

  const loadRoute = useCallback(async () => {
    try {
      const response = await fetch(`/api/logistica/rota/${token}`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        showError(data.message || "Rota não encontrada.");
        return;
      }

      setRoute(data.route);
      setStops(data.stops);
      setCurrentStopIndex(data.currentStop);
      setTotalStops(data.totalStops);
      setCompletedStops(data.completedStops);

      if (data.route.status === "CONCLUIDA") {
        setRouteFinished(true);
      }
    } catch {
      showError("Erro ao carregar rota.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadRoute();
  }, [loadRoute]);

  async function handleStart() {
    try {
      setStarting(true);
      const response = await fetch(`/api/logistica/rota/${token}`, {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        showError(data.message || "Erro ao iniciar rota.");
        return;
      }

      await loadRoute();
      showSuccess("Rota iniciada! Siga para a primeira parada.");
    } catch {
      showError("Erro ao iniciar rota.");
    } finally {
      setStarting(false);
    }
  }

  async function handleConfirmStop(stopId: string) {
    if (!code.trim()) {
      showError("Digite o código de confirmação.");
      return;
    }

    try {
      setConfirming(true);
      setMessage(null);

      const response = await fetch(`/api/logistica/rota/${token}/parada/${stopId}/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        showError(data.message || "Código incorreto.");
        return;
      }

      setCode("");
      showSuccess(data.message);

      if (data.routeFinished) {
        setRouteFinished(true);
      }

      await loadRoute();
    } catch {
      showError("Erro ao confirmar parada.");
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <Card><div className="text-sm text-slate-500">Carregando rota...</div></Card>
        </div>
      </div>
    );
  }

  if (!route) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <Card>
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Rota não encontrada ou link inválido.
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const currentStop = currentStopIndex >= 0 ? stops[currentStopIndex] : null;
  const isNotStarted = route.status === "PENDENTE";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-5">
        <PageHeader
          title="Rota de entrega"
          subtitle={`${completedStops} de ${totalStops} paradas concluídas`}
        />

        {/* Progresso */}
        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900">
              Progresso da rota
            </div>
            <div className="text-sm font-semibold text-slate-600">
              {completedStops}/{totalStops}
            </div>
          </div>
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-cyan-500 transition-all duration-500"
              style={{
                width: totalStops > 0 ? `${(completedStops / totalStops) * 100}%` : "0%",
              }}
            />
          </div>
          {route.driverName ? (
            <div className="mt-3 text-sm text-slate-600">
              Motorista: <span className="font-semibold text-slate-900">{route.driverName}</span>
            </div>
          ) : null}
        </div>

        {/* Mensagem */}
        {message ? (
          <div className={`rounded-[20px] border p-4 text-sm ${
            messageTone === "green"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}>
            {message}
          </div>
        ) : null}

        {/* Rota concluída */}
        {routeFinished ? (
          <div className="rounded-[24px] border border-green-200 bg-green-50 p-6 text-center shadow-sm">
            <div className="text-4xl">✅</div>
            <div className="mt-3 text-lg font-semibold text-green-800">
              Rota concluída!
            </div>
            <div className="mt-1 text-sm text-green-700">
              Todas as {totalStops} entregas foram realizadas com sucesso.
            </div>
          </div>
        ) : null}

        {/* Iniciar rota */}
        {isNotStarted && !routeFinished ? (
          <div className="rounded-[24px] border border-cyan-200 bg-cyan-50 p-5 shadow-sm">
            <div className="text-base font-semibold text-cyan-900">
              Pronto para começar?
            </div>
            <div className="mt-1 text-sm text-cyan-700">
              Toque em iniciar para começar a rota com {totalStops} paradas.
            </div>
            <div className="mt-4">
              <Button onClick={handleStart} disabled={starting}>
                {starting ? "Iniciando..." : "Iniciar rota"}
              </Button>
            </div>
          </div>
        ) : null}

        {/* Parada atual */}
        {currentStop && !routeFinished && !isNotStarted ? (
          <div className="rounded-[24px] border border-cyan-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-cyan-600">
                  Parada atual — {currentStop.stopOrder} de {totalStops}
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {currentStop.storeName || "Destinatário"}
                </div>
              </div>
              <Badge tone="blue">Em andamento</Badge>
            </div>

            {currentStop.address ? (
              <div className="mt-3 rounded-[18px] border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                📍 {currentStop.address}
              </div>
            ) : null}

            {/* Botões de navegação */}
            {currentStop.addressLat && currentStop.addressLng ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={buildWazeUrl(currentStop.addressLat, currentStop.addressLng)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[16px] bg-[#33CCFF] px-4 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  🚗 Waze
                </a>
                <a
                  href={buildMapsUrl(
                    currentStop.addressLat,
                    currentStop.addressLng,
                    currentStop.address ?? ""
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[16px] bg-[#4285F4] px-4 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  🗺️ Maps
                </a>
              </div>
            ) : null}

            {/* Confirmação */}
            <div className="mt-5 border-t border-slate-100 pt-5">
              <div className="text-sm font-semibold text-slate-900">
                Confirmar entrega
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Peça o código de confirmação ao cliente.
              </div>

              <div className="mt-3">
                <Input
                  label="Código do cliente"
                  value={code}
                  onChange={setCode}
                  placeholder="Digite o código de 4 dígitos"
                />
              </div>

              <div className="mt-3">
                <Button
                  onClick={() => handleConfirmStop(currentStop.id)}
                  disabled={confirming}
                >
                  {confirming ? "Confirmando..." : "Confirmar entrega"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Lista de todas as paradas */}
        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900 mb-4">
            Todas as paradas
          </div>

          <div className="space-y-3">
            {stops.map((stop, index) => {
              const isCurrent = index === currentStopIndex;
              const isDone = stop.status === "CONFIRMADO";
              const isPending = !isDone && !isCurrent;

              return (
                <div
                  key={stop.id}
                  className={[
                    "rounded-[18px] border p-4 transition",
                    isDone
                      ? "border-green-200 bg-green-50"
                      : isCurrent
                      ? "border-cyan-200 bg-cyan-50"
                      : "border-slate-200 bg-slate-50 opacity-60",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Parada {stop.stopOrder}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {stop.storeName || "Destinatário"}
                      </div>
                      {stop.address ? (
                        <div className="mt-1 text-xs text-slate-500 truncate">
                          {stop.address}
                        </div>
                      ) : null}
                      {isDone && stop.confirmedAt ? (
                        <div className="mt-1 text-xs text-green-600">
                          Confirmado em {formatDateTime(stop.confirmedAt)}
                        </div>
                      ) : null}
                    </div>

                    <div className="shrink-0">
                      {isDone ? (
                        <Badge tone="green">✅ Entregue</Badge>
                      ) : isCurrent ? (
                        <Badge tone="blue">Atual</Badge>
                      ) : (
                        <Badge tone="neutral">Aguardando</Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}