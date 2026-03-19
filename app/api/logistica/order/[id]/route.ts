import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getOrderDeliveryOverview } from "@/lib/delivery";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function getStoreName(store: Record<string, unknown> | null): string {
  if (!store) return "Sem loja";
  const possibleKeys = [
    "name", "title", "store", "loja", "fantasy_name",
    "display_name", "label", "description", "codigo", "code",
  ];
  for (const key of possibleKeys) {
    const value = store[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return typeof store.id === "string" ? store.id : "Sem loja";
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

// Extrai lat/lng do motorista Lalamove a partir dos payloads salvos no banco
function extractLalamoveCoords(shipment: Record<string, unknown> | null): {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  lastSeenAt: string | null;
  shareLink: string | null;
  driverName: string | null;
  driverPhone: string | null;
} {
  if (!shipment) {
    return { lat: null, lng: null, accuracy: null, lastSeenAt: null, shareLink: null, driverName: null, driverPhone: null };
  }

  const d = shipment.last_driver_payload as any;
  const o = shipment.last_order_payload as any;
  const w = shipment.last_webhook_payload as any;

  const lat = firstNumber(
    d?.data?.coordinates?.lat, d?.data?.driver?.coordinates?.lat,
    d?.data?.driver?.location?.lat, o?.data?.driver?.coordinates?.lat,
    o?.data?.driver?.location?.lat, w?.data?.driver?.coordinates?.lat,
    w?.data?.driver?.location?.lat
  );

  const lng = firstNumber(
    d?.data?.coordinates?.lng, d?.data?.coordinates?.lon,
    d?.data?.driver?.coordinates?.lng, d?.data?.driver?.location?.lng,
    o?.data?.driver?.coordinates?.lng, o?.data?.driver?.location?.lng,
    w?.data?.driver?.coordinates?.lng, w?.data?.driver?.location?.lng
  );

  const accuracy = firstNumber(
    d?.data?.accuracy, d?.data?.driver?.accuracy,
    o?.data?.driver?.accuracy, w?.data?.driver?.accuracy
  );

  const lastSeenAt = firstString(
    d?.data?.updatedAt, d?.data?.timestamp, d?.data?.driver?.updatedAt,
    o?.data?.updatedAt, o?.data?.driver?.updatedAt,
    w?.data?.updatedAt, shipment.updated_at as string
  );

  const driverName = firstString(
    d?.data?.name, d?.data?.driver?.name, d?.data?.driverInfo?.name,
    o?.data?.driver?.name, o?.data?.driverInfo?.name,
    w?.data?.driver?.name
  );

  const driverPhone = firstString(
    d?.data?.phone, d?.data?.driver?.phone, d?.data?.driver?.phoneNumber,
    o?.data?.driver?.phone, o?.data?.driver?.phoneNumber,
    w?.data?.driver?.phone
  );

  const shareLink = firstString(shipment.share_link as string);

  return { lat, lng, accuracy, lastSeenAt, shareLink, driverName, driverPhone };
}

export async function GET(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (orderError) {
      return NextResponse.json({ ok: false, message: orderError.message }, { status: 400 });
    }

    if (!order) {
      return NextResponse.json({ ok: false, message: "Pedido não encontrado." }, { status: 404 });
    }

    const overview = await getOrderDeliveryOverview(supabaseAdmin, id);

    const { data: confirmation } = await supabaseAdmin
      .from("delivery_confirmations")
      .select("confirmation_code")
      .eq("order_id", id)
      .maybeSingle();

    let store: Record<string, unknown> | null = null;
    let storeLabel = "Sem loja";

    if (order.store_id) {
      const { data: storeData } = await supabaseAdmin
        .from("stores")
        .select("*")
        .eq("id", order.store_id)
        .maybeSingle();
      store = (storeData as Record<string, unknown> | null) ?? null;
      storeLabel = getStoreName(store);
    }

    // Busca shipment da Lalamove para este pedido
    const { data: shipmentData } = await supabaseAdmin
      .from("order_shipments")
      .select("last_driver_payload, last_order_payload, last_webhook_payload, share_link, provider_status, updated_at")
      .eq("local_order_id", id)
      .eq("provider", "LALAMOVE")
      .maybeSingle();

    const shipment = (shipmentData as Record<string, unknown> | null) ?? null;
    const lalamove = extractLalamoveCoords(shipment);

    // Se a Lalamove tem coordenadas e o overview interno não tem,
    // injeta as coordenadas da Lalamove no overview para o mapa funcionar
    let finalOverview = overview;

    if (finalOverview && lalamove.lat != null && lalamove.lng != null) {
      const internalHasCoords =
        finalOverview.last_lat != null && finalOverview.last_lng != null;

      // Usa Lalamove se o motorista autônomo não tiver coordenadas
      // ou se a Lalamove tiver atualização mais recente
      const lalamoveIsNewer =
        lalamove.lastSeenAt &&
        finalOverview.last_seen_at &&
        new Date(lalamove.lastSeenAt) > new Date(finalOverview.last_seen_at);

      if (!internalHasCoords || lalamoveIsNewer) {
        finalOverview = {
          ...finalOverview,
          last_lat: lalamove.lat,
          last_lng: lalamove.lng,
          last_accuracy: lalamove.accuracy,
          last_seen_at: lalamove.lastSeenAt,
          // Preenche nome e telefone do motorista se não estiver no overview interno
          delivery_driver_name: finalOverview.delivery_driver_name || lalamove.driverName,
          delivery_driver_phone: finalOverview.delivery_driver_phone || lalamove.driverPhone,
        };
      }
    }

    return NextResponse.json({
      ok: true,
      order,
      overview: finalOverview,
      store,
      storeLabel,
      confirmationCode: confirmation?.confirmation_code ?? null,
      // Passa o shareLink da Lalamove para o frontend poder exibir se quiser
      lalamoveShareLink: lalamove.shareLink ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno do servidor.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}