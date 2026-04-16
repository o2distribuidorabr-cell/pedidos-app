import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type PixBody = {
  value?: number | string;
  description?: string;
  dueDate?: string; // YYYY-MM-DD
  externalReference?: string;
  orderId?: string;
  storeId?: string;

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

type StoreRow = {
  id: string;
  name: string | null;
  legal_name: string | null;
  cnpj: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  email_nf?: string | null;
  phone_nf?: string | null;
  address_zip: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  asaas_customer_id?: string | null;
};

type FinanceSettingsRow = {
  id: number;
  apply_late_charges: boolean | null;
  late_fee_percent: number | null; // % uma vez
  daily_interest_percent: number | null; // % ao dia no seu sistema
};

type OrderRow = {
  id: string;
  store_id: string;
  due_date: string | null;
  is_paid: boolean | null;
  delivery_mode: "RETIRADA" | "FRETE" | null;
  freight_fee: number | null;
  credit_applied: number | null;
};

type TotalsRow = {
  order_id: string;
  store_id: string;
  total_cost: number | null;
};

type OrderItemRow = {
  order_id: string;
  qty: number | null;
  unit_cost: number | null;
};

function getAsaasBaseUrl() {
  const env = (process.env.ASAAS_ENV || "sandbox").toLowerCase();
  return env === "production"
    ? "https://api.asaas.com"
    : "https://sandbox.asaas.com/api";
}

function getTodayYMD() {
  // en-CA retorna YYYY-MM-DD; fuso fixo em SP evita virar o dia antes no servidor UTC
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function onlyDigits(value?: string | null) {
  return String(value || "").replace(/\D/g, "").trim();
}

function cleanOptional(value?: string | null) {
  const v = String(value || "").trim();
  return v ? v : undefined;
}

function cleanRequired(value?: string | null) {
  return String(value || "").trim();
}

function roundTo(n: number, decimals = 2) {
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function normalizeMoney(value: number | string) {
  const n =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/\./g, "").replace(",", "."));

  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Valor inválido para cobrança Pix.");
  }

  return roundTo(n, 2);
}

function normalizeDueDateNotPast(input?: string | null) {
  const today = getTodayYMD();
  const raw = String(input || "").trim();
  if (!raw) return today;
  return raw < today ? today : raw;
}

function daysLateYMD(dueYmd: string, todayYmd = getTodayYMD()) {
  const [y1, m1, d1] = dueYmd.split("-").map(Number);
  const [y2, m2, d2] = todayYmd.split("-").map(Number);

  const due = new Date(y1, m1 - 1, d1, 12, 0, 0);
  const today = new Date(y2, m2 - 1, d2, 12, 0, 0);

  const diff = today.getTime() - due.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  return Math.max(days, 0);
}

function near(a: number, b: number, eps = 0.01) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= eps;
}

function dailyToMonthlyPercentSimple(dailyPercent: number) {
  // Ex.: 0,066% ao dia -> 1,98% ao mês
  return roundTo(dailyPercent * 30, 2);
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Variáveis do Supabase não configuradas no servidor.");
  }

  return createClient(supabaseUrl, serviceRoleKey);
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

  return data?.data?.[0] || null;
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

async function updateCustomer(customerId: string, customer: NonNullable<PixBody["customer"]>) {
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

  const { resp, data } = await asaasFetch(`/v3/customers/${encodeURIComponent(customerId)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    throw new Error(`Erro ao atualizar cliente no Asaas: ${JSON.stringify(data)}`);
  }

  return data;
}

async function getStoreById(storeId: string): Promise<StoreRow> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("stores")
    .select(
      "id,name,legal_name,cnpj,billing_email,billing_phone,email_nf,phone_nf,address_zip,address_street,address_number,address_complement,address_neighborhood,asaas_customer_id"
    )
    .eq("id", storeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar dados da loja no Supabase: ${error.message}`);
  }

  if (!data) {
    throw new Error("Loja não encontrada no Supabase.");
  }

  return data as StoreRow;
}

async function getFinanceSettings(): Promise<FinanceSettingsRow | null> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("finance_settings")
    .select("id,apply_late_charges,late_fee_percent,daily_interest_percent")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar finance_settings: ${error.message}`);
  }

  return (data ?? null) as FinanceSettingsRow | null;
}

async function getOrderById(orderId: string): Promise<OrderRow> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("orders")
    .select("id,store_id,due_date,is_paid,delivery_mode,freight_fee,credit_applied")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar pedido no Supabase: ${error.message}`);
  }

  if (!data) {
    throw new Error("Pedido não encontrado no Supabase.");
  }

  return data as OrderRow;
}

