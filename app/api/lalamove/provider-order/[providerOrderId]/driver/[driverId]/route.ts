import { NextRequest, NextResponse } from "next/server";
import { getLalamoveConfig, lalamoveFetch } from "@/lib/lalamove";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    providerOrderId: string;
    driverId: string;
  }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { providerOrderId, driverId } = await context.params;

    if (!providerOrderId || !driverId) {
      return NextResponse.json(
        { error: "providerOrderId e driverId são obrigatórios." },
        { status: 400 }
      );
    }

    const result = await lalamoveFetch<any>({
      path: `/v3/orders/${providerOrderId}/drivers/${driverId}`,
      method: "GET",
      market: getLalamoveConfig().market,
    });

    // Salva os dados do motorista no Supabase para o frontend exibir
    await supabaseAdmin
      .from("order_shipments")
      .update({
        provider_driver_id: driverId,
        last_driver_payload: result.data,
        updated_at: new Date().toISOString(),
      })
      .eq("provider", "LALAMOVE")
      .eq("provider_order_id", providerOrderId);

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao consultar motorista Lalamove.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}