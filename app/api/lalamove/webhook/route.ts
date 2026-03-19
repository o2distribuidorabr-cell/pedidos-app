import { NextRequest, NextResponse } from "next/server";
import { verifyLalamoveWebhook } from "@/lib/lalamove";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function getProviderOrderId(payload: any) {
  return (
    payload?.data?.order?.orderId ??
    payload?.data?.orderId ??
    payload?.data?.replacedOrder?.orderId ??
    null
  );
}

function getProviderStatus(payload: any) {
  return payload?.data?.order?.status ?? payload?.data?.status ?? null;
}

function getDriverId(payload: any) {
  return (
    payload?.data?.driver?.driverId ??
    payload?.data?.driverId ??
    payload?.data?.order?.driverId ??
    null
  );
}

function getReplacementOrderId(payload: any) {
  return (
    payload?.data?.newOrder?.orderId ??
    payload?.data?.replacement?.orderId ??
    payload?.data?.replacementOrderId ??
    null
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Handshake / teste inicial da Lalamove
  if (!rawBody) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  try {
    const payload = JSON.parse(rawBody);
    const path = new URL(request.url).pathname;
    const isValid = verifyLalamoveWebhook(payload, path);

    if (!isValid) {
      return NextResponse.json(
        { error: "Assinatura do webhook inválida." },
        { status: 401 }
      );
    }

    const providerOrderId = getProviderOrderId(payload);
    const providerStatus = getProviderStatus(payload);
    const providerDriverId = getDriverId(payload);
    const replacementOrderId = getReplacementOrderId(payload);
    const eventType = payload?.eventType ?? null;

    await supabaseAdmin.from("order_shipment_events").insert({
      provider: "LALAMOVE",
      provider_order_id: providerOrderId,
      event_type: eventType,
      payload,
    });

    if (providerOrderId) {
      const updates: Record<string, unknown> = {
        provider_event_type: eventType,
        provider_status: providerStatus,
        provider_driver_id: providerDriverId,
        last_webhook_payload: payload,
      };

      if (eventType === "ORDER_REPLACED" && replacementOrderId) {
        updates.provider_order_id = replacementOrderId;
      }

      await supabaseAdmin
        .from("order_shipments")
        .update(updates)
        .eq("provider_order_id", providerOrderId);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao processar webhook Lalamove.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}