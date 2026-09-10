/**
 * app/api/santander/reconcile/route.ts
 *
 * Rede de segurança da confirmação de pagamento PIX Santander (que, ao
 * contrário de Asaas/MP, não tinha webhook). Varre pedidos com
 * santander_txid ainda não pagos e reconsulta cada cobrança na API do
 * Santander; se estiver CONCLUIDA, dá baixa (mesma lógica do webhook).
 *
 * Protegido por Bearer INTERNAL_TRIGGER_SECRET (mesmo padrão das outras
 * rotas internas). Idempotente: pedido já pago é ignorado.
 *
 * Body (opcional):
 *   { days?: number (default 30, máx 180),
 *     limit?: number (default 200, máx 500),
 *     orderId?: string  // concilia só esse pedido, ignora days }
 */

import { NextRequest, NextResponse } from "next/server";
import { buildHttpsAgent, getAdminSupabase, getToken, reconcileTxid } from "@/lib/santanderPix";

export const runtime = "nodejs";

function autorizado(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  return !!process.env.INTERNAL_TRIGGER_SECRET && auth === `Bearer ${process.env.INTERNAL_TRIGGER_SECRET}`;
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as any));
  const days = Math.min(180, Math.max(1, Number(body?.days) || 30));
  const limit = Math.min(500, Math.max(1, Number(body?.limit) || 200));
  const onlyOrderId = String(body?.orderId || "").trim();

  const supabase = getAdminSupabase();

  let q = supabase
    .from("orders")
    .select("id,store_id,santander_txid,is_paid,created_at")
    .not("santander_txid", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (onlyOrderId) {
    q = q.eq("id", onlyOrderId);
  } else {
    q = q.or("is_paid.is.null,is_paid.eq.false");
    q = q.gte("created_at", new Date(Date.now() - days * 86400000).toISOString());
  }

  const { data: orders, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!orders || orders.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, paid: 0, results: [] });
  }

  let agent: Awaited<ReturnType<typeof buildHttpsAgent>>;
  let token: string;
  try {
    agent = await buildHttpsAgent();
    token = await getToken(agent);
  } catch (e: any) {
    return NextResponse.json({ error: `setup Santander falhou: ${String(e?.message || e)}` }, { status: 500 });
  }

  const results: any[] = [];
  let paid = 0;

  for (const o of orders as any[]) {
    const txid = String(o.santander_txid || "").trim();
    if (!txid) continue;
    try {
      const r = await reconcileTxid({
        supabase,
        agent,
        token,
        txid,
        order: { id: o.id, store_id: o.store_id ?? null },
      });
      if (r.paid && !r.alreadyPaid) paid++;
      results.push({ ...r, ok: true });
    } catch (e: any) {
      results.push({ txid, orderId: o.id, ok: false, reason: String(e?.message || e) });
    }
  }

  return NextResponse.json({ ok: true, checked: results.length, paid, results });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/santander/reconcile",
    method: "POST",
    auth: "Authorization: Bearer <INTERNAL_TRIGGER_SECRET>",
  });
}
