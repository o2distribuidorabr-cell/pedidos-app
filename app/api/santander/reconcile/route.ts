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
 * Também faz um "backfill" do selo Santander: pedidos JÁ pagos (pela tela do
 * cliente) que não têm registro em order_payments com gateway SANTANDER —
 * até agora a tela do cliente não conseguia logar Santander, então esses
 * pedidos apareciam no financeiro com a plataforma errada (Asaas antigo).
 *
 * Body (opcional):
 *   { days?: number (default 30, máx 180) — janela de pendentes,
 *     limit?: number (default 200, máx 500),
 *     backfillDays?: number (default 14, máx 90) — janela do backfill de pagos,
 *     orderId?: string  // concilia só esse pedido, ignora days/backfill }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  buildHttpsAgent,
  ensureWebhookRegistered,
  getAdminSupabase,
  getToken,
  reconcileTxid,
} from "@/lib/santanderPix";

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
  const backfillDays = Math.min(90, Math.max(1, Number(body?.backfillDays) || 14));
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

  let agent: Awaited<ReturnType<typeof buildHttpsAgent>>;
  let token: string;
  try {
    agent = await buildHttpsAgent();
    token = await getToken(agent);
  } catch (e: any) {
    return NextResponse.json({ error: `setup Santander falhou: ${String(e?.message || e)}` }, { status: 500 });
  }

  // Auto-configura o "aviso automático" do Santander (webhook) na 1ª vez que
  // conseguir. Idempotente; se falhar, a conciliação abaixo ainda cobre tudo.
  // Roda mesmo sem pedidos pendentes — é assim que o webhook se registra sozinho.
  let webhook;
  try {
    webhook = await ensureWebhookRegistered({ agent, token });
  } catch (e: any) {
    webhook = { ok: false, action: "error" as const, detail: String(e?.message || e) };
  }

  const results: any[] = [];
  let paid = 0;

  // ── Fase 1: pedidos pendentes ────────────────────────────────────────────
  for (const o of (orders ?? []) as any[]) {
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
      results.push({ ...r, ok: true, phase: "pendente" });
    } catch (e: any) {
      results.push({ txid, orderId: o.id, ok: false, phase: "pendente", reason: String(e?.message || e) });
    }
  }

  // ── Fase 2: backfill do selo Santander em pedidos já pagos sem registro ──
  let backfilled = 0;
  if (!onlyOrderId) {
    try {
      const paidSince = new Date(Date.now() - backfillDays * 86400000).toISOString();
      const { data: paidOrders } = await supabase
        .from("orders")
        .select("id,store_id,santander_txid,paid_at")
        .not("santander_txid", "is", null)
        .eq("is_paid", true)
        .gte("paid_at", paidSince)
        .order("paid_at", { ascending: false })
        .limit(200);

      const paidList = (paidOrders ?? []) as any[];
      const txids = paidList.map((o) => String(o.santander_txid || "").trim()).filter(Boolean);

      const have = new Set<string>();
      if (txids.length) {
        const { data: existing } = await supabase
          .from("order_payments")
          .select("payment_id")
          .eq("gateway", "SANTANDER")
          .in("payment_id", txids);
        for (const r of (existing ?? []) as any[]) have.add(String(r.payment_id));
      }

      for (const o of paidList) {
        const txid = String(o.santander_txid || "").trim();
        if (!txid || have.has(txid)) continue;
        try {
          const r = await reconcileTxid({
            supabase,
            agent,
            token,
            txid,
            order: { id: o.id, store_id: o.store_id ?? null },
          });
          backfilled++;
          results.push({ ...r, ok: true, phase: "backfill" });
        } catch (e: any) {
          results.push({ txid, orderId: o.id, ok: false, phase: "backfill", reason: String(e?.message || e) });
        }
      }
    } catch (e: any) {
      results.push({ ok: false, phase: "backfill", reason: String(e?.message || e) });
    }
  }

  return NextResponse.json({ ok: true, webhook, checked: results.length, paid, backfilled, results });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/santander/reconcile",
    method: "POST",
    auth: "Authorization: Bearer <INTERNAL_TRIGGER_SECRET>",
  });
}
