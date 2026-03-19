import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ token: string; stopId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token, stopId } = await context.params;
    const body = await request.json();
    const code = String(body?.code ?? "").trim();

    if (!code) {
      return NextResponse.json(
        { ok: false, message: "Código de confirmação obrigatório." },
        { status: 400 }
      );
    }

    // Busca a rota pelo token
    const { data: route, error: routeError } = await supabaseAdmin
      .from("delivery_routes")
      .select("id, status")
      .eq("tracking_token", token)
      .single();

    if (routeError || !route) {
      return NextResponse.json(
        { ok: false, message: "Rota não encontrada." },
        { status: 404 }
      );
    }

    // Busca a parada
    const { data: stop, error: stopError } = await supabaseAdmin
      .from("delivery_route_stops")
      .select("*")
      .eq("id", stopId)
      .eq("route_id", route.id)
      .single();

    if (stopError || !stop) {
      return NextResponse.json(
        { ok: false, message: "Parada não encontrada." },
        { status: 404 }
      );
    }

    if (stop.status === "CONFIRMADO") {
      return NextResponse.json(
        { ok: false, message: "Esta parada já foi confirmada." },
        { status: 400 }
      );
    }

    // Verifica se é a parada atual (não pode confirmar uma parada futura)
    const { data: allStops } = await supabaseAdmin
      .from("delivery_route_stops")
      .select("id, stop_order, status")
      .eq("route_id", route.id)
      .order("stop_order", { ascending: true });

    const currentStop = (allStops ?? []).find((s: any) => s.status === "PENDENTE");

    if (!currentStop || currentStop.id !== stopId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Você precisa confirmar as paradas em ordem. Conclua a parada atual primeiro.",
        },
        { status: 400 }
      );
    }

    // Verifica expiração
    if (stop.confirmation_code_expires_at) {
      const expires = new Date(stop.confirmation_code_expires_at);
      if (expires < new Date()) {
        return NextResponse.json(
          { ok: false, message: "O código de confirmação expirou." },
          { status: 400 }
        );
      }
    }

    // Incrementa tentativas
    const newAttempts = (stop.attempts ?? 0) + 1;
    const maxAttempts = 5;

    if (newAttempts > maxAttempts) {
      return NextResponse.json(
        { ok: false, message: "Número máximo de tentativas atingido." },
        { status: 400 }
      );
    }

    // Verifica o código
    if (stop.confirmation_code !== code) {
      await supabaseAdmin
        .from("delivery_route_stops")
        .update({ attempts: newAttempts })
        .eq("id", stopId);

      return NextResponse.json(
        {
          ok: false,
          message: `Código incorreto. Tentativa ${newAttempts} de ${maxAttempts}.`,
          attempts: newAttempts,
          maxAttempts,
        },
        { status: 400 }
      );
    }

    // Código correto — confirma a parada
    const now = new Date().toISOString();

    await supabaseAdmin
      .from("delivery_route_stops")
      .update({
        status: "CONFIRMADO",
        confirmed_at: now,
        confirmed_by: "motorista",
        attempts: newAttempts,
      })
      .eq("id", stopId);

    // Atualiza o pedido para ENTREGUE
    await supabaseAdmin
      .from("orders")
      .update({
        logistic_status: "ENTREGUE",
        delivery_status: "ENTREGUE",
        delivery_finished_at: now,
      })
      .eq("id", stop.order_id);

    // Verifica se todas as paradas foram confirmadas
    const { data: updatedStops } = await supabaseAdmin
      .from("delivery_route_stops")
      .select("status")
      .eq("route_id", route.id);

    const allConfirmed = (updatedStops ?? []).every((s: any) => s.status === "CONFIRMADO");

    if (allConfirmed) {
      // Finaliza a rota
      await supabaseAdmin
        .from("delivery_routes")
        .update({ status: "CONCLUIDA", finished_at: now })
        .eq("id", route.id);
    }

    return NextResponse.json({
      ok: true,
      message: allConfirmed
        ? "Parada confirmada. Rota concluída! Todas as entregas foram realizadas."
        : "Parada confirmada. Siga para a próxima entrega.",
      routeFinished: allConfirmed,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro interno." },
      { status: 500 }
    );
  }
}