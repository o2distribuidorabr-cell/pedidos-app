"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PageHeader, Badge, Input, Select } from "@/app/components/ui";

type RouteStop = {
  id: string;
  order_id: string;
  stop_order: number;
  status: "PENDENTE" | "CONFIRMADO";
  store_name: string | null;
  address: string | null;
  address_lat: number | null;
  address_lng: number | null;
};

type RouteData = {
  id: string;
  provider: string;
  status: string;
  driver_name: string | null;
  driver_phone: string | null;
  notes: string | null;
  tracking_token: string | null;
  lalamove_quote_id: string | null;
  lalamove_order_id: string | null;
  lalamove_status: string | null;
  lalamove_share_link: string | null;
  lalamove_price_amount: number | null;
  lalamove_price_currency: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string | null;
};

type ServiceOption = {
  key: string;
  label: string;
};

type Props = {
  params: Promise<{ routeId: string }>;
};

const PICKUP_ADDRESS = process.env.NEXT_PUBLIC_PICKUP_ADDRESS ||
  "Rua Coronel Salvador Fernandes, 222, Bandeirantes, Contagem, MG, Brasil";
const PICKUP_LAT = process.env.NEXT_PUBLIC_PICKUP_LAT || "-19.9704199";
const PICKUP_LNG = process.env.NEXT_PUBLIC_PICKUP_LNG || "-44.0547074";
const PICKUP_NAME = "Expedição";
const PICKUP_PHONE = process.env.NEXT_PUBLIC_PICKUP_PHONE || "";

function fmtBRL(v: number | null | undefined) {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function humanizeStatus(v: string | null | undefined) {
  if (!v) return "—";
  return v.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}

function statusTone(v: string | null | undefined) {
  const s = String(v || "").toUpperCase();
  if (s.includes("CANCEL") || s.includes("FAIL")) return "red" as const;
  if (s.includes("DELIVERED") || s.includes("COMPLETED") || s === "CONCLUIDA") return "green" as const;
  if (s.includes("ASSIGNED") || s.includes("ONGOING") || s === "EM_ANDAMENTO") return "blue" as const;
  if (s.includes("PENDING") || s.includes("MATCHING") || s === "PENDENTE") return "yellow" as const;
  return "neutral" as const;
}

function PrimaryActionButton({ children, onClick, disabled, fullWidth }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; fullWidth?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={["inline-flex h-12 items-center justify-center rounded-[18px] bg-cyan-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50", fullWidth ? "w-full" : ""].join(" ")}>
      {children}
    </button>
  );
}

function SecondaryActionButton({ children, onClick, disabled, fullWidth }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; fullWidth?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={["inline-flex h-12 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50", fullWidth ? "w-full" : ""].join(" ")}>
      {children}
    </button>
  );
}