async function getOrderTotalAndItems(orderId: string) {
  const admin = getSupabaseAdmin();

  const { data: totalData, error: totalError } = await admin
    .from("v_order_totals")
    .select("order_id,store_id,total_cost")
    .eq("order_id", orderId)
    .maybeSingle();

  if (totalError) {
    throw new Error(`Erro ao buscar total do pedido: ${totalError.message}`);
  }

  const { data: itemsData, error: itemsError } = await admin
    .from("order_items")
    .select("order_id,qty,unit_cost")
    .eq("order_id", orderId);

  if (itemsError) {
    throw new Error(`Erro ao buscar itens do pedido: ${itemsError.message}`);
  }

  return {
    totalRow: (totalData ?? null) as TotalsRow | null,
    items: (itemsData ?? []) as OrderItemRow[],
  };
}

function buildCustomerFromStore(store: StoreRow): NonNullable<PixBody["customer"]> {
  const name = cleanRequired(store.legal_name || store.name);
  const cpfCnpj = onlyDigits(store.cnpj);

  const email =
    cleanOptional(store.billing_email) ||
    cleanOptional(store.email_nf);

  const phone =
    onlyDigits(store.billing_phone) ||
    onlyDigits(store.phone_nf);

  const postalCode = onlyDigits(store.address_zip);

  if (!name) {
    throw new Error("A loja não possui Razão Social/Nome preenchido.");
  }

  if (!cpfCnpj || cpfCnpj.length !== 14) {
    throw new Error("A loja não possui CNPJ válido para envio ao Asaas.");
  }

  return {
    id: cleanOptional(store.asaas_customer_id),
    name,
    cpfCnpj,
    email,
    phone: phone || undefined,
    postalCode: postalCode || undefined,
    address: cleanOptional(store.address_street),
    addressNumber: cleanOptional(store.address_number),
    complement: cleanOptional(store.address_complement),
    province: cleanOptional(store.address_neighborhood),
  };
}

async function saveAsaasCustomerIdOnStore(storeId: string, asaasCustomerId: string) {
  const admin = getSupabaseAdmin();

  const { error } = await admin
    .from("stores")
    .update({ asaas_customer_id: asaasCustomerId })
    .eq("id", storeId);

  if (error) {
    throw new Error(`Erro ao salvar asaas_customer_id na loja: ${error.message}`);
  }
}

async function getOrCreateCustomer(customer?: PixBody["customer"], storeId?: string) {
  let resolvedCustomer = customer;

  if (storeId) {
    const store = await getStoreById(storeId);
    resolvedCustomer = buildCustomerFromStore(store);
  }

  if (!resolvedCustomer) {
    throw new Error("customer ou storeId é obrigatório para gerar Pix no Asaas.");
  }

  if (resolvedCustomer.id) {
    await updateCustomer(resolvedCustomer.id, resolvedCustomer);
    return {
      customerId: resolvedCustomer.id,
      customerUsed: resolvedCustomer,
    };
  }

  if (!resolvedCustomer.name || !resolvedCustomer.cpfCnpj) {
    throw new Error("customer.name e customer.cpfCnpj são obrigatórios.");
  }

  const cpfCnpj = onlyDigits(resolvedCustomer.cpfCnpj);
  const existing = await findCustomerByCpfCnpj(cpfCnpj);

  if (existing?.id) {
    await updateCustomer(existing.id as string, {
      ...resolvedCustomer,
      cpfCnpj,
    });

    if (storeId) {
      await saveAsaasCustomerIdOnStore(storeId, existing.id as string);
    }

    return {
      customerId: existing.id as string,
      customerUsed: {
        ...resolvedCustomer,
        id: existing.id as string,
        cpfCnpj,
      },
    };
  }

  const created = await createCustomer({
    ...resolvedCustomer,
    cpfCnpj,
  });

  if (!created?.id) {
    throw new Error("Não foi possível obter o id do cliente criado no Asaas.");
  }

  if (storeId) {
    await saveAsaasCustomerIdOnStore(storeId, created.id as string);
  }

  return {
    customerId: created.id as string,
    customerUsed: {
      ...resolvedCustomer,
      id: created.id as string,
      cpfCnpj,
    },
  };
}

