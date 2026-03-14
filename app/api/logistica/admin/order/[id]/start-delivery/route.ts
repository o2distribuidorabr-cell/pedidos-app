import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { startDeliveryFlow } from "@/lib/delivery";

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

    const result = await startDeliveryFlow(supabaseAdmin, {
      orderId: id,
      driverName: body.driverName?.trim() || null,
      driverPhone: body.driverPhone?.trim() || null,
      deliveryNotes: body.deliveryNotes?.trim() || null,
      confirmationCodeLength: 4,
      confirmationExpiresInHours: 6,
      confirmationMaxAttempts: 5,
    });

    return NextResponse.json({
      ok: true,
      message: "Entrega iniciada com sucesso.",
      trackingToken: result.trackingSession.tracking_token,
      confirmationCode: result.confirmation.confirmation_code,
      confirmation: result.confirmation,
      trackingSession: result.trackingSession,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao iniciar entrega.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}