/**
 * app/api/orders/backfill-notas-portal/route.ts
 *
 * POST — Envia pro ab-portal os pedidos que JÁ estão "saiu para entrega" ou
 * "entregue" desde antes do trigger automático existir (add_trigger_
 * saiu_para_entrega.sql só reage a transições futuras — pedidos que já
 * estavam nesse status não disparam sozinhos).
 *
 * Idempotente: a chave de acesso do XML é determinística por pedido
 * (lib/enviarNotaPortal.ts), então reprocessar um pedido que o ab-portal já
 * recebeu só devolve "DUPLICADO" — não duplica nada.
 *
 * Body: { from_date?: "YYYY-MM-DD", to_date?: "YYYY-MM-DD",
 *         status?: string[] (default ["SAIU_PARA_ENTREGA","ENTREGUE"]),
 *         limit?: number (default 200) }
 *
 * Protegido pelo mesmo segredo do trigger — é uma ação administrativa, não
 * uma rota pública.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { enviarNotaParaPortal } from "@/lib/enviarNotaPortal";

export const runtime = "nodejs";

function autorizado(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  return !!process.env.INTERNAL_TRIGGER_SECRET && authHeader === `Bearer ${process.env.INTERNAL_TRIGGER_SECRET}`;
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const status: string[] = Array.isArray(body?.status) && body.status.length
    ? body.status
    : ["SAIU_PARA_ENTREGA", "ENTREGUE"];
  const limit = Math.min(500, Math.max(1, Number(body?.limit) || 200));

  let query = supabaseAdmin
    .from("orders")
    .select("id, created_at, logistic_status")
    .in("logistic_status", status)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (body?.from_date) query = query.gte("created_at", `${body.from_date}T00:00:00`);
  if (body?.to_date) query = query.lte("created_at", `${body.to_date}T23:59:59`);

  const { data: orders, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: `Falha ao buscar pedidos: ${error.message}` }, { status: 500 });
  }
  if (!orders?.length) {
    return NextResponse.json({ ok: true, total: 0, enviados: 0, duplicados: 0, falhas: [] });
  }

  let enviados = 0;
  let duplicados = 0;
  const falhas: { order_id: string; error: string }[] = [];

  for (const order of orders) {
    const resultado = await enviarNotaParaPortal(order.id);
    if (!resultado.ok) {
      falhas.push({ order_id: order.id, error: resultado.error });
      continue;
    }
    if (resultado.status === "DUPLICADO") duplicados++;
    else enviados++;
  }

  return NextResponse.json({
    ok: true,
    total: orders.length,
    enviados,
    duplicados,
    falhas,
  });
}
