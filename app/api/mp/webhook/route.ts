import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function safeEq(a: string, b: string) {
  const aa = Buffer.from(a || "", "utf8");
  const bb = Buffer.from(b || "", "utf8");
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function verifySignature(req: Request, rawBody: string, secret: string) {
  const xSignature = req.headers.get("x-signature") || "";
  const xRequestId = req.headers.get("x-request-id") || "";

  // Se não vier assinatura, não bloqueia (evita travar).
  if (!xSignature || !xRequestId) return true;

  const parts = Object.fromEntries(
    xSignature.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim(), v?.trim()];
    })
  );

  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return true;

  const payload = `${ts}.${xRequestId}.${rawBody}`;
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return safeEq(hmac, v1);
}

export async function POST(req: Request) {
  try {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!accessToken) return NextResponse.json({ error: "MERCADOPAGO_ACCESS_TOKEN não configurado" }, { status: 500 });
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Env do Supabase ausentes: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const rawBody = await req.text();
    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET || "";

    if (secret) {
      const ok = verifySignature(req, rawBody, secret);
      if (!ok) return NextResponse.json({ error: "Assinatura do webhook inválida" }, { status: 401 });
    }

    let payload: any = null;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = null;
    }

    const paymentId = String(payload?.data?.id ?? payload?.id ?? payload?.resource ?? "").trim();
    if (!paymentId) return NextResponse.json({ ok: true, ignored: true, reason: "Sem paymentId" });

    // Buscar detalhes do pagamento no MP
    const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const mpData = await mpResp.json();
    if (!mpResp.ok) {
      return NextResponse.json({ ok: true, ignored: true, reason: "MP lookup failed", details: mpData });
    }

    const status = String(mpData?.status ?? "");
    const externalRef = String(mpData?.external_reference ?? "").trim(); // orderId
    const dateApproved = mpData?.date_approved ?? null;
    const transactionAmount = Number(mpData?.transaction_amount ?? 0) || 0;

    if (!externalRef) {
      return NextResponse.json({ ok: true, ignored: true, reason: "Sem external_reference", status });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    if (status === "approved") {
      const paidAtISO = dateApproved ? new Date(dateApproved).toISOString() : new Date().toISOString();

      const { error: upErr } = await supabase
        .from("orders")
        .update({
          is_paid: true,
          paid_at: paidAtISO,
          payment_method: "PIX",

          // ✅ NOVO: grava o valor realmente pago no MP (com juros/multa)
          paid_amount: transactionAmount > 0 ? transactionAmount : null,

          // ✅ opcional: salva id do pagamento
          mp_payment_id: String(paymentId),
        })
        .eq("id", externalRef);

      if (upErr) {
        return NextResponse.json({ ok: true, updated: false, reason: "Supabase update error", details: upErr.message });
      }

      return NextResponse.json({ ok: true, updated: true, orderId: externalRef, paymentId: String(paymentId), status, paid_amount: transactionAmount });
    }

    return NextResponse.json({ ok: true, updated: false, orderId: externalRef, paymentId: String(paymentId), status });
  } catch (e: any) {
    return NextResponse.json({ ok: true, error: "Erro interno", details: String(e?.message ?? e) }, { status: 200 });
  }
}