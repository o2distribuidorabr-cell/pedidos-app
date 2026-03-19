import { NextRequest, NextResponse } from "next/server";
import { lalamoveFetch, getLalamoveConfig } from "@/lib/lalamove";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type StopInput = {
  address: string;
  lat: string | number;
  lng: string | number;
};

type QuoteRequest = {
  // Pedido único (fluxo original)
  orderId?: string;
  // Rota com múltiplos pedidos
  routeId?: string;
  serviceType: string;
  specialRequests?: string[];
  scheduleAt?: string | null;
  language?: string;
  pickup: StopInput;
  dropoff?: StopInput;       // para pedido único
  stops?: StopInput[];       // para rota com múltiplas paradas
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as QuoteRequest;

    if (!body.orderId && !body.routeId) {
      return NextResponse.json(
        { error: "orderId ou routeId é obrigatório." },
        { status: 400 }
      );
    }

    if (!body.serviceType) {
      return NextResponse.json(
        { error: "serviceType é obrigatório." },
        { status: 400 }
      );
    }

    // Monta os stops da cotação
    // Primeiro stop é sempre o pickup (depósito)
    // Depois vêm os dropoffs (lojas)
    let allStops: StopInput[] = [];

    if (body.stops && body.stops.length > 0) {
      // Rota com múltiplas paradas
      allStops = [body.pickup, ...body.stops];
    } else if (body.dropoff) {
      // Pedido único (fluxo original)
      allStops = [body.pickup, body.dropoff];
    } else {
      return NextResponse.json(
        { error: "Informe dropoff (pedido único) ou stops (rota múltipla)." },
        { status: 400 }
      );
    }

    const payload = {
      data: {
        serviceType: body.serviceType,
        language: body.language ?? "pt_BR",
        stops: allStops.map((stop) => ({
          coordinates: {
            lat: String(stop.lat),
            lng: String(stop.lng),
          },
          address: stop.address,
        })),
        ...(body.scheduleAt ? { scheduleAt: body.scheduleAt } : {}),
        ...(body.specialRequests?.length
          ? { specialRequests: body.specialRequests }
          : {}),
      },
    };

    const result = await lalamoveFetch<any>({
      path: "/v3/quotations",
      method: "POST",
      body: payload,
      market: getLalamoveConfig().market,
    });

    const quotation = result.data?.data;

    // Salva no banco dependendo se é rota ou pedido único
    if (body.routeId) {
      // Rota com múltiplas paradas — salva na tabela delivery_routes
      await supabaseAdmin
        .from("delivery_routes")
        .update({
          lalamove_quote_id: quotation?.quotationId ?? null,
          lalamove_price_amount: quotation?.priceBreakdown?.total
            ? Number(quotation.priceBreakdown.total)
            : null,
          lalamove_price_currency: quotation?.priceBreakdown?.currency ?? null,
          lalamove_last_payload: result.data,
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.routeId);
    } else if (body.orderId) {
      // Pedido único — comportamento original
      await supabaseAdmin.from("order_shipments").upsert(
        {
          local_order_id: body.orderId,
          provider: "LALAMOVE",
          provider_market: getLalamoveConfig().market,
          provider_quote_id: quotation?.quotationId ?? null,
          service_type: body.serviceType,
          pickup_address: body.pickup.address,
          pickup_lat: Number(body.pickup.lat),
          pickup_lng: Number(body.pickup.lng),
          dropoff_address: body.dropoff?.address ?? null,
          dropoff_lat: body.dropoff ? Number(body.dropoff.lat) : null,
          dropoff_lng: body.dropoff ? Number(body.dropoff.lng) : null,
          price_amount: quotation?.priceBreakdown?.total
            ? Number(quotation.priceBreakdown.total)
            : null,
          price_currency: quotation?.priceBreakdown?.currency ?? null,
          last_quote_payload: result.data,
          // Reseta pedido anterior ao gerar nova cotação
          provider_order_id: null,
          provider_driver_id: null,
          provider_status: null,
          provider_event_type: null,
          share_link: null,
          last_order_payload: null,
          last_driver_payload: null,
          last_webhook_payload: null,
        },
        { onConflict: "local_order_id" }
      );
    }

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao gerar cotação Lalamove.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}