import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ token: string }>;
};

// GET — busca dados públicos da rota para o motorista
export async function GET(_: Request, context: RouteContext) {
  try {
    const { token } = await context.params;

    const { data: route, error } = await supabaseAdmin
      .from("delivery_routes")
      .select("*, delivery_route_stops(*)")
      .eq("tracking_token", token)
      .single();

    if (error || !route) {
      return NextResponse.json(
        { ok: false, message: "Rota não encontrada." },
        { status: 404 }
      );
    }

    // Ordena as paradas
    const stops = (route.delivery_route_stops ?? []).sort(
      (a: any, b: any) => a.stop_order - b.stop_order
    );

    // Encontra a parada atual (primeira PENDENTE)
    const currentStop = stops.find((s: any) => s.status === "PENDENTE") ?? null;
    const currentStopIndex = currentStop
      ? stops.findIndex((s: any) => s.id === currentStop.id)
      : -1;

    return NextResponse.json({
      ok: true,
      route: {
        id: route.id,
        provider: route.provider,
        status: route.status,
        driverName: route.driver_name,
        driverPhone: route.driver_phone,
        notes: route.notes,
        startedAt: route.started_at,
        finishedAt: route.finished_at,
        createdAt: route.created_at,
      },
      stops: stops.map((s: any) => ({
        id: s.id,
        orderId: s.order_id,
        stopOrder: s.stop_order,
        status: s.status,
        storeName: s.store_name,
        address: s.address,
        addressLat: s.address_lat ? Number(s.address_lat) : null,
        addressLng: s.address_lng ? Number(s.address_lng) : null,
        confirmedAt: s.confirmed_at,
        // Só mostra o código da parada ATUAL — não das próximas
        confirmationCode:
          currentStop?.id === s.id ? s.confirmation_code : null,
        codeExpiresAt:
          currentStop?.id === s.id ? s.confirmation_code_expires_at : null,
      })),
      currentStop: currentStopIndex,
      totalStops: stops.length,
      completedStops: stops.filter((s: any) => s.status === "CONFIRMADO").length,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro interno." },
      { status: 500 }
    );
  }
}

// POST — inicia a rota
export async function POST(_: Request, context: RouteContext) {
  try {
    const { token } = await context.params;

    const { data: route, error } = await supabaseAdmin
      .from("delivery_routes")
      .select("id, status")
      .eq("tracking_token", token)
      .single();

    if (error || !route) {
      return NextResponse.json(
        { ok: false, message: "Rota não encontrada." },
        { status: 404 }
      );
    }

    if (route.status === "CONCLUIDA" || route.status === "CANCELADA") {
      return NextResponse.json(
        { ok: false, message: "Esta rota já foi concluída ou cancelada." },
        { status: 400 }
      );
    }

    await supabaseAdmin
      .from("delivery_routes")
      .update({ status: "EM_ANDAMENTO", started_at: new Date().toISOString() })
      .eq("id", route.id);

    return NextResponse.json({ ok: true, message: "Rota iniciada." });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro interno." },
      { status: 500 }
    );
  }
}