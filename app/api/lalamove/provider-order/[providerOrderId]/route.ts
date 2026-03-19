import { NextRequest, NextResponse } from "next/server";
import { getLalamoveConfig, lalamoveFetch } from "@/lib/lalamove";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    providerOrderId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { providerOrderId } = await context.params;

    if (!providerOrderId) {
      return NextResponse.json(
        { error: "providerOrderId é obrigatório." },
        { status: 400 }
      );
    }

    const result = await lalamoveFetch<any>({
      path: `/v3/orders/${providerOrderId}`,
      method: "GET",
      market: getLalamoveConfig().market,
    });

    const order = result.data?.data;

    // FIX: condição corrigida — payload usa "orderId", não "orderRef"
    if (order?.orderId || order?.orderRef) {
      await supabaseAdmin
        .from("order_shipments")
        .update({
          provider_status: order?.status ?? null,
          // FIX: só sobrescreve driverId se vier preenchido, para não apagar um valor já salvo
          ...(order?.driverId ? { provider_driver_id: order.driverId } : {}),
          share_link: order?.shareLink ?? null,
          last_order_payload: result.data,
          updated_at: new Date().toISOString(),
        })
        .eq("provider", "LALAMOVE")
        .eq("provider_order_id", providerOrderId);
    }

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao consultar pedido Lalamove.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}