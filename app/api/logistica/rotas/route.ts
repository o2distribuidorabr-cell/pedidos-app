import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

type CreateRouteRequest = {
  orderIds: string[];
  provider: "autonomo" | "lalamove";
  driverName?: string | null;
  driverPhone?: string | null;
  notes?: string | null;
};

// Calcula distância em km entre dois pontos (Haversine)
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Algoritmo de vizinho mais próximo para ordenar paradas
// Começa do ponto de pickup (depósito) e vai sempre para a parada mais próxima
function nearestNeighborSort(
  stops: Array<{ order_id: string; lat: number; lng: number }>,
  pickupLat: number,
  pickupLng: number
): Array<{ order_id: string; lat: number; lng: number }> {
  if (stops.length <= 1) return stops;

  const remaining = [...stops];
  const sorted: typeof stops = [];
  let currentLat = pickupLat;
  let currentLng = pickupLng;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = haversineKm(currentLat, currentLng, remaining[0].lat, remaining[0].lng);

    for (let i = 1; i < remaining.length; i++) {
      const dist = haversineKm(currentLat, currentLng, remaining[i].lat, remaining[i].lng);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    const nearest = remaining.splice(nearestIdx, 1)[0];
    sorted.push(nearest);
    currentLat = nearest.lat;
    currentLng = nearest.lng;
  }

  return sorted;
}

function generateToken(size = 24): string {
  return randomBytes(size).toString("hex");
}

function generateCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateRouteRequest;

    if (!body.orderIds || body.orderIds.length < 2) {
      return NextResponse.json(
        { ok: false, message: "Selecione pelo menos 2 pedidos para criar uma rota." },
        { status: 400 }
      );
    }

    if (body.orderIds.length > 10) {
      return NextResponse.json(
        { ok: false, message: "Máximo de 10 pedidos por rota." },
        { status: 400 }
      );
    }

    // Busca os pedidos com dados da loja (endereço para ordenação)
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select(`
        id,
        store_id,
        logistic_status,
        stores:stores (
          id,
          name,
          address_street,
          address_number,
          address_complement,
          address_neighborhood,
          city,
          state,
          address_lat,
          address_lng
        )
      `)
      .in("id", body.orderIds);

    if (ordersError) throw ordersError;

    if (!orders || orders.length !== body.orderIds.length) {
      return NextResponse.json(
        { ok: false, message: "Um ou mais pedidos não foram encontrados." },
        { status: 404 }
      );
    }

    // Valida que nenhum já saiu para entrega
    const alreadyDispatched = orders.filter(
      (o: any) => o.logistic_status === "SAIU_PARA_ENTREGA" || o.logistic_status === "ENTREGUE"
    );

    if (alreadyDispatched.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          message: `Os pedidos a seguir já saíram para entrega ou foram entregues: ${alreadyDispatched.map((o: any) => o.id.slice(0, 8)).join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Coordenadas do pickup (depósito) — usa variável de ambiente
    const pickupLat = process.env.LALAMOVE_PICKUP_LAT
      ? Number(process.env.LALAMOVE_PICKUP_LAT)
      : -19.9704199;
    const pickupLng = process.env.LALAMOVE_PICKUP_LNG
      ? Number(process.env.LALAMOVE_PICKUP_LNG)
      : -44.0547074;

    // Monta lista de paradas com coordenadas
    const stopsWithCoords = orders.map((order: any) => {
      const store = Array.isArray(order.stores) ? order.stores[0] : order.stores;
      const lat = typeof store?.address_lat === "number" ? store.address_lat : null;
      const lng = typeof store?.address_lng === "number" ? store.address_lng : null;

      const address = [
        store?.address_street,
        store?.address_number,
        store?.address_complement,
        store?.address_neighborhood,
        store?.city,
        store?.state,
      ]
        .filter(Boolean)
        .join(", ");

      return {
        order_id: order.id,
        store_name: store?.name ?? null,
        address,
        lat: lat ?? pickupLat, // fallback para pickup se não tiver coords
        lng: lng ?? pickupLng,
        has_coords: lat != null && lng != null,
      };
    });

    // Ordena pela distância (vizinho mais próximo partindo do depósito)
    const sorted = nearestNeighborSort(stopsWithCoords, pickupLat, pickupLng);

    // Cria a rota no banco
    const trackingToken = generateToken(24);

    const { data: route, error: routeError } = await supabaseAdmin
      .from("delivery_routes")
      .insert({
        provider: body.provider ?? "autonomo",
        status: "PENDENTE",
        driver_name: body.driverName ?? null,
        driver_phone: body.driverPhone ?? null,
        notes: body.notes ?? null,
        tracking_token: trackingToken,
      })
      .select("*")
      .single();

    if (routeError) throw routeError;

    // Cria as paradas em ordem com código de confirmação para cada uma
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(); // 6h

    const stopsPayload = sorted.map((stop, index) => {
      const original = stopsWithCoords.find((s) => s.order_id === stop.order_id)!;
      return {
        route_id: route.id,
        order_id: stop.order_id,
        stop_order: index + 1,
        status: "PENDENTE",
        confirmation_code: generateCode(),
        confirmation_code_expires_at: expiresAt,
        store_name: original.store_name,
        address: original.address,
        address_lat: original.has_coords ? original.lat : null,
        address_lng: original.has_coords ? original.lng : null,
      };
    });

    const { error: stopsError } = await supabaseAdmin
      .from("delivery_route_stops")
      .insert(stopsPayload);

    if (stopsError) throw stopsError;

    // Atualiza todos os pedidos para EM_SEPARACAO se ainda estiverem em RECEBIDO
    const orderIdsToUpdate = orders
      .filter((o: any) => o.logistic_status === "RECEBIDO")
      .map((o: any) => o.id);

    if (orderIdsToUpdate.length > 0) {
      await supabaseAdmin
        .from("orders")
        .update({ logistic_status: "EM_SEPARACAO" })
        .in("id", orderIdsToUpdate);
    }

    // Busca a rota completa com paradas para retornar
    const { data: fullRoute } = await supabaseAdmin
      .from("delivery_routes")
      .select("*, delivery_route_stops(*)")
      .eq("id", route.id)
      .single();

    return NextResponse.json({
      ok: true,
      message: `Rota criada com ${sorted.length} paradas.`,
      route: fullRoute,
      trackingToken,
    });
  } catch (error) {
    console.error("[ROTAS] Erro ao criar rota:", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro ao criar rota.",
        detail: error instanceof Error ? error.stack : String(error),
      },
      { status: 500 }
    );
  }
}

// Lista rotas ativas
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("delivery_routes")
      .select("*, delivery_route_stops(*)")
      .in("status", ["PENDENTE", "EM_ANDAMENTO"])
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, routes: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro ao buscar rotas.",
      },
      { status: 500 }
    );
  }
}