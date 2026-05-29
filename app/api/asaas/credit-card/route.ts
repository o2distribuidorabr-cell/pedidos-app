import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// ──────────────────────────────────────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────────────────────────────────────

type CreditCardBody = {
  orderId: string;
  storeId?: string;          // opcional — lido do pedido se omitido
  paymentMethodCode?: string; // ex: "CREDIT_CARD_ONLINE" — usado para lookup de fee_percent
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
  default_payment_method?: string | null;
};

type OrderRow = {
  id: string;
  store_id: string;
  status: string;
  due_date: string | null;
  is_paid: boolean | null;
  delivery_mode: "RETIRADA" | "FRETE" | null;
  freight_fee: number | null;
  credit_applied: number | null;
};

type TotalsRow = {
  order_id: string;
  total_cost: number | null;
};

type OrderItemRow = {
  order_id: string;
  qty: number | null;
  unit_cost: number | null;
};

type FinanceSettingsRow = {
  id: number;
  apply_late_charges: boolean | null;
  late_fee_percent: number | null;
  daily_interest_percent: number | null;
};

// ──────────────────────────────────────────────────────────────────────────────
// Helpers — copiados do fluxo PIX (app/api/asaas/pix/route.ts) sem alteração,
// para não tocar no arquivo original.
// ──────────────────────────────────────────────────────────────────────────────

function getAsaasBaseUrl() {
  const env = (process.env.ASAAS_ENV || "sandbox").toLowerCase();
  return env === "production"
    ? "https://api.asaas.com"
    : "https://sandbox.asaas.com/api";
}

function getTodayYMD() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
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

function near(a: number, b: number, eps = 0.01) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= eps;
}

function normalizeDueDateNotPast(input?: string | null) {
  const today = getTodayYMD();
  const raw = String(input || "").trim();
  if (!raw) return today;
  return raw < today ? today : raw;
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
  if (!apiKey) throw new Error("ASAAS_API_KEY não configurado");
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
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { resp, data, baseUrl };
}

async function findCustomerByCpfCnpj(cpfCnpj: string) {
  const { resp, data } = await asaasFetch(
    `/v3/customers?${new URLSearchParams({ cpfCnpj, limit: "1" })}`,
    { method: "GET" }
  );
  if (!resp.ok) throw new Error(`Erro ao buscar cliente no Asaas: ${JSON.stringify(data)}`);
  return data?.data?.[0] || null;
}

