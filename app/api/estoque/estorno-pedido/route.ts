import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ ok: false, error: "orderId obrigatório" }, { status: 400 });

    const admin = getAdmin();

    // Remove todos os movimentos de baixa deste pedido
    // O saldo volta ao estado anterior automaticamente (a view soma todos os movimentos)
    const { data: deleted, error } = await admin
      .from("stock_movements")
      .delete()
      .eq("order_id", orderId)
      .eq("movement_type", "ORDER_DEDUCTION")
      .select("id");

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, count: deleted?.length ?? 0 });
  } catch (err: any) {
    console.error("[estorno-pedido]", err);
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
