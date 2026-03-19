import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeliveryTrackingSessionRow,
  PublicTrackingSessionPayload,
} from "@/lib/deliveryTypes";

function generateTrackingToken(size = 32): string {
  return randomBytes(size).toString("hex");
}

function isValidCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function createTrackingSession(
  supabase: SupabaseClient,
  params: {
    orderId: string;
    driverName?: string | null;
    driverPhone?: string | null;
  }
): Promise<DeliveryTrackingSessionRow> {
  const { orderId, driverName = null, driverPhone = null } = params;

  const trackingToken = generateTrackingToken(24);

  const { data, error } = await supabase
    .from("delivery_tracking_sessions")
    .insert({
      order_id: orderId,
      tracking_token: trackingToken,
      status: "PENDENTE",
      driver_name: driverName,
      driver_phone: driverPhone,
      started_at: null,
      ended_at: null,
      last_lat: null,
      last_lng: null,
      last_accuracy: null,
      last_seen_at: null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Erro ao criar sessão de rastreio: ${error.message}`);
  }

  return data as DeliveryTrackingSessionRow;
}

export async function getTrackingSessionByToken(
  supabase: SupabaseClient,
  token: string
): Promise<DeliveryTrackingSessionRow | null> {
  const { data, error } = await supabase
    .from("delivery_tracking_sessions")
    .select("*")
    .eq("tracking_token", token)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar sessão por token: ${error.message}`);
  }

  return (data as DeliveryTrackingSessionRow | null) ?? null;
}

export async function getLatestTrackingSessionByOrderId(
  supabase: SupabaseClient,
  orderId: string
): Promise<DeliveryTrackingSessionRow | null> {
  const { data, error } = await supabase
    .from("delivery_tracking_sessions")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erro ao buscar última sessão de rastreio do pedido: ${error.message}`
    );
  }

  return (data as DeliveryTrackingSessionRow | null) ?? null;
}

export async function startTrackingSessionByToken(
  supabase: SupabaseClient,
  token: string
): Promise<DeliveryTrackingSessionRow> {
  const session = await getTrackingSessionByToken(supabase, token);

  if (!session) {
    throw new Error("Sessão de rastreio não encontrada.");
  }

  if (session.status === "ENCERRADO") {
    throw new Error("A sessão já foi encerrada.");
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("delivery_tracking_sessions")
    .update({
      status: "ATIVO",
      started_at: session.started_at ?? now,
      last_seen_at: now,
    })
    .eq("id", session.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Erro ao iniciar sessão de rastreio: ${error.message}`);
  }

  return data as DeliveryTrackingSessionRow;
}

export async function pauseTrackingSessionByToken(
  supabase: SupabaseClient,
  token: string
): Promise<DeliveryTrackingSessionRow> {
  const session = await getTrackingSessionByToken(supabase, token);

  if (!session) {
    throw new Error("Sessão de rastreio não encontrada.");
  }

  if (session.status === "ENCERRADO") {
    throw new Error("A sessão já foi encerrada.");
  }

  const { data, error } = await supabase
    .from("delivery_tracking_sessions")
    .update({
      status: "PAUSADO",
    })
    .eq("id", session.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Erro ao pausar sessão de rastreio: ${error.message}`);
  }

  return data as DeliveryTrackingSessionRow;
}

export async function endTrackingSessionByToken(
  supabase: SupabaseClient,
  token: string
): Promise<DeliveryTrackingSessionRow> {
  const session = await getTrackingSessionByToken(supabase, token);

  if (!session) {
    throw new Error("Sessão de rastreio não encontrada.");
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("delivery_tracking_sessions")
    .update({
      status: "ENCERRADO",
      ended_at: session.ended_at ?? now,
      last_seen_at: now,
    })
    .eq("id", session.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Erro ao encerrar sessão de rastreio: ${error.message}`);
  }

  return data as DeliveryTrackingSessionRow;
}

