import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────────────────────────────────────────
// Webhook exclusivo para pagamentos de cartão de crédito via Mercado Pago
// Conta: smartpay (token: MERCADOPAGO_CC_ACCESS_TOKEN)
//
// NÃO usa MERCADOPAGO_ACCESS_TOKEN (que é da o2distribuidora, conta do PIX).
// Os dois tokens são de contas diferentes e não são intercambiáveis.
// ──────────────────────────────────────────────────────────────────────────────

async function fetchPayment(paymentId: string) {
  const accessToken = process.env.MERCADOPAGO_CC_ACCESS_TOKEN;
  if (!accessToken) throw new Error("MERCADOPAGO_CC_ACCESS_TOKEN não configurado.");

  const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(`Erro ao consultar pagamento no MP (smartpay): ${JSON.stringify(data)}`);
  return data;
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!process.env.MERCADOPAGO_CC_ACCESS_TOKEN) {
      return NextResponse.json({ ok: true, error: "Sem MERCADOPAGO_CC_ACCESS_TOKEN" }, { status: 200 });
    }
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ ok: true, error: "Sem credenciais Supabase" }, { status: 200 });
    }

    // MP envia { action, data: { id }, type } ou query params
    let paymentId: string | null = null;

    try {
      const body = await req.json();
      if (body?.data?.id) paymentId = String(body.data.id);
    } catch {
      // body parse falhou — tenta query params
    }

    if (!paymentId) {
      const url = new URL(req.url);
      const qId = url.searchParams.get("data.id") || url.searchParams.get("id");
      if (qId) paymentId = qId;
    }

    if (!paymentId) {
      return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
    }

    // Busca detalhes do pagamento usando o token da conta smartpay
    const payment = await fetchPayment(paymentId);

    const status: string = payment?.status ?? "";
    const orderId: string | null = payment?.external_reference ?? null;
    const paidAt: string | null = payment?.date_approved ?? null;

    if (!orderId) {
      return NextResponse.json({ ok: true, ignored: true, reason: "Sem external_reference" }, { status: 200 });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Busca store_id do pedido
    const { data: orderRow } = await admin
      .from("orders")
      .select("store_id")
      .eq("id", orderId)
      .maybeSingle();
    const storeId: string | null = orderRow?.store_id ?? null;

    // Registra/atualiza em order_payments
    const { error: logError } = await admin
      .from("order_payments")
      .upsert(
        {
          order_id: orderId,
          store_id: storeId,
          gateway: "MERCADOPAGO",
          payment_id: paymentId,
          billing_type: "CREDIT_CARD",
          status: status.toUpperCase(),
          amount: payment?.transaction_amount ?? null,
          external_reference: orderId,
          raw_response: payment,
        },
        { onConflict: "gateway,payment_id" }
      );

    if (logError) {
      console.error("[mp/cc-webhook] Erro ao salvar order_payments:", logError.message);
    }

    // Pagamento aprovado → submete o pedido
    if (status === "approved") {
      const now = paidAt ?? new Date().toISOString();

      const { error } = await admin
        .from("orders")
        .update({
          is_paid: true,
          paid_at: now,
          paid_amount: payment?.transaction_amount ?? null,
          status: "submitted",
          submitted_at: now,
          // payment_method já está como "CARTAO" desde a criação da preferência
        })
        .eq("id", orderId)
        .in("status", ["awaiting_payment", "draft"]);

      if (error) {
        return NextResponse.json({ ok: true, error: error.message }, { status: 200 });
      }

      return NextResponse.json({
        ok: true,
        action: "credit_card_paid_and_submitted",
        gateway: "MERCADOPAGO",
        account: "smartpay",
        orderId,
        paymentId,
        status,
      });
    }

    // Outros status (pending, rejected, etc.) — apenas registrado em order_payments
    return NextResponse.json({
      ok: true,
      action: "credit_card_status_updated",
      gateway: "MERCADOPAGO",
      account: "smartpay",
      orderId,
      paymentId,
      status,
    });
  } catch (e: any) {
    // Webhook sempre responde 200 para evitar retry infinito do MP
    console.error("[mp/cc-webhook] Erro:", e?.message ?? e);
    return NextResponse.json({ ok: true, error: String(e?.message ?? e) }, { status: 200 });
  }
}

// Útil para validação de URL pelo painel do MP
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/mp/cc-webhook", account: "smartpay" });
}
