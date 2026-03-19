import { NextRequest, NextResponse } from "next/server";
import { getLalamoveConfig, lalamoveFetch } from "@/lib/lalamove";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    providerOrderId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { providerOrderId } = await context.params;

    if (!providerOrderId) {
      return NextResponse.json(
        { error: "providerOrderId é obrigatório." },
        { status: 400 }
      );
    }

    // A Lalamove cancela com DELETE /v3/orders/{id} — sem body, sem /cancel no path
    const result = await lalamoveFetch<any>({
      path: `/v3/orders/${providerOrderId}`,
      method: "DELETE",
      market: getLalamoveConfig().market,
    });

    await supabaseAdmin
      .from("order_shipments")
      .update({
        provider_status: "CANCELED",
        provider_event_type: "CANCELED",
        last_webhook_payload: result.data,
        updated_at: new Date().toISOString(),
      })
      .eq("provider", "LALAMOVE")
      .eq("provider_order_id", providerOrderId);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao cancelar pedido Lalamove.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
