import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getOrderDeliveryOverview } from "@/lib/delivery";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function getStoreName(store: Record<string, unknown> | null): string {
  if (!store) return "Sem loja";
  const possibleKeys = ["name", "title", "store", "loja", "fantasy_name", "display_name", "label", "description", "codigo", "code"];
  for (const key of possibleKeys) {
    const value = store[key];
    if (typeof value === "string" && value.trim()) return value.trim();
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

function extractLalamoveCoords(shipment: Record<string, unknown> | null) {
  if (!shipment) return { lat: null, lng: null, accuracy: null, lastSeenAt: null, shareLink: null, driverName: null, driverPhone: null };

  const d = shipment.last_driver_payload as any;
  const o = shipment.last_order_payload as any;
  const w = shipment.last_webhook_payload as any;

  const lat = firstNumber(d?.data?.coordinates?.lat, d?.data?.driver?.coordinates?.lat, d?.data?.driver?.location?.lat, o?.data?.driver?.coordinates?.lat, o?.data?.driver?.location?.lat, w?.data?.driver?.coordinates?.lat, w?.data?.driver?.location?.lat);
  const lng = firstNumber(d?.data?.coordinates?.lng, d?.data?.coordinates?.lon, d?.data?.driver?.coordinates?.lng, d?.data?.driver?.location?.lng, o?.data?.driver?.coordinates?.lng, o?.data?.driver?.location?.lng, w?.data?.driver?.coordinates?.lng, w?.data?.driver?.location?.lng);
  const accuracy = firstNumber(d?.data?.accuracy, d?.data?.driver?.accuracy, o?.data?.driver?.accuracy, w?.data?.driver?.accuracy);
  const lastSeenAt = firstString(d?.data?.updatedAt, d?.data?.timestamp, d?.data?.driver?.updatedAt, o?.data?.updatedAt, o?.data?.driver?.updatedAt, w?.data?.updatedAt, shipment.updated_at as string);
  const driverName = firstString(d?.data?.name, d?.data?.driver?.name, d?.data?.driverInfo?.name, o?.data?.driver?.name, o?.data?.driverInfo?.name, w?.data?.driver?.name);
  const driverPhone = firstString(d?.data?.phone, d?.data?.driver?.phone, d?.data?.driver?.phoneNumber, o?.data?.driver?.phone, o?.data?.driver?.phoneNumber, w?.data?.driver?.phone);
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

    if (orderError) return NextResponse.json({ ok: false, message: orderError.message }, { status: 400 });
    if (!order) return NextResponse.json({ ok: false, message: "Pedido não encontrado." }, { status: 404 });

    const overview = await getOrderDeliveryOverview(supabaseAdmin, id);

    // Verifica se o pedido faz parte de uma rota múltipla
    let confirmationCode: string | null = null;
    let routeInfo: {
      routeId: string;
      stopOrder: number;
      totalStops: number;
      stopStatus: string;
      codeExpiresAt: string | null;
    } | null = null;

    const { data: routeStop } = await supabaseAdmin
      .from("delivery_route_stops")
      .select("id, route_id, stop_order, status, confirmation_code, confirmation_code_expires_at")
      .eq("order_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (routeStop?.confirmation_code) {
      // Pedido faz parte de uma rota múltipla — usa código da parada
      confirmationCode = routeStop.confirmation_code;

      const { count: totalStops } = await supabaseAdmin
        .from("delivery_route_stops")
        .select("*", { count: "exact", head: true })
        .eq("route_id", routeStop.route_id);

      routeInfo = {
        routeId: routeStop.route_id,
        stopOrder: routeStop.stop_order,
        totalStops: totalStops ?? 1,
        stopStatus: routeStop.status,
        codeExpiresAt: routeStop.confirmation_code_expires_at,
      };
    } else {
      const { data: confirmation } = await supabaseAdmin
        .from("delivery_confirmations")
        .select("confirmation_code, status, confirmed_at, confirmed_by, code_expires_at, attempts, max_attempts, confirm_ip, confirm_lat, confirm_lng, confirm_accuracy, confirm_address")
        .eq("order_id", id)
        .maybeSingle();

      const deliveryMode = (order as any).delivery_mode ?? null;

      // Sempre retorna o código para o cliente — esta API só é chamada pelo portal do franqueado
      // O admin não vê o código porque a página de logística do admin usa uma API diferente
      confirmationCode = confirmation?.confirmation_code ?? null;

      // Retorna metadados da confirmação (sem o código em si para entrega)
      if (confirmation) {
        (order as any)._confirmationMeta = {
          status: confirmation.status,
          confirmedAt: confirmation.confirmed_at,
          confirmedBy: confirmation.confirmed_by,
          expiresAt: confirmation.code_expires_at,
          attempts: confirmation.attempts,
          maxAttempts: confirmation.max_attempts,
          confirmIp: (confirmation as any).confirm_ip ?? null,
          confirmLat: (confirmation as any).confirm_lat ?? null,
          confirmLng: (confirmation as any).confirm_lng ?? null,
          confirmAccuracy: (confirmation as any).confirm_accuracy ?? null,
          confirmAddress: (confirmation as any).confirm_address ?? null,
        };
      }
    }

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

    const { data: shipmentData } = await supabaseAdmin
      .from("order_shipments")
      .select("last_driver_payload, last_order_payload, last_webhook_payload, share_link, provider_status, updated_at")
      .eq("local_order_id", id)
      .eq("provider", "LALAMOVE")
      .maybeSingle();

    const shipment = (shipmentData as Record<string, unknown> | null) ?? null;
    const lalamove = extractLalamoveCoords(shipment);

    let finalOverview = overview;

    if (finalOverview && lalamove.lat != null && lalamove.lng != null) {
      const internalHasCoords = finalOverview.last_lat != null && finalOverview.last_lng != null;
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
      confirmationCode,
      routeInfo,
      confirmationMeta: (order as any)._confirmationMeta ?? null,
      lalamoveShareLink: lalamove.shareLink ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno do servidor.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}