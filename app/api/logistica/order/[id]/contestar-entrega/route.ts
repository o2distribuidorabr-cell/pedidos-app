import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const VALID_REASONS = [
  "Não recebi o pedido",
  "Produto faltando",
  "Produto errado",
  "Quantidade divergente",
  "Produto avariado",
  "Outro motivo",
];

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Verificação de autenticação via Bearer token
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "").trim();
    if (!token) {
      return NextResponse.json(
        { ok: false, message: "Autenticação necessária." },
        { status: 401 }
      );
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, message: "Sessão inválida ou expirada." },
        { status: 401 }
      );
    }

    // Busca o store_id do franqueado logado
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("store_id")
      .eq("id", user.id)
      .maybeSingle();

    const storeId = (profile?.store_id as string | null) ?? null;
    if (!storeId) {
      return NextResponse.json(
        { ok: false, message: "Usuário não vinculado a uma loja." },
        { status: 403 }
      );
    }

    // Busca o pedido com todos os campos relevantes
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select(
        "id, store_id, logistic_status, delivery_confirmation_status, delivery_dispute_deadline"
      )
      .eq("id", id)
      .maybeSingle();

    if (!order) {
      return NextResponse.json(
        { ok: false, message: "Pedido não encontrado." },
        { status: 404 }
      );
    }

    // Franqueado só pode contestar pedido da própria loja
    if (order.store_id !== storeId) {
      return NextResponse.json(
        { ok: false, message: "Você não tem permissão para contestar este pedido." },
        { status: 403 }
      );
    }

    // Só pode contestar se o pedido estiver com logistic_status = ENTREGUE
    if (order.logistic_status !== "ENTREGUE") {
      return NextResponse.json(
        {
          ok: false,
          message: "Este pedido não está marcado como entregue. Não é possível contestar.",
        },
        { status: 400 }
      );
    }

    // Só pode contestar se ainda estiver aguardando contestação
    if (order.delivery_confirmation_status !== "AGUARDANDO_CONTESTACAO") {
      return NextResponse.json(
        {
          ok: false,
          message: "A contestação não está disponível para o estado atual deste pedido.",
        },
        { status: 400 }
      );
    }

    // Verifica prazo de 24 horas
    const deadline = order.delivery_dispute_deadline
      ? new Date(order.delivery_dispute_deadline as string)
      : null;
    if (!deadline || deadline < new Date()) {
      return NextResponse.json(
        {
          ok: false,
          message: "O prazo de 24 horas para contestação expirou. A entrega foi confirmada automaticamente.",
        },
        { status: 400 }
      );
    }

    // Valida o body
    const body = (await request.json()) as {
      reason?: string;
      notes?: string;
    };

    if (!body.reason || !VALID_REASONS.includes(body.reason)) {
      return NextResponse.json(
        { ok: false, message: "Motivo da contestação inválido." },
        { status: 400 }
      );
    }

    const notes = (body.notes ?? "").trim();

    // Grava a contestação
    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        delivery_confirmation_status: "CONTESTADA",
        delivery_disputed_at: now,
        delivery_dispute_reason: body.reason,
        delivery_dispute_notes: notes || null,
      })
      .eq("id", id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({
      ok: true,
      message: "Contestação registrada com sucesso.",
      disputedAt: now,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao registrar contestação.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
