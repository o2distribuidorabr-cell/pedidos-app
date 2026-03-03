import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Body = {
  orderId: string;
  storeId: string;
  gateway: "MP" | "ASAAS";
  paymentId: string;
  status?: string | null;
  amount?: number | null;
  qrCode?: string | null;
  qrCodeBase64?: string | null;
  expiresAt?: string | null;
  invoiceUrl?: string | null;
  externalReference?: string | null;
  rawResponse?: any;
};

function clean(v: unknown) {
  const s = String(v ?? "").trim();
  return s || null;
}

function toNumberOrNull(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Variáveis do Supabase não configuradas no servidor." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as Body;

    const orderId = clean(body.orderId);
    const storeId = clean(body.storeId);
    const gateway = clean(body.gateway) as "MP" | "ASAAS" | null;
    const paymentId = clean(body.paymentId);

    if (!orderId) {
      return NextResponse.json({ error: "orderId é obrigatório." }, { status: 400 });
    }
    if (!storeId) {
      return NextResponse.json({ error: "storeId é obrigatório." }, { status: 400 });
    }
    if (!gateway || (gateway !== "MP" && gateway !== "ASAAS")) {
      return NextResponse.json({ error: "gateway inválido." }, { status: 400 });
    }
    if (!paymentId) {
      return NextResponse.json({ error: "paymentId é obrigatório." }, { status: 400 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const payload = {
      order_id: orderId,
      store_id: storeId,
      gateway,
      payment_id: paymentId,
      status: clean(body.status),
      amount: toNumberOrNull(body.amount),
      qr_code: clean(body.qrCode),
      qr_code_base64: clean(body.qrCodeBase64),
      expires_at: clean(body.expiresAt),
      invoice_url: clean(body.invoiceUrl),
      external_reference: clean(body.externalReference),
      raw_response: body.rawResponse ?? null,
    };

    const { data, error } = await admin
      .from("order_payments")
      .upsert(payload, { onConflict: "gateway,payment_id" })
      .select("id,order_id,store_id,gateway,payment_id,status,amount,created_at,updated_at")
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Erro ao gravar payment log.", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      paymentLog: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Erro interno ao gravar payment log.",
        details: String(error?.message || error),
      },
      { status: 500 }
    );
  }
}