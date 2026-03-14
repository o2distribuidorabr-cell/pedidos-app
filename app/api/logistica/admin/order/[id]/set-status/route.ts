import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { updateOrderDeliveryFields } from "@/lib/delivery";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type BodyPayload = {
  deliveryStatus?: string;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as BodyPayload;

    if (
      !body.deliveryStatus ||
      ![
        "PENDENTE",
        "EM_SEPARACAO",
        "SAIU_PARA_ENTREGA",
        "ENTREGUE",
        "OCORRENCIA",
      ].includes(body.deliveryStatus)
    ) {
      return NextResponse.json(
        { ok: false, message: "Status logístico inválido." },
        { status: 400 }
      );
    }

    await updateOrderDeliveryFields(supabaseAdmin, {
      orderId: id,
      deliveryStatus: body.deliveryStatus as
        | "PENDENTE"
        | "EM_SEPARACAO"
        | "SAIU_PARA_ENTREGA"
        | "ENTREGUE"
        | "OCORRENCIA",
    });

    return NextResponse.json({
      ok: true,
      message: "Status atualizado com sucesso.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao atualizar status.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}