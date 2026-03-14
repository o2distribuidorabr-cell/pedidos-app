import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { updateOrderDeliveryFields } from "@/lib/delivery";

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

    await updateOrderDeliveryFields(supabaseAdmin, {
      orderId: id,
      driverName: body.driverName?.trim() || null,
      driverPhone: body.driverPhone?.trim() || null,
      deliveryNotes: body.deliveryNotes?.trim() || null,
    });

    return NextResponse.json({
      ok: true,
      message: "Dados do motorista atualizados com sucesso.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao salvar motorista.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}