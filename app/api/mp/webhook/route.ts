import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────────────────────────────────────────
// Webhook do Mercado Pago — PIX apenas
// Conta: o2distribuidora (token: MERCADOPAGO_ACCESS_TOKEN)
//
// Pagamentos de cartão de crédito (conta smartpay) usam /api/mp/cc-webhook.
// ──────────────────────────────────────────────────────────────────────────────

async function fetchPayment(paymentId: string) {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN!;
  const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Erro ao consultar pagamento MP (PIX): ${JSON.stringify(data)}`);
  return data;
}

export async function POST(req: Request) {
  try {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!accessToken) return NextResponse.json({ ok: true, error: "Sem MERCADOPAGO_ACCESS_TOKEN" }, { status: 200 });
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ ok: true, error: "Sem SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL" }, { status: 200 });
    }

    // MP envia { action, api_version, data: { id }, type }
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

    if (!paymentId) return NextResponse.json({ ok: true, ignored: true }, { status: 200 });

    // Busca pagamento completo usando token da o2distribuidora (PIX)
    const payment = await fetchPayment(paymentId);

    const status: string = payment?.status;
    const orderId: string | null = payment?.external_reference ?? null;
    const paidAt: string | null = payment?.date_approved ?? null;

    if (!orderId) return NextResponse.json({ ok: true, ignored: true, reason: "Sem external_reference" }, { status: 200 });

    const supabase = createClient(supabaseUrl, serviceKey);

    const isPaid = status === "approved";

    // Atualiza o pedido (PIX — comportamento original)
    const { error } = await supabase
      .from("orders")
      .update({
        is_paid: isPaid,
        paid_at: isPaid ? paidAt : null,
        payment_method: "PIX",
        mp_payment_id: paymentId,
        mp_status: status,
      })
      .eq("id", orderId);

    if (error) {
      return NextResponse.json({ ok: true, error: error.message }, { status: 200 });
    }

    return NextResponse.json({ ok: true, action: "pix_updated", orderId, paymentId, status });
  } catch (e: any) {
    // Webhook sempre responde 200 para evitar retry infinito
    return NextResponse.json({ ok: true, error: String(e?.message ?? e) }, { status: 200 });
  }
}

// Útil para validação de URL pelo painel do MP
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/mp/webhook", account: "o2distribuidora" });
}
