import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { finalizeDeliveryByTokenAndCode } from "@/lib/delivery";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

type BodyPayload = {
  code?: string;
  confirmedBy?: string | null;
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
    const code = body.code?.trim();

    if (!code) {
      return NextResponse.json(
        { ok: false, message: "Código de confirmação é obrigatório." },
        { status: 400 }
      );
    }

    const result = await finalizeDeliveryByTokenAndCode(supabaseAdmin, {
      token,
      code,
      confirmedBy: body.confirmedBy ?? "motorista",
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          reason: result.reason,
          message: result.message,
          attempts: result.attempts,
          maxAttempts: result.maxAttempts,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro interno do servidor.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}