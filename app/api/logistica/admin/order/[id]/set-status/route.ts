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
      !["PENDENTE", "EM_SEPARACAO", "SAIU_PARA_ENTREGA", "ENTREGUE", "OCORRENCIA"].includes(
        body.deliveryStatus
      )
    ) {
      return NextResponse.json(
        { ok: false, message: "Status logístico inválido." },
        { status: 400 }
      );
    }

    // Bloqueia qualquer alteração se o pedido já foi confirmado por código
    const { data: confirmation } = await supabaseAdmin
      .from("delivery_confirmations")
      .select("status, confirmed_at, confirmed_by")
      .eq("order_id", id)
      .maybeSingle();

    if (confirmation?.status === "CONFIRMADO") {
      const when = confirmation.confirmed_at
        ? new Date(confirmation.confirmed_at).toLocaleString("pt-BR")
        : "data desconhecida";

      return NextResponse.json(
        {
          ok: false,
          message: `Este pedido foi confirmado por código de entrega em ${when}. O status não pode mais ser alterado manualmente.`,
          blocked: true,
        },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();

    await updateOrderDeliveryFields(supabaseAdmin, {
      orderId: id,
      deliveryStatus: body.deliveryStatus as
        | "PENDENTE"
        | "EM_SEPARACAO"
        | "SAIU_PARA_ENTREGA"
        | "ENTREGUE"
        | "OCORRENCIA",
      deliveryFinishedAt: body.deliveryStatus === "ENTREGUE" ? now : null,
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