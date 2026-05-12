import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  // Tabelas filhas que referenciam orders.id — deletar antes do pedido
  const steps: { table: string; column: string }[] = [
    { table: "delivery_confirmations", column: "order_id" },
    { table: "delivery_tracking_sessions", column: "order_id" },
    { table: "focus_nfe_documents", column: "order_id" },
    { table: "product_st_consumptions", column: "order_id" },
    { table: "order_payments", column: "order_id" },
    { table: "order_items", column: "order_id" },
  ];

  for (const { table, column } of steps) {
    const { error } = await supabaseAdmin
      .from(table)
      .delete()
      .eq(column, id);

    if (error && error.code !== "PGRST116") {
      return NextResponse.json(
        { error: `Erro ao excluir ${table}: ${error.message}` },
        { status: 500 }
      );
    }
  }

  // Desvincula pedidos filhos que referenciam este como parent
  const { error: unlinkError } = await supabaseAdmin
    .from("orders")
    .update({ parent_order_id: null })
    .eq("parent_order_id", id);

  if (unlinkError) {
    return NextResponse.json(
      { error: `Erro ao desvincular pedidos filhos: ${unlinkError.message}` },
      { status: 500 }
    );
  }

  const { error } = await supabaseAdmin.from("orders").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: `Erro ao excluir pedido: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
