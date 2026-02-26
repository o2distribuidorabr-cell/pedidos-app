import { NextResponse } from "next/server";
import crypto from "crypto";

type Body = {
  orderId: string;
  amount: number;
  description: string;
  payer: { email: string };
};

function makeIdempotencyKey(orderId: string) {
  // chave única e estável por tentativa (pode ser sempre a mesma por pedido)
  // aqui usamos um hash do orderId + data (para evitar conflito se quiser recriar depois)
  const seed = `${orderId}-${new Date().toISOString().slice(0, 10)}`; // por dia
  return crypto.createHash("sha256").update(seed).digest("hex");
}

export async function POST(req: Request) {
  try {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

    if (!accessToken) {
      return NextResponse.json(
        { error: "MERCADOPAGO_ACCESS_TOKEN não configurado no .env.local" },
        { status: 500 }
      );
    }

    const body = (await req.json()) as Body;

    if (!body?.orderId || !body?.amount || body.amount <= 0 || !body?.payer?.email) {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    }

    const mpPayload = {
      transaction_amount: Number(body.amount),
      description: body.description,
      payment_method_id: "pix",
      external_reference: body.orderId,
      payer: { email: body.payer.email },
    };

    // ✅ O Mercado Pago está exigindo este header
    const idempotencyKey = makeIdempotencyKey(body.orderId);

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
      return NextResponse.json(
        { error: "Erro ao criar pagamento no Mercado Pago", details: data },
        { status: resp.status }
      );
    }

    const paymentId = data?.id;
    const status = data?.status;
    const detail = data?.status_detail;
    const qrCode = data?.point_of_interaction?.transaction_data?.qr_code;
    const qrCodeBase64 = data?.point_of_interaction?.transaction_data?.qr_code_base64;

    if (!paymentId || !qrCode || !qrCodeBase64) {
      return NextResponse.json(
        { error: "Resposta do Mercado Pago sem dados de QR Code", raw: data },
        { status: 500 }
      );
    }

    return NextResponse.json({
      paymentId: String(paymentId),
      status,
      detail,
      qrCode,
      qrCodeBase64,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Erro interno", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}