import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// ──────────────────────────────────────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────────────────────────────────────

type CreditCardBody = {
  orderId: string;
  storeId?: string;
  paymentMethodCode?: string; // ex: "CREDIT_CARD_ONLINE"
};

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Variáveis do Supabase não configuradas no servidor.");
  }
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

function getMpCcAccessToken() {
  // Token da conta que recebe pagamentos de cartão de crédito (ex: smartpay)
  // Variável separada da conta de PIX (MERCADOPAGO_ACCESS_TOKEN = o2distribuidora)
  const token = process.env.MERCADOPAGO_CC_ACCESS_TOKEN;
  if (!token) throw new Error("MERCADOPAGO_CC_ACCESS_TOKEN não configurado.");
  return token;
}

function roundTo(n: number, decimals = 2) {
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function near(a: number, b: number, eps = 0.01) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= eps;
}

// ──────────────────────────────────────────────────────────────────────────────
// Dados do banco
// ──────────────────────────────────────────────────────────────────────────────

async function getOrderById(orderId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("orders")
    .select("id,store_id,status,is_paid,delivery_mode,freight_fee,credit_applied")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(`Erro ao buscar pedido: ${error.message}`);
  if (!data) throw new Error("Pedido não encontrado.");
  return data as any;
}

async function getStoreById(storeId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("stores")
    .select("id,name,legal_name")
    .eq("id", storeId)
    .maybeSingle();
  if (error) throw new Error(`Erro ao buscar loja: ${error.message}`);
  if (!data) throw new Error("Loja não encontrada.");
  return data as any;
}

async function calculateBaseAmount(orderId: string): Promise<number> {
  const admin = getSupabaseAdmin();
  const order = await getOrderById(orderId);

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

  const items = (itemsData ?? []) as any[];
  const frete = order.delivery_mode === "FRETE" ? Number(order.freight_fee ?? 0) : 0;
  const viewTotal = Number(totalData?.total_cost ?? 0) || 0;

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

  return roundTo(baseAmount, 2);
}

// ──────────────────────────────────────────────────────────────────────────────
// Lógica principal — cria preferência de Checkout Pro no Mercado Pago
// ──────────────────────────────────────────────────────────────────────────────

async function createMpCreditCardPreference(body: CreditCardBody) {
  const admin = getSupabaseAdmin();
  const accessToken = getMpCcAccessToken();

  // 1. Busca pedido e loja
  const order = await getOrderById(body.orderId);
  const storeId = body.storeId || order.store_id;

  // 2. Validações
  if (order.is_paid) throw new Error("Este pedido já foi pago.");
  if (order.status === "approved" || order.status === "rejected") {
    throw new Error("Não é possível cobrar um pedido já aprovado ou rejeitado.");
  }

  const store = await getStoreById(storeId);

  // 3. Calcula valor base (já descontado o crédito pré-pago se houver)
  const baseAmount = await calculateBaseAmount(body.orderId);

  // 4. Mercado Pago não cobra acréscimo ao franqueado — taxa do gateway absorvida internamente
  const feePercent = 0;
  const amount = baseAmount;

  // 5. Monta URLs de retorno e notificação
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "").replace(/\/$/, "");
  // Webhook separado para cartão (conta smartpay) — não mistura com o webhook de PIX (o2distribuidora)
  const notificationUrl = appUrl ? `${appUrl}/api/mp/cc-webhook` : undefined;

  // 6. Monta payload da preferência (somente cartão de crédito, 1 parcela)
  const storeName = String(store.legal_name || store.name || "Pedido").slice(0, 256);
  const preferencePayload: Record<string, any> = {
    items: [
      {
        id: body.orderId.slice(0, 8).toUpperCase(),
        title: `Pedido ${body.orderId.slice(0, 8).toUpperCase()} – ${storeName}`,
        quantity: 1,
        unit_price: amount,
        currency_id: "BRL",
      },
    ],
    external_reference: body.orderId,
    payment_methods: {
      // Aceita somente cartão de crédito
      excluded_payment_types: [
        { id: "ticket" },
        { id: "bank_transfer" },
        { id: "debit_card" },
        { id: "prepaid_card" },
        { id: "crypto" },
        { id: "digital_currency" },
      ],
      installments: 1,
    },
  };

  if (notificationUrl) {
    preferencePayload.notification_url = notificationUrl;
  }

  if (appUrl) {
    preferencePayload.back_urls = {
      success: `${appUrl}/pedidos`,
      failure: `${appUrl}/pedido/confirmar`,
      pending: `${appUrl}/pedidos`,
    };
    preferencePayload.auto_return = "approved";
  }

  // 7. Cria preferência no Mercado Pago
  const prefResp = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(preferencePayload),
    cache: "no-store",
  });

  const prefData = await prefResp.json();

  if (!prefResp.ok) {
    throw new Error(`Erro ao criar preferência no Mercado Pago: ${JSON.stringify(prefData)}`);
  }

  const prefId: string = prefData?.id;

  // Tokens de teste começam com "TEST-"; tokens de produção começam com "APP_USR-"
  const isSandbox = accessToken.startsWith("TEST-");
  const invoiceUrl: string = isSandbox
    ? (prefData?.sandbox_init_point ?? prefData?.init_point)
    : prefData?.init_point;

  if (!prefId) throw new Error("Preferência criada, mas sem id retornado pelo Mercado Pago.");
  if (!invoiceUrl) throw new Error("Preferência criada, mas sem init_point retornado pelo Mercado Pago.");

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

  // 9. Registra na tabela order_payments
  const { error: logError } = await admin
    .from("order_payments")
    .upsert(
      {
        order_id: body.orderId,
        store_id: storeId,
        gateway: "MERCADOPAGO",
        payment_id: prefId,
        billing_type: "CREDIT_CARD",
        status: "PENDING",
        amount,
        invoice_url: invoiceUrl,
        external_reference: body.orderId,
        raw_response: prefData,
      },
      { onConflict: "gateway,payment_id" }
    );

  if (logError) {
    console.error("[mp/credit-card] Erro ao salvar order_payments:", logError.message);
  }

  return {
    ok: true,
    gateway: "mercadopago",
    sandbox: isSandbox,
    orderId: body.orderId,
    paymentId: prefId,
    invoiceUrl,
    amount,
    baseAmount,
    feePercent,
    billingType: "CREDIT_CARD",
    paymentMethodCode: body.paymentMethodCode ?? "CREDIT_CARD_ONLINE",
    status: "PENDING",
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

    const result = await createMpCreditCardPreference(body);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "Erro ao processar pagamento com cartão (Mercado Pago).",
        details: String(error?.message || error),
      },
      { status: 500 }
    );
  }
}
