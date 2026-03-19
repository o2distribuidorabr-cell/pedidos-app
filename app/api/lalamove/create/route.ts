import { NextRequest, NextResponse } from "next/server";
import { getLalamoveConfig, lalamoveFetch } from "@/lib/lalamove";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type CreateOrderRequest = {
  orderId: string;
  quotationId: string;
  sender: {
    name: string;
    phone: string;
  };
  recipient: {
    name: string;
    phone: string;
    remarks?: string;
  };
  partnerName?: string;
  isPODEnabled?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateOrderRequest;

    if (!body.orderId || !body.quotationId) {
      return NextResponse.json(
        { error: "orderId e quotationId são obrigatórios." },
        { status: 400 }
      );
    }

    const quotationResult = await lalamoveFetch<any>({
      path: `/v3/quotations/${body.quotationId}`,
      method: "GET",
      market: getLalamoveConfig().market,
    });

    const quotation = quotationResult.data?.data;
    const pickupStop = quotation?.stops?.[0];
    const dropoffStop = quotation?.stops?.[1];

    if (!pickupStop?.stopId || !dropoffStop?.stopId) {
      return NextResponse.json(
        { error: "Não foi possível localizar os stopIds da cotação." },
        { status: 400 }
      );
    }

    const payload = {
      data: {
        quotationId: body.quotationId,
        isPODEnabled: body.isPODEnabled ?? false,
        ...(body.partnerName ? { partner: body.partnerName } : {}),
        sender: {
          stopId: pickupStop.stopId,
          name: body.sender.name,
          phone: body.sender.phone,
        },
        recipients: [
          {
            stopId: dropoffStop.stopId,
            name: body.recipient.name,
            phone: body.recipient.phone,
            ...(body.recipient.remarks
              ? { remarks: body.recipient.remarks }
              : {}),
          },
        ],
        metadata: {
          localOrderId: body.orderId,
          source: "portal-american-burger",
        },
      },
    };

    const result = await lalamoveFetch<any>({
      path: "/v3/orders",
      method: "POST",
      body: payload,
      market: getLalamoveConfig().market,
    });

    const order = result.data?.data;

    const { error } = await supabaseAdmin.from("order_shipments").upsert(
      {
        local_order_id: body.orderId,
        provider: "LALAMOVE",
        provider_market: getLalamoveConfig().market,
        provider_quote_id: body.quotationId,
        provider_order_id: order?.orderId ?? null,
        provider_driver_id: order?.driverId ?? null,
        provider_status: order?.status ?? null,
        share_link: order?.shareLink ?? null,
        sender_name: body.sender.name,
        sender_phone: body.sender.phone,
        recipient_name: body.recipient.name,
        recipient_phone: body.recipient.phone,
        price_amount: order?.priceBreakdown?.total
          ? Number(order.priceBreakdown.total)
          : null,
        price_currency: order?.priceBreakdown?.currency ?? null,
        last_order_payload: result.data,
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
        error: "Falha ao criar pedido Lalamove.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}