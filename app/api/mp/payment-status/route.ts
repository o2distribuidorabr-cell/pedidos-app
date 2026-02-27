import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function normalizeStatus(mpStatus: string, mpDetail: string) {
  const st = (mpStatus || "").toLowerCase();
  const det = (mpDetail || "").toLowerCase();

  // MP normalmente usa: approved | pending | in_process | rejected | cancelled | refunded | charged_back
  if (st === "approved") return "approved";
  if (st === "rejected") return "rejected";
  if (st === "refunded" || st === "charged_back") return "refunded";
  if (st === "cancelled" || st === "canceled") return "expired"; // trata cancelado como expirado p/ UX

  // alguns detalhes podem indicar expiração
  if (det.includes("expired") || det.includes("expiration") || det.includes("due")) return "expired";

  // pending / in_process etc.
  if (st === "pending" || st === "in_process") return "pending";

  return st || "unknown";
}

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
    const normalized = normalizeStatus(mpStatus, mpDetail);

    // 2) Busca pedido vinculado para pegar expiresAt (salvo no banco)
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: ord, error: oErr } = await supabase
      .from("orders")
      .select("id,pix_expires_at,is_paid")
      .eq("mp_payment_id", paymentId)
      .maybeSingle();

    // ✅ se não achou pedido (ou deu erro), devolve MP puro
    if (oErr || !ord) {
      return NextResponse.json({
        paymentId: String(data?.id ?? paymentId),
        status: mpStatus || null,
        status_detail: mpDetail || null,
        normalized_status: normalized,
        transaction_amount: data?.transaction_amount ?? null,
        date_approved: data?.date_approved ?? null,
        date_last_updated: data?.date_last_updated ?? null,
      });
    }

    const expiresAt = ord.pix_expires_at ? String(ord.pix_expires_at) : null;

    // ✅ UX: se já passou do expiresAt e MP ainda não aprovou, trate como "expired"
    // (mesmo que MP ainda retorne pending, seu front já bloqueia e pede gerar novo)
    const expiredByTime = expiresAt ? Date.now() > new Date(expiresAt).getTime() : false;
    const shouldForceExpired = expiredByTime && normalized !== "approved";

    const finalNormalized = shouldForceExpired ? "expired" : normalized;
    const finalStatus = shouldForceExpired ? "expired" : (mpStatus || null);
    const finalDetail = shouldForceExpired ? "expired_by_time_window" : (mpDetail || null);

    // 3) Atualiza mp_status no pedido (sem travar se falhar)
    supabase
      .from("orders")
      .update({ mp_status: String(finalStatus ?? mpStatus ?? "") })
      .eq("id", ord.id)
      .then(() => {});

    return NextResponse.json({
      paymentId: String(data?.id ?? paymentId),
      status: finalStatus,
      status_detail: finalDetail,
      normalized_status: finalNormalized,
      expiresAt,
      transaction_amount: data?.transaction_amount ?? null,
      date_approved: data?.date_approved ?? null,
      date_last_updated: data?.date_last_updated ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro interno", details: String(e?.message ?? e) }, { status: 500 });
  }
}