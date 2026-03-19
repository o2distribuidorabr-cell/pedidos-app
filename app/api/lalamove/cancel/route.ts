import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { lalamoveFetch } from "@/lib/lalamove";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orderId = String(body?.orderId || "").trim();

    if (!orderId) {
      return NextResponse.json(
        { ok: false, message: "orderId é obrigatório." },
        { status: 400 }
      );
    }

    const { data: shipment, error: shipmentError } = await supabaseAdmin
      .from("order_shipments")
      .select(`
        id,
        local_order_id,
        provider,
        provider_order_id,
        provider_status
      `)
      .eq("local_order_id", orderId)
      .eq("provider", "LALAMOVE")
      .maybeSingle();

    if (shipmentError) throw shipmentError;

    if (!shipment) {
      return NextResponse.json(
        { ok: false, message: "Corrida Lalamove não encontrada para este pedido." },
        { status: 404 }
      );
    }

    if (!shipment.provider_order_id) {
      return NextResponse.json(
        { ok: false, message: "Ainda não existe pedido externo criado na Lalamove." },
        { status: 400 }
      );
    }

    // IMPORTANTE:
    // sua helper lalamoveFetch precisa aceitar resposta 204 sem tentar fazer response.json().
    // Se a sua helper hoje quebrar em 204, me mande o arquivo lib/lalamove.ts atual.
    await lalamoveFetch<unknown>({
      path: `/v3/orders/${shipment.provider_order_id}`,
      method: "DELETE",
    });

    const now = new Date().toISOString();

    const { error: updateShipmentError } = await supabaseAdmin
      .from("order_shipments")
      .update({
        provider_status: "CANCELED",
        provider_event_type: "MANUAL_CANCEL",
        updated_at: now,
        last_webhook_payload: {
          type: "MANUAL_CANCEL",
          canceledAt: now,
          source: "portal_admin",
        },
      })
      .eq("id", shipment.id);

    if (updateShipmentError) throw updateShipmentError;

    return NextResponse.json({
      ok: true,
      message: "Corrida Lalamove cancelada com sucesso.",
    });
  } catch (error) {
    const raw =
      error instanceof Error
        ? error.message
        : "Erro ao cancelar corrida na Lalamove.";

    const message =
      raw === "ERR_CANCELLATION_FORBIDDEN"
        ? "A Lalamove não permitiu o cancelamento desta corrida."
        : raw;

    return NextResponse.json(
      { ok: false, message },
      { status: 500 }
    );
  }
}