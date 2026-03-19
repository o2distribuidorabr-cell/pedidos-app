import { NextRequest, NextResponse } from "next/server";
import { lalamoveFetch, getLalamoveConfig } from "@/lib/lalamove";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type QuoteRequest = {
  orderId: string;
  serviceType: string;
  specialRequests?: string[];
  scheduleAt?: string | null;
  language?: string;
  pickup: {
    address: string;
    lat: string | number;
    lng: string | number;
  };
  dropoff: {
    address: string;
    lat: string | number;
    lng: string | number;
  };
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as QuoteRequest;

    if (!body.orderId) {
      return NextResponse.json(
        { error: "orderId é obrigatório." },
        { status: 400 }
      );
    }

    if (!body.serviceType) {
      return NextResponse.json(
        { error: "serviceType é obrigatório." },
        { status: 400 }
      );
    }

    const payload = {
      data: {
        serviceType: body.serviceType,
        language: body.language ?? "pt_BR",
        stops: [
          {
            coordinates: {
              lat: String(body.pickup.lat),
              lng: String(body.pickup.lng),
            },
            address: body.pickup.address,
          },
          {
            coordinates: {
              lat: String(body.dropoff.lat),
              lng: String(body.dropoff.lng),
            },
            address: body.dropoff.address,
          },
        ],
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

    const { error } = await supabaseAdmin.from("order_shipments").upsert(
      {
        local_order_id: body.orderId,
        provider: "LALAMOVE",
        provider_market: getLalamoveConfig().market,
        provider_quote_id: quotation?.quotationId ?? null,
        service_type: body.serviceType,
        pickup_address: body.pickup.address,
        pickup_lat: Number(body.pickup.lat),
        pickup_lng: Number(body.pickup.lng),
        dropoff_address: body.dropoff.address,
        dropoff_lat: Number(body.dropoff.lat),
        dropoff_lng: Number(body.dropoff.lng),
        price_amount: quotation?.priceBreakdown?.total
          ? Number(quotation.priceBreakdown.total)
          : null,
        price_currency: quotation?.priceBreakdown?.currency ?? null,
        last_quote_payload: result.data,
        // FIX: reseta o pedido anterior ao gerar nova cotação
        // Isso permite rechamar a Lalamove após um cancelamento
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

    if (error) {
      throw error;
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