function buildLateChargesForAsaas(settings: FinanceSettingsRow | null) {
  const applyLateCharges = !!settings?.apply_late_charges;
  const lateFeePercent = Number(settings?.late_fee_percent ?? 0) || 0;
  const dailyInterestPercent = Number(settings?.daily_interest_percent ?? 0) || 0;

  const result: {
    fine?: { value: number; type?: string };
    interest?: { value: number };
    debug?: {
      dailyInterestPercentInput: number;
      monthlyInterestPercentSentToAsaas: number;
    };
  } = {};

  if (!applyLateCharges) return result;

  if (lateFeePercent > 0) {
    result.fine = {
      value: roundTo(lateFeePercent, 2),
      type: "PERCENTAGE",
    };
  }

  if (dailyInterestPercent > 0) {
    const monthlyInterestPercent = dailyToMonthlyPercentSimple(dailyInterestPercent);

    result.interest = {
      value: monthlyInterestPercent,
    };

    result.debug = {
      dailyInterestPercentInput: dailyInterestPercent,
      monthlyInterestPercentSentToAsaas: monthlyInterestPercent,
    };
  }

  return result;
}

async function calculateOrderAmountFromSystem(orderId: string, settings: FinanceSettingsRow | null) {
  const order = await getOrderById(orderId);
  const { totalRow, items } = await getOrderTotalAndItems(orderId);

  const today = getTodayYMD();
  const applyCharges = !!settings?.apply_late_charges;
  const lateFeePercent = Number(settings?.late_fee_percent ?? 0) || 0;
  const dailyInterestPercent = Number(settings?.daily_interest_percent ?? 0) || 0;

  const frete = order.delivery_mode === "FRETE" ? Number(order.freight_fee ?? 0) : 0;

  const viewTotal = Number(totalRow?.total_cost ?? 0) || 0;

  let itemsCalc = 0;
  for (const item of items) {
    itemsCalc += (Number(item.qty) || 0) * (Number(item.unit_cost) || 0);
  }

  let mercadoria = viewTotal;

  if (frete > 0 && items.length > 0) {
    if (near(viewTotal, itemsCalc + frete)) mercadoria = Math.max(viewTotal - frete, 0);
    else if (near(viewTotal, itemsCalc)) mercadoria = viewTotal;
    else if (!near(itemsCalc, 0)) mercadoria = itemsCalc;
  } else {
    if (items.length > 0 && !near(viewTotal, itemsCalc)) mercadoria = itemsCalc;
  }

  const total = mercadoria + frete;
  const creditApplied = Number(order.credit_applied ?? 0) || 0;
  const baseAmount = Math.max(total - creditApplied, 0);

  const dueDateOriginal = order.due_date;
  const isPaid = !!order.is_paid;
  const isOverdue = !!dueDateOriginal && !isPaid && dueDateOriginal < today;

  let lateDays = 0;
  let lateFeeValue = 0;
  let lateInterestValue = 0;
  let amountToCharge = baseAmount;

  if (applyCharges && isOverdue && dueDateOriginal) {
    lateDays = daysLateYMD(dueDateOriginal, today);
    lateFeeValue = roundTo(baseAmount * (lateFeePercent / 100), 2);
    lateInterestValue = roundTo(baseAmount * (dailyInterestPercent / 100) * lateDays, 2);
    amountToCharge = roundTo(baseAmount + lateFeeValue + lateInterestValue, 2);
  }

  const dueDateToSend = normalizeDueDateNotPast(dueDateOriginal || today);

  return {
    order,
    totals: {
      mercadoria: roundTo(mercadoria, 2),
      frete: roundTo(frete, 2),
      total: roundTo(total, 2),
      creditApplied: roundTo(creditApplied, 2),
      baseAmount: roundTo(baseAmount, 2),
    },
    overdue: {
      isOverdue,
      lateDays,
      lateFeePercent: roundTo(lateFeePercent, 4),
      dailyInterestPercent: roundTo(dailyInterestPercent, 4),
      lateFeeValue,
      lateInterestValue,
    },
    dueDateOriginal,
    dueDateToSend,
    amountToCharge,
  };
}

