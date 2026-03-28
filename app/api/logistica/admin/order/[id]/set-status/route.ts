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

// Mapeia o status logístico da tabela orders para o delivery_status interno
function mapLogisticToDelivery(status: string): "PENDENTE" | "EM_SEPARACAO" | "SAIU_PARA_ENTREGA" | "ENTREGUE" | "OCORRENCIA" | null {
  if (status === "RECEBIDO" || status === "PENDENTE") return "PENDENTE";
  if (status === "EM_SEPARACAO") return "EM_SEPARACAO";
  if (status === "SAIU_PARA_ENTREGA") return "SAIU_PARA_ENTREGA";
  if (status === "ENTREGUE") return "ENTREGUE";
  if (status === "OCORRENCIA") return "OCORRENCIA";
  return null;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as BodyPayload;

    const validStatuses = ["RECEBIDO", "PENDENTE", "EM_SEPARACAO", "SAIU_PARA_ENTREGA", "ENTREGUE", "OCORRENCIA"];

    if (!body.deliveryStatus || !validStatuses.includes(body.deliveryStatus)) {
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

    // Bloqueia alteração se a Lalamove já marcou a corrida como concluída
    const { data: shipment } = await supabaseAdmin
      .from("order_shipments")
      .select("provider_status")
      .eq("local_order_id", id)
      .eq("provider", "LALAMOVE")
      .maybeSingle();

    if (shipment?.provider_status) {
      const lalamoveStatus = String(shipment.provider_status).toUpperCase();
      const isCompleted = ["COMPLETED", "DELIVERED", "FULFILLED"].some(s => lalamoveStatus.includes(s));

      // Bloqueia alteração manual quando Lalamove concluiu — EXCETO se for para marcar como ENTREGUE
      // (o sync automático precisa poder marcar ENTREGUE quando Lalamove retorna COMPLETED)
      if (isCompleted && body.deliveryStatus !== "ENTREGUE") {
        return NextResponse.json(
          {
            ok: false,
            message: `Esta corrida foi concluída pela Lalamove (status: ${shipment.provider_status}). O status não pode mais ser alterado manualmente.`,
            blocked: true,
          },
          { status: 403 }
        );
      }
    }

    const deliveryStatus = mapLogisticToDelivery(body.deliveryStatus);
    if (!deliveryStatus) {
      return NextResponse.json(
        { ok: false, message: "Status inválido." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    await updateOrderDeliveryFields(supabaseAdmin, {
      orderId: id,
      deliveryStatus,
      deliveryFinishedAt: deliveryStatus === "ENTREGUE" ? now : null,
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