export default function AdmRotaLalamovePage({ params }: Props) {
  const { routeId } = use(params);
  const router = useRouter();

  const [route, setRoute] = useState<RouteData | null>(null);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"green" | "red">("green");

  // Cotação
  const [serviceType, setServiceType] = useState("UV_FIORINO");
  const [availableServices, setAvailableServices] = useState<ServiceOption[]>([]);
  const [senderName, setSenderName] = useState(PICKUP_NAME);
  const [senderPhone, setSenderPhone] = useState(PICKUP_PHONE);
  const [quoting, setQuoting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const showSuccess = (t: string) => { setMessage(t); setMessageTone("green"); };
  const showError = (t: string) => { setMessage(t); setMessageTone("red"); };

  const loadRoute = useCallback(async () => {
    const { data: routeData, error } = await supabase
      .from("delivery_routes")
      .select("*")
      .eq("id", routeId)
      .single();

    if (error || !routeData) {
      showError("Rota não encontrada.");
      setLoading(false);
      return;
    }

    setRoute(routeData as RouteData);

    const { data: stopsData } = await supabase
      .from("delivery_route_stops")
      .select("*")
      .eq("route_id", routeId)
      .order("stop_order", { ascending: true });

    setStops((stopsData ?? []) as RouteStop[]);
    setLoading(false);
  }, [routeId]);

  useEffect(() => {
    loadRoute();
  }, [loadRoute]);

  // Carrega serviços disponíveis via autofill do primeiro pedido
  useEffect(() => {
    if (stops.length === 0) return;

    fetch("/api/lalamove/autofill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: stops[0].order_id }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.data?.services) {
          const services: ServiceOption[] = data.data.services.map((s: any) => ({
            key: s.key,
            label: s.key,
          }));
          setAvailableServices(services);
          if (data.data.preferredServiceType) {
            setServiceType(data.data.preferredServiceType);
          }
        }
      })
      .catch(() => {});
  }, [stops]);

  async function handleQuote() {
    if (!serviceType) { showError("Selecione o tipo de veículo."); return; }

    setQuoting(true);
    setMessage(null);

    try {
      // Monta os stops da cotação: pickup + todas as paradas em ordem
      const dropoffStops = stops.map((stop) => ({
        address: stop.address ?? "",
        lat: stop.address_lat ?? 0,
        lng: stop.address_lng ?? 0,
      }));

      const response = await fetch("/api/lalamove/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeId,
          serviceType,
          language: "pt_BR",
          pickup: {
            address: PICKUP_ADDRESS,
            lat: PICKUP_LAT,
            lng: PICKUP_LNG,
          },
          stops: dropoffStops,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Erro ao gerar cotação.");
      }

      await loadRoute();
      showSuccess("Cotação gerada com sucesso!");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Erro ao gerar cotação.");
    } finally {
      setQuoting(false);
    }
  }

  async function handleCreate() {
    if (!route?.lalamove_quote_id) { showError("Gere a cotação antes de chamar a Lalamove."); return; }
    if (!senderName || !senderPhone) { showError("Preencha os dados do remetente."); return; }

    setCreating(true);
    setMessage(null);

    try {
      // Monta os recipients — um por parada
      const recipients = stops.map((stop) => ({
        stopId: "", // será preenchido pelo backend via quotation
        name: stop.store_name ?? "Destinatário",
        phone: "+5531999999999", // placeholder — Lalamove exige mas não usa para contato direto
      }));

      const response = await fetch("/api/lalamove/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeId,
          quotationId: route.lalamove_quote_id,
          sender: { name: senderName, phone: senderPhone },
          recipients,
          partnerName: "Portal American Burger",
          isPODEnabled: false,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Erro ao criar corrida.");
      }

      await loadRoute();
      showSuccess("Corrida Lalamove criada com sucesso!");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Erro ao criar corrida.");
    } finally {
      setCreating(false);
    }
  }

  async function handleCancel() {
    if (!route?.lalamove_order_id) { showError("Não há corrida criada para cancelar."); return; }

    setCancelling(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/lalamove/provider-order/${route.lalamove_order_id}/cancel`,
        { method: "POST", headers: { "Content-Type": "application/json" } }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Erro ao cancelar corrida.");
      }

      // Atualiza status da rota
      await supabase
        .from("delivery_routes")
        .update({ lalamove_status: "CANCELED", status: "CANCELADA" })
        .eq("id", routeId);

      await loadRoute();
      showSuccess("Corrida cancelada.");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Erro ao cancelar corrida.");
    } finally {
      setCancelling(false);
    }
  }

  async function handleCopy(text: string, msg: string) {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess(msg);
    } catch {
      showError("Não foi possível copiar.");
    }
  }

  const trackingLink = route?.tracking_token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/entrega/rota/${route.tracking_token}`
    : null;

  const whatsappUrl = trackingLink
    ? `https://wa.me/?text=${encodeURIComponent(`Sua rota de entregas: ${trackingLink}`)}`
    : null;

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Rota Lalamove" subtitle="Carregando..." />
        <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-slate-500">Carregando dados da rota...</div>
        </div>
      </div>
    );
  }

  if (!route) {
    return (
      <div className="space-y-6">
        <PageHeader title="Rota não encontrada" subtitle="" right={
          <SecondaryActionButton onClick={() => router.push("/adm/expedicao")}>Voltar</SecondaryActionButton>
        } />
      </div>
    );
  }

  const hasQuote = !!route.lalamove_quote_id;
  const hasOrder = !!route.lalamove_order_id;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Rota Lalamove — ${routeId.slice(0, 8)}`}
        subtitle={`${stops.length} paradas • ${humanizeStatus(route.status)}`}
        right={
          <div className="flex flex-wrap gap-2">
            <SecondaryActionButton onClick={() => loadRoute()}>Atualizar</SecondaryActionButton>
            <SecondaryActionButton onClick={() => router.push("/adm/expedicao")}>Voltar</SecondaryActionButton>
          </div>
        }
      />

      {message ? (
        <div className={`rounded-[26px] border p-4 text-sm ${messageTone === "green" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {message}
        </div>
      ) : null}

      {/* Status geral */}
      <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff,#f8f5ff)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(route.status)}>{humanizeStatus(route.status)}</Badge>
          {route.lalamove_status ? (
            <Badge tone={statusTone(route.lalamove_status)}>{humanizeStatus(route.lalamove_status)}</Badge>
          ) : null}
          <Badge tone="blue">Lalamove</Badge>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[18px] border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cotação</div>
            <div className="mt-2 text-sm font-semibold text-slate-900 break-all">{route.lalamove_quote_id || "—"}</div>
          </div>
          <div className="rounded-[18px] border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pedido externo</div>
            <div className="mt-2 text-sm font-semibold text-slate-900 break-all">{route.lalamove_order_id || "—"}</div>
          </div>
          <div className="rounded-[18px] border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Valor</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{fmtBRL(route.lalamove_price_amount)}</div>
          </div>
          <div className="rounded-[18px] border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paradas</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">
              {stops.filter((s) => s.status === "CONFIRMADO").length}/{stops.length} concluídas
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">

          {/* Paradas da rota */}
          <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-base font-semibold text-slate-900">Paradas da rota</div>
            <div className="mt-1 text-sm text-slate-600">Ordem calculada automaticamente pela distância.</div>

            <div className="mt-4 space-y-3">
              {stops.map((stop, index) => (
                <div key={stop.id} className={["rounded-[18px] border p-4", stop.status === "CONFIRMADO" ? "border-green-200 bg-green-50" : "border-slate-200 bg-slate-50"].join(" ")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Parada {stop.stop_order}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {stop.store_name || "Destinatário"}
                      </div>
                      {stop.address ? (
                        <div className="mt-1 text-xs text-slate-500">{stop.address}</div>
                      ) : null}
                      {stop.address_lat && stop.address_lng ? (
                        <div className="mt-1 text-xs text-slate-400">
                          {Number(stop.address_lat).toFixed(5)}, {Number(stop.address_lng).toFixed(5)}
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-red-500">⚠️ Sem coordenadas — geocodifique as lojas</div>
                      )}
                    </div>
                    <Badge tone={stop.status === "CONFIRMADO" ? "green" : "neutral"}>
                      {stop.status === "CONFIRMADO" ? "✅ Entregue" : "Pendente"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Configuração Lalamove */}
          <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-slate-900">Configuração da corrida</div>
                <div className="mt-1 text-sm text-slate-600">
                  {stops.length} paradas serão incluídas na cotação automaticamente.
                </div>
              </div>
              <Badge tone={hasQuote ? "green" : "neutral"}>
                {hasQuote ? "Cotação salva" : "Sem cotação"}
              </Badge>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Select
                  label="Tipo de veículo"
                  value={serviceType}
                  onChange={setServiceType}
                  options={
                    availableServices.length > 0
                      ? availableServices.map((s) => ({ value: s.key, label: s.label }))
                      : [
                          { value: "UV_FIORINO", label: "Fiorino / utilitário" },
                          { value: "VAN", label: "Van" },
                          { value: "TRUCK330", label: "Caminhão 3,30m" },
                          { value: "CAR", label: "Carro" },
                        ]
                  }
                />
              </div>

              <Input label="Remetente" value={senderName} onChange={setSenderName} placeholder="Nome do remetente" />
              <Input label="Telefone do remetente" value={senderPhone} onChange={setSenderPhone} placeholder="+5531999999999" />
            </div>

            {/* Endereço de coleta */}
            <div className="mt-4 rounded-[18px] border border-violet-100 bg-violet-50 p-3 text-sm text-violet-900">
              <b>Coleta:</b> {PICKUP_ADDRESS}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <SecondaryActionButton fullWidth onClick={handleQuote} disabled={quoting}>
                {quoting ? "Cotando..." : "Gerar cotação"}
              </SecondaryActionButton>

              <PrimaryActionButton fullWidth onClick={handleCreate} disabled={creating || !hasQuote || hasOrder}>
                {creating ? "Chamando..." : hasOrder ? "Corrida já criada" : "Chamar Lalamove"}
              </PrimaryActionButton>
            </div>

            {hasQuote && route.lalamove_price_amount ? (
              <div className="mt-3 rounded-[18px] border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                Cotação: <b>{fmtBRL(route.lalamove_price_amount)}</b>
              </div>
            ) : null}
          </div>

          {/* Share link Lalamove */}
          {route.lalamove_share_link ? (
            <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-base font-semibold text-slate-900">Share link Lalamove</div>
              <div className="mt-3 rounded-[18px] border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-900 break-all">
                {route.lalamove_share_link}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <SecondaryActionButton onClick={() => handleCopy(route.lalamove_share_link!, "Share link copiado.")}>
                  Copiar share link
                </SecondaryActionButton>
                <a href={route.lalamove_share_link} target="_blank" rel="noreferrer">
                  <SecondaryActionButton>Abrir share link</SecondaryActionButton>
                </a>
              </div>
            </div>
          ) : null}

        </div>

        {/* Sidebar */}
        <div>
          <div className="xl:sticky xl:top-24 space-y-4">

            {/* Link do motorista */}
            <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-base font-semibold text-slate-900">Link do motorista</div>
              <div className="mt-1 text-sm text-slate-600">Envie para o motorista acompanhar as paradas.</div>

              {trackingLink ? (
                <>
                  <div className="mt-3 rounded-[18px] border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-900 break-all">
                    {trackingLink}
                  </div>
                  <div className="mt-3 grid gap-2">
                    <SecondaryActionButton fullWidth onClick={() => handleCopy(trackingLink, "Link copiado!")}>
                      Copiar link
                    </SecondaryActionButton>
                    {whatsappUrl ? (
                      <a href={whatsappUrl} target="_blank" rel="noreferrer" className="block">
                        <PrimaryActionButton fullWidth>Enviar pelo WhatsApp</PrimaryActionButton>
                      </a>
                    ) : null}
                    <a href={trackingLink} target="_blank" rel="noreferrer" className="block">
                      <SecondaryActionButton fullWidth>Abrir link</SecondaryActionButton>
                    </a>
                  </div>
                </>
              ) : (
                <div className="mt-3 text-sm text-slate-500">Link não disponível.</div>
              )}
            </div>

            {/* Ações */}
            <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-base font-semibold text-slate-900">Ações</div>
              <div className="mt-4 grid gap-3">
                <SecondaryActionButton fullWidth onClick={() => loadRoute()}>Atualizar dados</SecondaryActionButton>
                <SecondaryActionButton
                  fullWidth
                  disabled={cancelling || !hasOrder}
                  onClick={handleCancel}
                >
                  {cancelling ? "Cancelando..." : "Cancelar corrida Lalamove"}
                </SecondaryActionButton>
                <SecondaryActionButton fullWidth onClick={() => router.push("/adm/expedicao")}>
                  Voltar para expedição
                </SecondaryActionButton>
              </div>
            </div>

            {/* Motorista */}
            {route.driver_name || route.driver_phone ? (
              <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-base font-semibold text-slate-900">Motorista</div>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <div className="flex justify-between"><span>Nome</span><span className="font-semibold">{route.driver_name || "—"}</span></div>
                  <div className="flex justify-between"><span>Telefone</span><span className="font-semibold">{route.driver_phone || "—"}</span></div>
                </div>
              </div>
            ) : null}

          </div>
        </div>
      </div>
    </div>
  );
}