async function createPix(body: PixBody) {
  const settings = await getFinanceSettings();
  const lateChargesForAsaas = buildLateChargesForAsaas(settings);

  let resolvedStoreId = cleanOptional(body.storeId);
  let resolvedValue = 0;
  let resolvedDueDate = "";
  let pricingDebug: any = null;

  if (body.orderId) {
    const calc = await calculateOrderAmountFromSystem(body.orderId, settings);

    resolvedStoreId = resolvedStoreId || calc.order.store_id;
    resolvedValue = calc.amountToCharge;
    resolvedDueDate = calc.dueDateToSend;

    pricingDebug = {
      source: "order",
      orderId: body.orderId,
      dueDateOriginal: calc.dueDateOriginal,
      dueDateSentToAsaas: calc.dueDateToSend,
      baseAmount: calc.totals.baseAmount,
      amountToCharge: calc.amountToCharge,
      mercadoria: calc.totals.mercadoria,
      frete: calc.totals.frete,
      total: calc.totals.total,
      creditApplied: calc.totals.creditApplied,
      overdue: calc.overdue,
      wasDueDateAdjustedToToday:
        !!calc.dueDateOriginal && calc.dueDateOriginal < getTodayYMD(),
    };
  } else {
    if (body.value == null) {
      throw new Error("value é obrigatório quando orderId não for informado.");
    }

    resolvedValue = normalizeMoney(body.value);
    resolvedDueDate = normalizeDueDateNotPast(body.dueDate);

    pricingDebug = {
      source: "body",
      requestedValue: body.value,
      valueSentToAsaas: resolvedValue,
      requestedDueDate: body.dueDate || null,
      dueDateSentToAsaas: resolvedDueDate,
      wasDueDateAdjustedToToday:
        !!body.dueDate && body.dueDate < getTodayYMD(),
    };
  }

  if (resolvedValue <= 0) {
    throw new Error("O valor calculado para a cobrança ficou inválido.");
  }

  const { customerId, customerUsed } = await getOrCreateCustomer(body.customer, resolvedStoreId);

  const paymentPayload: Record<string, any> = {
    customer: customerId,
    billingType: "PIX",
    value: resolvedValue,
    dueDate: resolvedDueDate,
    description: body.description || (body.orderId ? `Pedido ${body.orderId}` : "Pedido"),
    externalReference: cleanOptional(body.externalReference || body.orderId),
  };

  // Encargos futuros no Asaas:
  // - para pedidos a vencer, ele cobrará após o vencimento normalmente
  // - para pedidos já vencidos, como a cobrança nova vence hoje, ele passa a cobrar novos encargos só depois de hoje
  if (lateChargesForAsaas.fine) paymentPayload.fine = lateChargesForAsaas.fine;
  if (lateChargesForAsaas.interest) paymentPayload.interest = lateChargesForAsaas.interest;

  const paymentResult = await asaasFetch("/v3/payments", {
    method: "POST",
    body: JSON.stringify(paymentPayload),
  });

  if (!paymentResult.resp.ok) {
    throw new Error(`Erro ao criar cobrança Pix no Asaas: ${JSON.stringify(paymentResult.data)}`);
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
    throw new Error(`Cobrança criada, mas houve erro ao buscar QR Code Pix: ${JSON.stringify(qrResult.data)}`);
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
      fine: payment.fine ?? paymentPayload.fine ?? null,
      interest: payment.interest ?? paymentPayload.interest ?? null,
    },
    pix: {
      encodedImage: qr?.encodedImage || null,
      payload: qr?.payload || null,
      expirationDate: qr?.expirationDate || null,
    },
    customer: {
      id: customerUsed?.id || customerId,
      name: customerUsed?.name || null,
      cpfCnpj: customerUsed?.cpfCnpj || null,
      email: customerUsed?.email || null,
      phone: customerUsed?.phone || null,
      postalCode: customerUsed?.postalCode || null,
      address: customerUsed?.address || null,
      addressNumber: customerUsed?.addressNumber || null,
      complement: customerUsed?.complement || null,
      province: customerUsed?.province || null,
    },
    financeSettings: settings,
    conversion: lateChargesForAsaas.debug ?? null,
    pricing: pricingDebug,
    raw: {
      payment,
      qr,
      paymentPayloadSent: paymentPayload,
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