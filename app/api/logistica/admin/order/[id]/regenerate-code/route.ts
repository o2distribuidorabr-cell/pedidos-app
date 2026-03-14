import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createOrReplaceDeliveryConfirmation } from "@/lib/deliveryConfirmation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const confirmation = await createOrReplaceDeliveryConfirmation(
      supabaseAdmin,
      {
        orderId: id,
        codeLength: 4,
        expiresInHours: 6,
        maxAttempts: 5,
      }
    );

    return NextResponse.json({
      ok: true,
      message: "Código regenerado com sucesso.",
      confirmationCode: confirmation.confirmation_code,
      confirmation,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao regenerar código.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}