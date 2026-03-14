import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recordTrackingPointByToken } from "@/lib/deliveryTracking";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

type BodyPayload = {
  lat?: number;
  lng?: number;
  accuracy?: number | null;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;

    if (!token) {
      return NextResponse.json(
        { ok: false, message: "Token não informado." },
        { status: 400 }
      );
    }

    const body = (await request.json()) as BodyPayload;

    if (typeof body.lat !== "number" || typeof body.lng !== "number") {
      return NextResponse.json(
        { ok: false, message: "Latitude e longitude são obrigatórias." },
        { status: 400 }
      );
    }

    const session = await recordTrackingPointByToken(supabaseAdmin, {
      token,
      lat: body.lat,
      lng: body.lng,
      accuracy: body.accuracy ?? null,
    });

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