import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { pauseTrackingSessionByToken } from "@/lib/deliveryTracking";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

export async function POST(_: Request, context: RouteContext) {
  try {
    const { token } = await context.params;

    if (!token) {
      return NextResponse.json(
        { ok: false, message: "Token não informado." },
        { status: 400 }
      );
    }

    const session = await pauseTrackingSessionByToken(supabaseAdmin, token);

    return NextResponse.json({
      ok: true,
      session,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro interno do servidor.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}