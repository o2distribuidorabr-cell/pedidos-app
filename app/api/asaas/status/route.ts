import { NextResponse } from "next/server";

export const runtime = "nodejs";

function getAsaasBaseUrl() {
  const env = (process.env.ASAAS_ENV || "sandbox").toLowerCase();
  return env === "production"
    ? "https://api.asaas.com"
    : "https://sandbox.asaas.com/api";
}

function cleanValue(value?: string | null) {
  const v = String(value || "").trim();
  return v || "";
}

async function asaasFetch(path: string, init?: RequestInit) {
  const apiKey = process.env.ASAAS_API_KEY;
  const userAgent = process.env.ASAAS_USER_AGENT || "o2-pedidos";
  const baseUrl = getAsaasBaseUrl();

  if (!apiKey) {
    throw new Error("ASAAS_API_KEY não configurado");
  }

  const resp = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      access_token: apiKey,
      "User-Agent": userAgent,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const text = await resp.text();
  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return { resp, data, baseUrl };
}

async function getPaymentStatus(paymentId: string) {
  const cleanedPaymentId = cleanValue(paymentId);

  if (!cleanedPaymentId) {
    throw new Error("paymentId é obrigatório");
  }

  const statusResult = await asaasFetch(
    `/v3/payments/${encodeURIComponent(cleanedPaymentId)}/status`,
    { method: "GET" }
  );

  if (!statusResult.resp.ok) {
    throw new Error(
      `Erro ao consultar status no Asaas: ${JSON.stringify(statusResult.data)}`
    );
  }

  const paymentResult = await asaasFetch(
    `/v3/payments/${encodeURIComponent(cleanedPaymentId)}`,
    { method: "GET" }
  );

  if (!paymentResult.resp.ok) {
    throw new Error(
      `Status consultado, mas houve erro ao buscar detalhes do pagamento: ${JSON.stringify(
        paymentResult.data
      )}`
    );
  }

  const statusData = statusResult.data || {};
  const paymentData = paymentResult.data || {};

  return {
    ok: true,
    gateway: "asaas",
    sandbox: (process.env.ASAAS_ENV || "sandbox").toLowerCase() !== "production",
    paymentId: cleanedPaymentId,
    status: statusData.status || paymentData.status || null,
    payment: {
      id: paymentData.id || cleanedPaymentId,
      status: paymentData.status || statusData.status || null,
      billingType: paymentData.billingType || null,
      value: paymentData.value ?? null,
      netValue: paymentData.netValue ?? null,
      dueDate: paymentData.dueDate || null,
      paymentDate: paymentData.paymentDate || null,
      clientPaymentDate: paymentData.clientPaymentDate || null,
      description: paymentData.description || null,
      externalReference: paymentData.externalReference || null,
      customer: paymentData.customer || null,
      invoiceUrl: paymentData.invoiceUrl || null,
      bankSlipUrl: paymentData.bankSlipUrl || null,
      dateCreated: paymentData.dateCreated || null,
      deleted: paymentData.deleted ?? null,
    },
    raw: {
      status: statusData,
      payment: paymentData,
    },
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const paymentId = cleanValue(searchParams.get("paymentId"));

    if (!paymentId) {
      return NextResponse.json(
        {
          error: "paymentId é obrigatório",
          example:
            "/api/asaas/status?paymentId=pay_reg9bxb5q1gwrv2z",
        },
        { status: 400 }
      );
    }

    const result = await getPaymentStatus(paymentId);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Erro ao consultar status do pagamento no Asaas",
        details: String(error?.message || error),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const paymentId = cleanValue(body?.paymentId);

    if (!paymentId) {
      return NextResponse.json(
        { error: "paymentId é obrigatório" },
        { status: 400 }
      );
    }

    const result = await getPaymentStatus(paymentId);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Erro ao consultar status do pagamento no Asaas",
        details: String(error?.message || error),
      },
      { status: 500 }
    );
  }
}