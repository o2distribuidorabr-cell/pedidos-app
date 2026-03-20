import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validateDeliveryConfirmationCode } from "@/lib/deliveryConfirmation";
import { updateOrderDeliveryFields } from "@/lib/delivery";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type BodyPayload = {
  code: string;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as BodyPayload;

    if (!body.code?.trim()) {
      return NextResponse.json(
        { ok: false, message: "Código de confirmação é obrigatório." },
        { status: 400 }
      );
    }

    // Verifica se é pedido de retirada
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("delivery_mode, logistic_status")
      .eq("id", id)
      .maybeSingle();

    if (!order) {
      return NextResponse.json({ ok: false, message: "Pedido não encontrado." }, { status: 404 });
    }

    if (order.delivery_mode !== "RETIRADA") {
      return NextResponse.json(
        { ok: false, message: "Este pedido não é de retirada." },
        { status: 400 }
      );
    }

    if (order.logistic_status === "ENTREGUE") {
      return NextResponse.json(
        { ok: false, message: "Este pedido já foi confirmado como retirado." },
        { status: 400 }
      );
    }

    // Valida o código
    const validation = await validateDeliveryConfirmationCode(supabaseAdmin, {
      orderId: id,
      code: body.code.trim(),
      confirmedBy: "franqueado-portal",
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

    // Confirma a retirada — marca como ENTREGUE
    const now = new Date().toISOString();
    await updateOrderDeliveryFields(supabaseAdmin, {
      orderId: id,
      deliveryStatus: "ENTREGUE",
      deliveryFinishedAt: now,
    });

    return NextResponse.json({
      ok: true,
      message: "Retirada confirmada com sucesso!",
      confirmedAt: now,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao confirmar retirada.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}