/**
 * app/api/orders/expire-card-pending/route.ts
 *
 * Expira pedidos de cartão que não foram pagos no prazo (15 min).
 *
 *  - Mercado Pago: o link já expira sozinho (expires=true na preferência).
 *  - Asaas: a cobrança é cancelada aqui (DELETE /v3/payments/{id}); se o Asaas
 *    recusar (ex.: já paga), o pedido NÃO é expirado.
 *
 * Para cada pedido expirado: status vira "rejected" e, se havia crédito
 * pré-pago já debitado, ele é devolvido à loja (uma única vez).
 *
 * Protegido por Bearer INTERNAL_TRIGGER_SECRET e chamado pela função agendada
 * netlify/functions/expire-card-pending.mts. Idempotente.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const PAYMENT_WINDOW_MIN = 15; // prazo do link (igual ao de /api/mp/credit-card)
const GRACE_MIN = 1; // folga p/ pagamento feito no último minuto ainda chegar
const LOOKBACK_DAYS = 3; // só mexe em pedidos recentes

function autorizado(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  return !!process.env.INTERNAL_TRIGGER_SECRET && auth === `Bearer ${process.env.INTERNAL_TRIGGER_SECRET}`;
}

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Variáveis do Supabase não configuradas.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function asaasBase() {
  return (process.env.ASAAS_ENV || "sandbox").toLowerCase() === "production"
    ? "https://api.asaas.com"
    : "https://sandbox.asaas.com/api";
}

async function asaasFetch(path: string, init?: RequestInit) {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) throw new Error("ASAAS_API_KEY não configurado");
  const resp = await fetch(`${asaasBase()}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      access_token: apiKey,
      "User-Agent": process.env.ASAAS_USER_AGENT || "o2-pedidos",
    },
    cache: "no-store",
  });
  const text = await resp.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { resp, data };
}

/** Mercado Pago: existe pagamento aprovado/em análise p/ o pedido? (então não expira) */
async function mpHasLivePayment(orderId: string): Promise<boolean> {
  const token = process.env.MERCADOPAGO_CC_ACCESS_TOKEN;
  if (!token) return true; // sem como conferir → não arrisca
  const resp = await fetch(
    `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(orderId)}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );
  if (!resp.ok) return true; // não conseguiu conferir → não arrisca
  const data = await resp.json();
  const live = ["approved", "authorized", "in_process", "pending", "in_mediation"];
  return (data?.results ?? []).some((p: any) => live.includes(String(p?.status)));
}

/** Asaas: cancela a(s) cobrança(s) do pedido. true = pode expirar. */
async function asaasCancelCharges(admin: ReturnType<typeof getAdmin>, orderId: string): Promise<boolean> {
  const { data: pays } = await admin
    .from("order_payments")
    .select("payment_id,status")
    .eq("order_id", orderId)
    .eq("gateway", "ASAAS");

  for (const p of pays ?? []) {
    const st = String(p.status || "").toUpperCase();
    if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(st)) return false; // já paga
    const { resp, data } = await asaasFetch(`/v3/payments/${encodeURIComponent(String(p.payment_id))}`, {
      method: "DELETE",
    });
    if (!resp.ok && resp.status !== 404) {
      console.error("[expire-card-pending] Asaas recusou cancelar", p.payment_id, resp.status, data);
      return false;
    }
  }
  return true;
}

/** Devolve o crédito debitado por este pedido (se houver e ainda não devolvido). */
async function refundCredit(admin: ReturnType<typeof getAdmin>, order: any): Promise<number> {
  const credit = Number(order.credit_applied || 0);
  if (credit <= 0) return 0;

  const tag = String(order.id).slice(0, 8).toUpperCase();

  // O crédito só deve voltar se de fato foi debitado (ledger: "Pedido XXXXXXXX", valor negativo).
  const { data: debit } = await admin
    .from("store_credit_ledger")
    .select("id")
    .eq("store_id", order.store_id)
    .eq("note", `Pedido ${tag}`)
    .lt("amount", 0)
    .limit(1);

  if (debit?.length) {
    const { error } = await admin.from("store_credit_ledger").insert({
      store_id: order.store_id,
      amount: credit,
      reason: "MANUAL",
      kind: "TOPUP",
      note: `Estorno de crédito — pedido ${tag} (pagamento no cartão expirado)`,
    });
    if (error) throw new Error(`Falha ao devolver crédito: ${error.message}`);
  }

  await admin.from("orders").update({ credit_applied: 0 }).eq("id", order.id);
  return debit?.length ? credit : 0;
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getAdmin();
  const now = Date.now();
  const cutoff = new Date(now - (PAYMENT_WINDOW_MIN + GRACE_MIN) * 60_000).toISOString();
  const since = new Date(now - LOOKBACK_DAYS * 86_400_000).toISOString();

  const { data: pend, error } = await admin
    .from("orders")
    .select("id,store_id,credit_applied,notes,created_at")
    .eq("status", "awaiting_payment")
    .eq("payment_method", "CARTAO")
    .eq("is_paid", false)
    .lt("created_at", cutoff)
    .gt("created_at", since)
    .limit(100);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const storeIds = [...new Set((pend ?? []).map((o: any) => o.store_id))];
  const { data: stores } = storeIds.length
    ? await admin.from("stores").select("id,credit_card_provider").in("id", storeIds)
    : { data: [] as any[] };
  const providerOf = new Map((stores ?? []).map((s: any) => [s.id, s.credit_card_provider || "ASAAS"]));

  const result = { checked: pend?.length ?? 0, expired: 0, skipped: 0, creditReturned: 0, errors: [] as string[] };

  for (const order of pend ?? []) {
    try {
      const provider = providerOf.get(order.store_id);
      const podeExpirar =
        provider === "MERCADOPAGO"
          ? !(await mpHasLivePayment(order.id))
          : await asaasCancelCharges(admin, order.id);

      if (!podeExpirar) { result.skipped++; continue; }

      // "Pega" o pedido de forma atômica: só segue quem de fato mudou o status.
      const note = "Expirado: pagamento no cartão não realizado em 15 minutos.";
      const { data: claimed } = await admin
        .from("orders")
        .update({ status: "rejected", notes: order.notes ? `${order.notes}\n${note}` : note })
        .eq("id", order.id)
        .eq("status", "awaiting_payment")
        .eq("is_paid", false)
        .select("id");
      if (!claimed?.length) { result.skipped++; continue; }

      try {
        result.creditReturned += await refundCredit(admin, order);
      } catch (e: any) {
        // Não conseguiu devolver o crédito: desfaz a expiração para tentar de novo na próxima rodada.
        await admin.from("orders").update({ status: "awaiting_payment" }).eq("id", order.id);
        throw e;
      }
      result.expired++;
    } catch (e: any) {
      result.errors.push(`${String(order.id).slice(0, 8)}: ${String(e?.message ?? e)}`);
    }
  }

  return NextResponse.json({ ok: true, ...result });
}