async function createCustomer(payload: Record<string, any>) {
  const { resp, data } = await asaasFetch("/v3/customers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`Erro ao criar cliente no Asaas: ${JSON.stringify(data)}`);
  return data;
}

async function updateCustomer(customerId: string, payload: Record<string, any>) {
  const { resp, data } = await asaasFetch(
    `/v3/customers/${encodeURIComponent(customerId)}`,
    { method: "POST", body: JSON.stringify(payload) }
  );
  if (!resp.ok) throw new Error(`Erro ao atualizar cliente no Asaas: ${JSON.stringify(data)}`);
  return data;
}

async function saveAsaasCustomerIdOnStore(storeId: string, asaasCustomerId: string) {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("stores")
    .update({ asaas_customer_id: asaasCustomerId })
    .eq("id", storeId);
  if (error) throw new Error(`Erro ao salvar asaas_customer_id: ${error.message}`);
}

function buildCustomerFromStore(store: StoreRow) {
  const name = cleanRequired(store.legal_name || store.name);
  const cpfCnpj = onlyDigits(store.cnpj);
  const email = cleanOptional(store.billing_email) || cleanOptional(store.email_nf);
  const phone = onlyDigits(store.billing_phone) || onlyDigits(store.phone_nf);
  const postalCode = onlyDigits(store.address_zip);
  if (!name) throw new Error("A loja não possui Razão Social/Nome preenchido.");
  if (!cpfCnpj || cpfCnpj.length !== 14) throw new Error("A loja não possui CNPJ válido.");
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

async function getOrCreateCustomer(store: StoreRow) {
  const customer = buildCustomerFromStore(store);
  const basePayload: Record<string, any> = {
    name: customer.name,
    cpfCnpj: customer.cpfCnpj,
    email: customer.email,
  };
  if (customer.phone) basePayload.phone = customer.phone;
  if (customer.postalCode) basePayload.postalCode = customer.postalCode;
  if (customer.address) basePayload.address = customer.address;
  if (customer.addressNumber) basePayload.addressNumber = customer.addressNumber;
  if (customer.complement) basePayload.complement = customer.complement;
  if (customer.province) basePayload.province = customer.province;

  if (customer.id) {
    await updateCustomer(customer.id, basePayload);
    return customer.id;
  }

  const existing = await findCustomerByCpfCnpj(customer.cpfCnpj);
  if (existing?.id) {
    await updateCustomer(existing.id as string, basePayload);
    await saveAsaasCustomerIdOnStore(store.id, existing.id as string);
    return existing.id as string;
  }

  const created = await createCustomer(basePayload);
  if (!created?.id) throw new Error("Não foi possível obter id do cliente criado no Asaas.");
  await saveAsaasCustomerIdOnStore(store.id, created.id as string);
  return created.id as string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Lógica principal
// ──────────────────────────────────────────────────────────────────────────────

async function getStoreById(storeId: string): Promise<StoreRow> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("stores")
    .select(
      "id,name,legal_name,cnpj,billing_email,billing_phone,email_nf,phone_nf," +
      "address_zip,address_street,address_number,address_complement,address_neighborhood," +
      "asaas_customer_id,default_payment_method"
    )
    .eq("id", storeId)
    .maybeSingle();
  if (error) throw new Error(`Erro ao buscar loja: ${error.message}`);
  if (!data) throw new Error("Loja não encontrada.");
  return data as unknown as StoreRow;
}

async function getOrderById(orderId: string): Promise<OrderRow> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("orders")
    .select("id,store_id,status,due_date,is_paid,delivery_mode,freight_fee,credit_applied")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(`Erro ao buscar pedido: ${error.message}`);
  if (!data) throw new Error("Pedido não encontrado.");
  return data as OrderRow;
}

async function getFinanceSettings(): Promise<FinanceSettingsRow | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("finance_settings")
    .select("id,apply_late_charges,late_fee_percent,daily_interest_percent")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(`Erro ao buscar finance_settings: ${error.message}`);
  return (data ?? null) as FinanceSettingsRow | null;
}

async function getOrderTotalAndItems(orderId: string) {
  const admin = getSupabaseAdmin();
  const { data: totalData, error: totalError } = await admin
    .from("v_order_totals")
    .select("order_id,total_cost")
    .eq("order_id", orderId)
    .maybeSingle();
  if (totalError) throw new Error(`Erro ao buscar total: ${totalError.message}`);

  const { data: itemsData, error: itemsError } = await admin
    .from("order_items")
    .select("order_id,qty,unit_cost")
    .eq("order_id", orderId);
  if (itemsError) throw new Error(`Erro ao buscar itens: ${itemsError.message}`);

  return {
    totalRow: (totalData ?? null) as TotalsRow | null,
    items: (itemsData ?? []) as OrderItemRow[],
  };
}

async function calculateAmount(orderId: string): Promise<{ amount: number; dueDate: string }> {
  const [order, settings] = await Promise.all([
    getOrderById(orderId),
    getFinanceSettings(),
  ]);

  const { totalRow, items } = await getOrderTotalAndItems(orderId);

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

  if (baseAmount <= 0) throw new Error("O valor calculado para o pedido é inválido (zero ou negativo).");

  const dueDate = normalizeDueDateNotPast(order.due_date || getTodayYMD());

  return { amount: roundTo(baseAmount, 2), dueDate };
}

async function isCreditCardAllowedForStore(storeId: string, store: StoreRow): Promise<boolean> {
  const admin = getSupabaseAdmin();

  // 1. Verifica na tabela store_payment_methods (CREDIT_CARD ou CREDIT_CARD_ONLINE)
  const { data: spm } = await admin
    .from("store_payment_methods")
    .select("payment_method")
    .eq("store_id", storeId)
    .in("payment_method", ["CREDIT_CARD", "CREDIT_CARD_ONLINE"])
    .eq("enabled", true)
    .limit(1)
    .maybeSingle();

  if (spm) return true;

  // 2. Fallback: campo legado stores.default_payment_method
  const method = String(store.default_payment_method || "").toUpperCase();
  return method === "CARTAO" || method === "CREDIT_CARD";
}

