import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!accessToken) {
      return NextResponse.json({ error: "MERCADOPAGO_ACCESS_TOKEN não configurado" }, { status: 500 });
    }
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Env do Supabase ausentes: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const paymentId = String(searchParams.get("paymentId") ?? "").trim();

    if (!paymentId) {
      return NextResponse.json({ error: "paymentId é obrigatório" }, { status: 400 });
    }

    // 1) Consulta MP
    const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const data = await resp.json();

    if (!resp.ok) {
      return NextResponse.json({ error: "Erro ao consultar pagamento no Mercado Pago", details: data }, { status: resp.status });
    }

    const mpStatus = String(data?.status ?? "");
    const mpDetail = String(data?.status_detail ?? "");

    // 2) Busca expiração local no pedido (se existir)
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: ord, error: oErr } = await supabase
      .from("orders")
      .select("id,pix_expires_at,is_paid")
      .eq("mp_payment_id", paymentId)
      .maybeSingle();

    // se não achar pedido, só devolve MP mesmo (não quebra)
    if (oErr) {
      return NextResponse.json({
        paymentId: String(data?.id ?? paymentId),
        status: mpStatus || null,
        status_detail: mpDetail || null,
        transaction_amount: data?.transaction_amount ?? null,
        date_approved: data?.date_approved ?? null,
        date_last_updated: data?.date_last_updated ?? null,
      });
    }

    const expiresAt = (ord as any)?.pix_expires_at ? String((ord as any).pix_expires_at) : null;
    const expiredLocal = expiresAt ? Date.now() > new Date(expiresAt).getTime() : false;

    // ✅ Se expirou localmente e MP ainda não aprovou, força status "expired"
    if (expiredLocal && mpStatus !== "approved") {
      return NextResponse.json({
        paymentId: String(data?.id ?? paymentId),
        status: "expired",
        status_detail: "local_expired",
        expiresAt,
        transaction_amount: data?.transaction_amount ?? null,
        date_approved: data?.date_approved ?? null,
        date_last_updated: data?.date_last_updated ?? null,
      });
    }

    // (opcional) atualiza status no pedido para acompanhamento
    // não falha o request se der erro
    if ((ord as any)?.id) {
      supabase
        .from("orders")
        .update({ mp_status: mpStatus || null })
        .eq("id", (ord as any).id)
        .then(() => {});
    }

    return NextResponse.json({
      paymentId: String(data?.id ?? paymentId),
      status: mpStatus || null,
      status_detail: mpDetail || null,
      expiresAt,
      transaction_amount: data?.transaction_amount ?? null,
      date_approved: data?.date_approved ?? null,
      date_last_updated: data?.date_last_updated ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro interno", details: String(e?.message ?? e) }, { status: 500 });
  }
}