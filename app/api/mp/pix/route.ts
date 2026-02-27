import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Body = {
  orderId: string;
  description?: string;
  payer?: { email?: string };
};

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysLateYMD(dueYmd: string) {
  const [y, m, d] = dueYmd.split("-").map(Number);
  const due = new Date(y, m - 1, d, 12, 0, 0);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  const diff = today.getTime() - due.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return Math.max(days, 0);
}

function clamp2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ✅ Idempotency agora varia com o VALOR FINAL (e outros fatores), para não reaproveitar QR antigo
function makeIdempotencyKey(input: {
  orderId: string;
  amountFinal: number;
  dueDate: string | null;
  feePct: number;
  dailyPct: number;
}) {
  const seed = [
    input.orderId,
    clamp2(input.amountFinal).toFixed(2),
    input.dueDate ?? "no_due",
    String(input.feePct),
    String(input.dailyPct),
    todayYMD(), // opcional: mantém por dia (sem impedir atualizar valor no mesmo dia)
  ].join("|");

  return crypto.createHash("sha256").update(seed).digest("hex");
}

export async function POST(req: Request) {
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

    const body = (await req.json()) as Body;

    const orderId = String(body?.orderId ?? "").trim();
    const payerEmail = String(body?.payer?.email ?? "cliente@cliente.com").trim();
    const description = String(body?.description ?? `Pedido ${orderId}`).trim();

    if (!orderId) {
      return NextResponse.json({ error: "Payload inválido: orderId é obrigatório" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 1) finance_settings
    const { data: fs, error: fsErr } = await supabase
      .from("finance_settings")
      .select("id,apply_late_charges,late_fee_percent,daily_interest_percent")
      .eq("id", 1)
      .maybeSingle();

    if (fsErr) {
      return NextResponse.json({ error: "Erro lendo finance_settings", details: fsErr.message }, { status: 500 });
    }

    const applyCharges = !!fs?.apply_late_charges;
    const feePct = Number(fs?.late_fee_percent ?? 0) || 0;
    const dailyPct = Number(fs?.daily_interest_percent ?? 0) || 0;

    // 2) order
    const { data: ord, error: ordErr } = await supabase
      .from("orders")
      .select("id,is_paid,due_date,credit_applied")
      .eq("id", orderId)
      .maybeSingle();

    if (ordErr) {
      return NextResponse.json({ error: "Erro lendo orders", details: ordErr.message }, { status: 500 });
    }
    if (!ord) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }
    if (ord.is_paid) {
      return NextResponse.json({ error: "Pedido já está pago" }, { status: 400 });
    }

    // 3) total base
    const { data: tot, error: totErr } = await supabase
      .from("v_order_totals")
      .select("order_id,total_cost")
      .eq("order_id", orderId)
      .maybeSingle();

    if (totErr) {
      return NextResponse.json({ error: "Erro lendo v_order_totals", details: totErr.message }, { status: 500 });
    }

    const totalBase = Number(tot?.total_cost ?? 0) || 0;
    const credit = Number(ord.credit_applied ?? 0) || 0;
    const aPagar = Math.max(totalBase - credit, 0);

    // 4) encargos
    const due = (ord.due_date as string | null) ?? null;
    const overdue = !!due && due < todayYMD();

    let lateDays = 0;
    let lateFee = 0;
    let lateInterest = 0;
    let amountFinal = aPagar;

    if (applyCharges && overdue && due) {
      lateDays = daysLateYMD(due);
      lateFee = aPagar * (feePct / 100);
      lateInterest = aPagar * (dailyPct / 100) * lateDays;
      amountFinal = Math.max(aPagar + lateFee + lateInterest, 0);
    }

    amountFinal = clamp2(amountFinal);

    if (amountFinal <= 0) {
      return NextResponse.json({ error: "Valor inválido para cobrança", amountFinal }, { status: 400 });
    }

    // ✅ idempotency que muda quando muda o valor
    const idempotencyKey = makeIdempotencyKey({
      orderId,
      amountFinal,
      dueDate: due,
      feePct,
      dailyPct,
    });

    const mpPayload = {
      transaction_amount: Number(amountFinal),
      description,
      payment_method_id: "pix",
      external_reference: orderId,
      payer: { email: payerEmail },
    };

    const resp = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(mpPayload),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return NextResponse.json({ error: "Erro ao criar pagamento no Mercado Pago", details: data }, { status: resp.status });
    }

    const paymentId = data?.id;
    const status = data?.status;
    const detail = data?.status_detail;
    const qrCode = data?.point_of_interaction?.transaction_data?.qr_code;
    const qrCodeBase64 = data?.point_of_interaction?.transaction_data?.qr_code_base64;

    if (!paymentId || !qrCode || !qrCodeBase64) {
      return NextResponse.json({ error: "Resposta do Mercado Pago sem dados de QR Code", raw: data }, { status: 500 });
    }

    return NextResponse.json({
      paymentId: String(paymentId),
      status,
      detail,
      qrCode,
      qrCodeBase64,
      amountUsed: amountFinal,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro interno", details: String(e?.message ?? e) }, { status: 500 });
  }
}