async function createCreditCardCharge(body: CreditCardBody) {
  const admin = getSupabaseAdmin();

  // 1. Busca o pedido
  const order = await getOrderById(body.orderId);
  const storeId = body.storeId || order.store_id;

  // 2. Validações básicas
  if (order.is_paid) {
    throw new Error("Este pedido já foi pago.");
  }
  if (order.status === "approved" || order.status === "rejected") {
    throw new Error("Não é possível cobrar um pedido já aprovado ou rejeitado.");
  }

  // 3. Busca a loja
  const store = await getStoreById(storeId);

  // 4. Verifica se cartão está disponível para esta loja
  const allowed = await isCreditCardAllowedForStore(storeId, store);
  if (!allowed) {
    throw new Error("Cartão de crédito não está disponível para esta loja.");
  }

  // 5. Calcula o valor base
  const { amount: baseAmount, dueDate } = await calculateAmount(body.orderId);

  // 5a. Aplica acréscimo do método de pagamento (ex: 4,25% para CREDIT_CARD_ONLINE)
  let feePercent = 0;
  if (body.paymentMethodCode) {
    const { data: spmFee } = await admin
      .from("store_payment_methods")
      .select("fee_percent")
      .eq("store_id", storeId)
      .eq("payment_method", body.paymentMethodCode)
      .eq("enabled", true)
      .maybeSingle();
    feePercent = Number((spmFee as any)?.fee_percent ?? 0) || 0;
  }
  const amount = feePercent > 0 ? roundTo(baseAmount * (1 + feePercent / 100), 2) : baseAmount;

  // 6. Obtém/cria o cliente Asaas
  const customerId = await getOrCreateCustomer(store);

  // 7. Cria a cobrança no Asaas
  const paymentPayload: Record<string, any> = {
    customer: customerId,
    billingType: "CREDIT_CARD",
    value: amount,
    dueDate,
    description: `Pedido ${body.orderId.slice(0, 8).toUpperCase()}`,
    externalReference: body.orderId,
  };

  const { resp: payResp, data: payData } = await asaasFetch("/v3/payments", {
    method: "POST",
    body: JSON.stringify(paymentPayload),
  });

  if (!payResp.ok) {
    throw new Error(`Erro ao criar cobrança de cartão no Asaas: ${JSON.stringify(payData)}`);
  }

  const paymentId: string = payData?.id;
  const invoiceUrl: string = payData?.invoiceUrl;

  if (!paymentId) throw new Error("Cobrança criada, mas sem id retornado pelo Asaas.");
  if (!invoiceUrl) throw new Error("Cobrança criada, mas sem invoiceUrl retornado pelo Asaas.");

  // 8. Atualiza o pedido para awaiting_payment
  const { error: orderUpdateError } = await admin
    .from("orders")
    .update({
      status: "awaiting_payment",
      payment_method: "CARTAO",
    })
    .eq("id", body.orderId);

  if (orderUpdateError) {
    throw new Error(`Erro ao atualizar status do pedido: ${orderUpdateError.message}`);
  }

  // 9. Salva na tabela order_payments
  const { error: logError } = await admin
    .from("order_payments")
    .upsert(
      {
        order_id: body.orderId,
        store_id: storeId,
        gateway: "ASAAS",
        payment_id: paymentId,
        billing_type: "CREDIT_CARD",
        status: payData?.status ?? "PENDING",
        amount,
        invoice_url: invoiceUrl,
        external_reference: body.orderId,
        raw_response: payData,
      },
      { onConflict: "gateway,payment_id" }
    );

  if (logError) {
    // Não falha o fluxo por erro de log, mas registra no console
    console.error("[credit-card] Erro ao salvar order_payments:", logError.message);
  }

  return {
    ok: true,
    gateway: "asaas",
    sandbox: (process.env.ASAAS_ENV || "sandbox").toLowerCase() !== "production",
    orderId: body.orderId,
    paymentId,
    invoiceUrl,
    amount,
    baseAmount,
    feePercent,
    dueDate,
    billingType: "CREDIT_CARD",
    paymentMethodCode: body.paymentMethodCode ?? "CREDIT_CARD",
    status: payData?.status ?? "PENDING",
    raw: payData,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Handler HTTP
// ──────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreditCardBody;

    if (!body?.orderId) {
      return NextResponse.json(
        { ok: false, error: "orderId é obrigatório." },
        { status: 400 }
      );
    }

    const result = await createCreditCardCharge(body);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "Erro ao processar pagamento com cartão.",
        details: String(error?.message || error),
      },
      { status: 500 }
    );
  }
}
