import { NextResponse } from "next/server";

export const runtime = "nodejs";

type PixBody = {
  value: number | string;
  description?: string;
  dueDate?: string; // YYYY-MM-DD
  externalReference?: string;
  customer?: {
    id?: string;
    name?: string;
    cpfCnpj?: string;
    email?: string;
    phone?: string;
    mobilePhone?: string;
    postalCode?: string;
    address?: string;
    addressNumber?: string;
    complement?: string;
    province?: string;
  };
};

function getAsaasBaseUrl() {
  const env = (process.env.ASAAS_ENV || "sandbox").toLowerCase();
  return env === "production"
    ? "https://api.asaas.com"
    : "https://sandbox.asaas.com/api";
}

function getTodayYMD() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeMoney(value: number | string) {
  const n =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/\./g, "").replace(",", "."));

  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Valor inválido para cobrança Pix.");
  }

  return Number(n.toFixed(2));
}

function onlyDigits(value?: string) {
  return String(value || "").replace(/\D/g, "").trim();
}

function cleanOptional(value?: string) {
  const v = String(value || "").trim();
  return v ? v : undefined;
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

async function findCustomerByCpfCnpj(cpfCnpj: string) {
  const query = new URLSearchParams({
    cpfCnpj,
    limit: "1",
  });

  const { resp, data } = await asaasFetch(`/v3/customers?${query.toString()}`, {
    method: "GET",
  });

  if (!resp.ok) {
    throw new Error(`Erro ao buscar cliente no Asaas: ${JSON.stringify(data)}`);
  }

  const customer = data?.data?.[0];
  return customer || null;
}

async function createCustomer(customer: NonNullable<PixBody["customer"]>) {
  const payload: Record<string, any> = {
    name: cleanOptional(customer.name),
    cpfCnpj: onlyDigits(customer.cpfCnpj),
    email: cleanOptional(customer.email),
  };

  const phone = onlyDigits(customer.phone);
  const mobilePhone = onlyDigits(customer.mobilePhone);
  const postalCode = onlyDigits(customer.postalCode);

  if (phone) payload.phone = phone;
  if (mobilePhone) payload.mobilePhone = mobilePhone;
  if (postalCode) payload.postalCode = postalCode;
  if (cleanOptional(customer.address)) payload.address = cleanOptional(customer.address);
  if (cleanOptional(customer.addressNumber)) payload.addressNumber = cleanOptional(customer.addressNumber);
  if (cleanOptional(customer.complement)) payload.complement = cleanOptional(customer.complement);
  if (cleanOptional(customer.province)) payload.province = cleanOptional(customer.province);

  const { resp, data } = await asaasFetch("/v3/customers", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    throw new Error(`Erro ao criar cliente no Asaas: ${JSON.stringify(data)}`);
  }

  return data;
}

async function getOrCreateCustomer(customer?: PixBody["customer"]) {
  if (!customer) {
    throw new Error("customer é obrigatório para gerar Pix no Asaas.");
  }

  if (customer.id) {
    return customer.id;
  }

  if (!customer.name || !customer.cpfCnpj) {
    throw new Error("customer.name e customer.cpfCnpj são obrigatórios.");
  }

  const cpfCnpj = onlyDigits(customer.cpfCnpj);
  const existing = await findCustomerByCpfCnpj(cpfCnpj);

  if (existing?.id) {
    return existing.id as string;
  }

  const created = await createCustomer({
    ...customer,
    cpfCnpj,
  });

  if (!created?.id) {
    throw new Error("Não foi possível obter o id do cliente criado no Asaas.");
  }

  return created.id as string;
}

async function createPix(body: PixBody) {
  const value = normalizeMoney(body.value);
  const customerId = await getOrCreateCustomer(body.customer);

  const paymentPayload = {
    customer: customerId,
    billingType: "PIX",
    value,
    dueDate: body.dueDate || getTodayYMD(),
    description: body.description || "Pedido",
    externalReference: cleanOptional(body.externalReference),
  };

  const paymentResult = await asaasFetch("/v3/payments", {
    method: "POST",
    body: JSON.stringify(paymentPayload),
  });

  if (!paymentResult.resp.ok) {
    throw new Error(
      `Erro ao criar cobrança Pix no Asaas: ${JSON.stringify(paymentResult.data)}`
    );
  }

  const payment = paymentResult.data;
  const paymentId = payment?.id;

  if (!paymentId) {
    throw new Error("Cobrança criada, mas sem id retornado pelo Asaas.");
  }

  const qrResult = await asaasFetch(`/v3/payments/${paymentId}/pixQrCode`, {
    method: "GET",
  });

  if (!qrResult.resp.ok) {
    throw new Error(
      `Cobrança criada, mas houve erro ao buscar QR Code Pix: ${JSON.stringify(qrResult.data)}`
    );
  }

  const qr = qrResult.data;

  return {
    ok: true,
    gateway: "asaas",
    sandbox: (process.env.ASAAS_ENV || "sandbox").toLowerCase() !== "production",
    payment: {
      id: payment.id,
      customer: payment.customer,
      value: payment.value,
      netValue: payment.netValue,
      billingType: payment.billingType,
      status: payment.status,
      dueDate: payment.dueDate,
      description: payment.description,
      invoiceUrl: payment.invoiceUrl,
      bankSlipUrl: payment.bankSlipUrl,
      externalReference: payment.externalReference,
    },
    pix: {
      encodedImage: qr?.encodedImage || null,
      payload: qr?.payload || null,
      expirationDate: qr?.expirationDate || null,
    },
    raw: {
      payment,
      qr,
    },
  };
}

export async function GET() {
  try {
    const result = await createPix({
      value: 25.9,
      description: "Pedido teste Asaas",
      dueDate: getTodayYMD(),
      externalReference: `teste-asaas-${Date.now()}`,
      customer: {
        name: "Cliente Teste",
        cpfCnpj: "12345678909",
        email: "teste@exemplo.com",
      },
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Erro no teste GET do Pix Asaas",
        details: String(error?.message || error),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PixBody;
    const result = await createPix(body);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Erro interno ao gerar Pix no Asaas",
        details: String(error?.message || error),
      },
      { status: 500 }
    );
  }
}