import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validateDeliveryConfirmationCode } from "@/lib/deliveryConfirmation";
import { updateOrderDeliveryFields } from "@/lib/delivery";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type BodyPayload = {
  code: string;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as BodyPayload;

    if (!body.code?.trim()) {
      return NextResponse.json(
        { ok: false, message: "Código de confirmação é obrigatório." },
        { status: 400 }
      );
    }

    // Verifica se é pedido de entrega por motorista (FRETE)
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("delivery_mode, logistic_status")
      .eq("id", id)
      .maybeSingle();

    if (!order) {
      return NextResponse.json({ ok: false, message: "Pedido não encontrado." }, { status: 404 });
    }

    if (order.delivery_mode !== "FRETE") {
      return NextResponse.json(
        { ok: false, message: "Este pedido não é de entrega por motorista." },
        { status: 400 }
      );
    }

    if (order.logistic_status === "ENTREGUE") {
      return NextResponse.json(
        { ok: false, message: "Este pedido já foi confirmado como entregue." },
        { status: 400 }
      );
    }

    // Captura IP do request
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "desconhecido";

    // Valida o código
    const validation = await validateDeliveryConfirmationCode(supabaseAdmin, {
      orderId: id,
      code: body.code.trim(),
      confirmedBy: "franqueado-portal-entrega",
    });

    if (!validation.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: validation.message,
          reason: validation.reason,
          attempts: validation.attempts,
          maxAttempts: validation.maxAttempts,
        },
        { status: 400 }
      );
    }

    // Confirma a entrega — marca como ENTREGUE
    const now = new Date().toISOString();
    await updateOrderDeliveryFields(supabaseAdmin, {
      orderId: id,
      deliveryStatus: "ENTREGUE",
      deliveryFinishedAt: now,
    });

    // Salva IP e localização na confirmação
    await supabaseAdmin
      .from("delivery_confirmations")
      .update({
        confirm_ip: ip,
        confirm_lat: body.lat ?? null,
        confirm_lng: body.lng ?? null,
        confirm_accuracy: body.accuracy ?? null,
      })
      .eq("order_id", id);

    return NextResponse.json({
      ok: true,
      message: "Entrega confirmada com sucesso!",
      confirmedAt: now,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao confirmar entrega.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
