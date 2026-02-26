import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

async function fetchPayment(paymentId: string) {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN!;
  const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Erro ao consultar pagamento MP: ${JSON.stringify(data)}`);
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

    // MP manda algo como { action, api_version, data: { id }, type }
    const body = await req.json();
    const paymentId = body?.data?.id ? String(body.data.id) : null;

    if (!paymentId) return NextResponse.json({ ok: true, ignored: true }, { status: 200 });

    // Busca pagamento completo
    const payment = await fetchPayment(paymentId);

    const status: string = payment?.status; // approved/pending/rejected...
    const orderId: string | null = payment?.external_reference ?? null;
    const paidAt: string | null = payment?.date_approved ?? null;

    if (!orderId) return NextResponse.json({ ok: true, ignored: true, reason: "Sem external_reference" }, { status: 200 });

    const supabase = createClient(supabaseUrl, serviceKey);

    const isPaid = status === "approved";

    // Atualiza o pedido
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

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    // webhook: responda 200 para não ficar em retry infinito
    return NextResponse.json({ ok: true, error: String(e?.message ?? e) }, { status: 200 });
  }
}