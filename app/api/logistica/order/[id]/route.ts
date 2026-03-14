import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getOrderDeliveryOverview } from "@/lib/delivery";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function getStoreName(store: Record<string, unknown> | null): string {
  if (!store) return "Sem loja";

  const possibleKeys = [
    "name",
    "title",
    "store",
    "loja",
    "fantasy_name",
    "display_name",
    "label",
    "description",
    "codigo",
    "code",
  ];

  for (const key of possibleKeys) {
    const value = store[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return typeof store.id === "string" ? store.id : "Sem loja";
}

export async function GET(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (orderError) {
      return NextResponse.json(
        { ok: false, message: orderError.message },
        { status: 400 }
      );
    }

    if (!order) {
      return NextResponse.json(
        { ok: false, message: "Pedido não encontrado." },
        { status: 404 }
      );
    }

    const overview = await getOrderDeliveryOverview(supabaseAdmin, id);

    const { data: confirmation } = await supabaseAdmin
      .from("delivery_confirmations")
      .select("confirmation_code")
      .eq("order_id", id)
      .maybeSingle();

    let store: Record<string, unknown> | null = null;
    let storeLabel = "Sem loja";

    if (order.store_id) {
      const { data: storeData } = await supabaseAdmin
        .from("stores")
        .select("*")
        .eq("id", order.store_id)
        .maybeSingle();

      store = (storeData as Record<string, unknown> | null) ?? null;
      storeLabel = getStoreName(store);
    }

    return NextResponse.json({
      ok: true,
      order,
      overview,
      store,
      storeLabel,
      confirmationCode: confirmation?.confirmation_code ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro interno do servidor.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}