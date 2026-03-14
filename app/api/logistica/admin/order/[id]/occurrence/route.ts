import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { markOrderDeliveryOccurrence } from "@/lib/delivery";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type BodyPayload = {
  notes?: string;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as BodyPayload;

    if (!body.notes?.trim()) {
      return NextResponse.json(
        { ok: false, message: "Informe a observação da ocorrência." },
        { status: 400 }
      );
    }

    await markOrderDeliveryOccurrence(supabaseAdmin, {
      orderId: id,
      notes: body.notes.trim(),
    });

    return NextResponse.json({
      ok: true,
      message: "Ocorrência registrada com sucesso.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao registrar ocorrência.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}