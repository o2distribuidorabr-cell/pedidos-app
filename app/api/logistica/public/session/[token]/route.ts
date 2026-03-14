import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPublicTrackingSessionPayloadByToken } from "@/lib/deliveryTracking";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const { token } = await context.params;

    if (!token) {
      return NextResponse.json(
        { ok: false, message: "Token não informado." },
        { status: 400 }
      );
    }

    const payload = await getPublicTrackingSessionPayloadByToken(
      supabaseAdmin,
      token
    );

    if (!payload) {
      return NextResponse.json(
        { ok: false, message: "Sessão não encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      session: payload,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro interno do servidor.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}