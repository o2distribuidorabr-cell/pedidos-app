import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { markOrderAsInSeparation } from "@/lib/delivery";
import { createOrReplaceDeliveryConfirmation } from "@/lib/deliveryConfirmation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type BodyPayload = {
  driverName?: string | null;
  driverPhone?: string | null;
  deliveryNotes?: string | null;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as BodyPayload;

    await markOrderAsInSeparation(supabaseAdmin, {
      orderId: id,
      driverName: body.driverName ?? null,
      driverPhone: body.driverPhone ?? null,
      deliveryNotes: body.deliveryNotes ?? null,
    });

    // Verifica se é pedido de retirada — se sim, gera código de confirmação agora
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("delivery_mode")
      .eq("id", id)
      .maybeSingle();

    let pickupCode: string | null = null;

    if (order?.delivery_mode === "RETIRADA") {
      const confirmation = await createOrReplaceDeliveryConfirmation(supabaseAdmin, {
        orderId: id,
        codeLength: 6, // Código maior para retirada — mais seguro
        expiresInHours: 72, // 3 dias para o franqueado retirar
        maxAttempts: 5,
      });
      pickupCode = confirmation.confirmation_code ?? null;
    }

    return NextResponse.json({
      ok: true,
      message: order?.delivery_mode === "RETIRADA"
        ? "Pedido em separação. Código de retirada gerado — o cliente pode confirmar no portal."
        : "Pedido marcado em separação.",
      isPickup: order?.delivery_mode === "RETIRADA",
      pickupCode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao marcar separação.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}