export async function recordTrackingPointByToken(
  supabase: SupabaseClient,
  params: {
    token: string;
    lat: number;
    lng: number;
    accuracy?: number | null;
  }
): Promise<DeliveryTrackingSessionRow> {
  const { token, lat, lng, accuracy = null } = params;

  if (!isValidCoordinate(lat) || lat < -90 || lat > 90) {
    throw new Error("Latitude inválida.");
  }

  if (!isValidCoordinate(lng) || lng < -180 || lng > 180) {
    throw new Error("Longitude inválida.");
  }

  if (accuracy !== null && accuracy !== undefined) {
    if (!isValidCoordinate(accuracy) || accuracy < 0) {
      throw new Error("Precisão inválida.");
    }
  }

  const session = await getTrackingSessionByToken(supabase, token);

  if (!session) {
    throw new Error("Sessão de rastreio não encontrada.");
  }

  if (session.status === "ENCERRADO") {
    throw new Error("A sessão já foi encerrada.");
  }

  const now = new Date().toISOString();

  const { error: pointError } = await supabase
    .from("delivery_tracking_points")
    .insert({
      session_id: session.id,
      lat,
      lng,
      accuracy,
      recorded_at: now,
    });

  if (pointError) {
    throw new Error(`Erro ao gravar ponto de rastreio: ${pointError.message}`);
  }

  const { data, error } = await supabase
    .from("delivery_tracking_sessions")
    .update({
      status: "ATIVO",
      started_at: session.started_at ?? now,
      last_lat: lat,
      last_lng: lng,
      last_accuracy: accuracy,
      last_seen_at: now,
    })
    .eq("id", session.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Erro ao atualizar status da sessão de rastreio: ${error.message}`
    );
  }

  return data as DeliveryTrackingSessionRow;
}

export async function getPublicTrackingSessionPayloadByToken(
  supabase: SupabaseClient,
  token: string
): Promise<PublicTrackingSessionPayload | null> {
  const { data, error } = await supabase
    .from("vw_order_delivery_overview")
    .select("*")
    .eq("tracking_token", token)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erro ao buscar dados públicos da sessão: ${error.message}`
    );
  }

  if (!data) return null;

  // FIX: busca o endereço de entrega da loja vinculada ao pedido
  let dropoffAddress: string | null = null;
  let dropoffLat: number | null = null;
  let dropoffLng: number | null = null;

  if (data.order_id) {
    const { data: orderData } = await supabase
      .from("orders")
      .select("store_id")
      .eq("id", data.order_id)
      .maybeSingle();

    if (orderData?.store_id) {
      const { data: storeData } = await supabase
        .from("stores")
        .select(
          "address_street, address_number, address_complement, address_neighborhood, city, state, address_lat, address_lng"
        )
        .eq("id", orderData.store_id)
        .maybeSingle();

      if (storeData) {
        dropoffAddress = [
          storeData.address_street,
          storeData.address_number,
          storeData.address_complement,
          storeData.address_neighborhood,
          storeData.city,
          storeData.state,
        ]
          .filter(Boolean)
          .join(", ");

        dropoffLat =
          typeof storeData.address_lat === "number" ? storeData.address_lat : null;
        dropoffLng =
          typeof storeData.address_lng === "number" ? storeData.address_lng : null;
      }
    }
  }

  return {
    sessionId: data.tracking_session_id,
    orderId: data.order_id,
    driverName: data.delivery_driver_name,
    driverPhone: data.delivery_driver_phone,
    trackingStatus: data.tracking_status,
    deliveryStatus: data.delivery_status,
    startedAt: data.tracking_started_at,
    endedAt: data.tracking_ended_at,
    lastSeenAt: data.last_seen_at,
    confirmationStatus: data.confirmation_status,
    codeExpiresAt: data.code_expires_at,
    // FIX: endereço de entrega para abrir no Waze/Maps
    dropoffAddress,
    dropoffLat,
    dropoffLng,
  };
}