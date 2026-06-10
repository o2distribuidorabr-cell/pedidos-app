import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// Calcula custo médio ponderado atual de um produto
async function getAvgCost(admin: ReturnType<typeof getAdmin>, productId: string): Promise<number> {
  const { data } = await admin
    .from("v_stock_balance")
    .select("avg_cost")
    .eq("product_id", productId)
    .maybeSingle();
  return Number(data?.avg_cost ?? 0);
}

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ ok: false, error: "orderId obrigatório" }, { status: 400 });

    const admin = getAdmin();

    // Verifica se já houve baixa para este pedido
    const { data: existing } = await admin
      .from("stock_movements")
      .select("id")
      .eq("order_id", orderId)
      .eq("movement_type", "ORDER_DEDUCTION")
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, skipped: true, message: "Baixa já registrada para este pedido." });
    }

    // Busca itens do pedido
    const { data: items, error: itemsErr } = await admin
      .from("order_items")
      .select("product_id, qty, unit_cost, products(track_stock)")
      .eq("order_id", orderId);

    if (itemsErr) throw new Error(itemsErr.message);
    if (!items || items.length === 0) {
      return NextResponse.json({ ok: true, skipped: true, message: "Pedido sem itens." });
    }

    // Cria movimento de saída para cada produto
    const movements = [];
    for (const item of items) {
      if (!item.product_id || !item.qty) continue;
      // Ignora produtos não controlados no estoque
      if ((item as any).products?.track_stock === false) continue;
      const avgCost = await getAvgCost(admin, item.product_id);
      movements.push({
        product_id: item.product_id,
        movement_type: "ORDER_DEDUCTION",
        quantity: -Math.abs(Number(item.qty)),
        unit_cost: avgCost,
        unit_revenue: Number(item.unit_cost ?? 0),
        order_id: orderId,
        notes: `Baixa automática — pedido aprovado`,
      });
    }

    if (movements.length > 0) {
      const { error: mvErr } = await admin.from("stock_movements").insert(movements);
      if (mvErr) throw new Error(mvErr.message);
    }

    return NextResponse.json({ ok: true, count: movements.length });
  } catch (err: any) {
    console.error("[baixa-pedido]", err);
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
