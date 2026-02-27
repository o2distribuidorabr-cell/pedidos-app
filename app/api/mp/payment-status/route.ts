import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json({ error: "MERCADOPAGO_ACCESS_TOKEN não configurado" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const paymentId = String(searchParams.get("paymentId") ?? "").trim();

    if (!paymentId) {
      return NextResponse.json({ error: "paymentId é obrigatório" }, { status: 400 });
    }

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

    return NextResponse.json({
      paymentId: String(data?.id ?? paymentId),
      status: data?.status ?? null, // approved | pending | rejected | cancelled...
      status_detail: data?.status_detail ?? null,
      transaction_amount: data?.transaction_amount ?? null,
      date_approved: data?.date_approved ?? null,
      date_last_updated: data?.date_last_updated ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro interno", details: String(e?.message ?? e) }, { status: 500 });
  }
}