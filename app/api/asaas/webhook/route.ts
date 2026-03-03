import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type AsaasWebhookBody = {
  event?: string;
  payment?: {
    id?: string;
    customer?: string;
    value?: number | string | null;
    netValue?: number | string | null;
    originalValue?: number | string | null;
    billingType?: string | null;
    status?: string | null;
    dueDate?: string | null;
    paymentDate?: string | null;
    clientPaymentDate?: string | null;
    description?: string | null;
    externalReference?: string | null;
    invoiceUrl?: string | null;
  };
};

function clean(value: unknown) {
  const s = String(value ?? "").trim();
  return s || null;
}

function toNumberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeAsaasPaidAt(body: AsaasWebhookBody) {
  const paymentDate = clean(body?.payment?.paymentDate);
  const clientPaymentDate = clean(body?.payment?.clientPaymentDate);

  if (paymentDate) {
    // vem normalmente como YYYY-MM-DD
    return `${paymentDate}T12:00:00`;
  }
  if (clientPaymentDate) {
    return `${clientPaymentDate}T12:00:00`;
  }
  return new Date().toISOString();
}

function isPaidEvent(eventName: string | null, paymentStatus: string | null) {
  const ev = String(eventName || "").toUpperCase();
  const st = String(paymentStatus || "").toUpperCase();

  return (
    ev === "PAYMENT_RECEIVED" ||
    ev === "PAYMENT_CONFIRMED" ||
    st === "RECEIVED" ||
    st === "CONFIRMED" ||
    st === "RECEIVED_IN_CASH"
  );
}

function isOverdueEvent(eventName: string | null, paymentStatus: string | null) {
  const ev = String(eventName || "").toUpperCase();
  const st = String(paymentStatus || "").toUpperCase();

  return ev === "PAYMENT_OVERDUE" || st === "OVERDUE";
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

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const body = (await req.json()) as AsaasWebhookBody;

    const eventName = clean(body?.event);
    const paymentId = clean(body?.payment?.id);
    const paymentStatus = clean(body?.payment?.status);
    const externalReference = clean(body?.payment?.externalReference);
    const invoiceUrl = clean(body?.payment?.invoiceUrl);

    const amount =
      toNumberOrNull(body?.payment?.value) ??
      toNumberOrNull(body?.payment?.originalValue) ??
      toNumberOrNull(body?.payment?.netValue);

    if (!paymentId) {
      return NextResponse.json(
        { error: "Webhook recebido sem payment.id." },
        { status: 400 }
      );
    }

    // 1) tenta localizar primeiro no log já gravado
    const { data: existingLog, error: existingLogError } = await admin
      .from("order_payments")
      .select("id,order_id,store_id,gateway,payment_id,status,amount,external_reference")
      .eq("gateway", "ASAAS")
      .eq("payment_id", paymentId)
      .maybeSingle();

    if (existingLogError) {
      return NextResponse.json(
        {
          error: "Erro ao localizar payment log existente.",
          details: existingLogError.message,
        },
        { status: 500 }
      );
    }

    let orderId: string | null = clean(existingLog?.order_id);
    let storeId: string | null = clean(existingLog?.store_id);

    // 2) fallback: usa externalReference = orderId
    if (!orderId && externalReference) {
      const { data: orderRow, error: orderFindError } = await admin
        .from("orders")
        .select("id,store_id")
        .eq("id", externalReference)
        .maybeSingle();

      if (orderFindError) {
        return NextResponse.json(
          {
            error: "Erro ao localizar pedido via externalReference.",
            details: orderFindError.message,
          },
          { status: 500 }
        );
      }

      orderId = clean(orderRow?.id);
      storeId = clean(orderRow?.store_id);
    }

    if (!orderId || !storeId) {
      // não quebra o webhook; apenas acusa que não conseguiu vincular
      return NextResponse.json({
        ok: true,
        warning: "Webhook recebido, mas não foi possível vincular ao pedido.",
        paymentId,
        event: eventName,
        status: paymentStatus,
        externalReference,
      });
    }

    // 3) atualiza/cria log do pagamento
    const logPayload = {
      order_id: orderId,
      store_id: storeId,
      gateway: "ASAAS",
      payment_id: paymentId,
      status: paymentStatus,
      amount,
      invoice_url: invoiceUrl,
      external_reference: externalReference,
      raw_response: body,
    };

    const { error: upsertLogError } = await admin
      .from("order_payments")
      .upsert(logPayload, { onConflict: "gateway,payment_id" });

    if (upsertLogError) {
      return NextResponse.json(
        {
          error: "Erro ao atualizar order_payments pelo webhook.",
          details: upsertLogError.message,
        },
        { status: 500 }
      );
    }

    // 4) se o evento for de pagamento confirmado/recebido, baixa o pedido
    if (isPaidEvent(eventName, paymentStatus)) {
      const paidAt = normalizeAsaasPaidAt(body);

      const { error: updateOrderError } = await admin
        .from("orders")
        .update({
          is_paid: true,
          paid_at: paidAt,
          payment_method: "PIX",
          paid_amount: amount,
        })
        .eq("id", orderId);

      if (updateOrderError) {
        return NextResponse.json(
          {
            error: "Erro ao atualizar pedido como pago.",
            details: updateOrderError.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        action: "order_paid_updated",
        gateway: "ASAAS",
        orderId,
        paymentId,
        event: eventName,
        status: paymentStatus,
      });
    }

    // 5) se venceu, atualiza só o status do log
    if (isOverdueEvent(eventName, paymentStatus)) {
      return NextResponse.json({
        ok: true,
        action: "payment_marked_overdue",
        gateway: "ASAAS",
        orderId,
        paymentId,
        event: eventName,
        status: paymentStatus,
      });
    }

    // 6) demais eventos: só registra
    return NextResponse.json({
      ok: true,
      action: "payment_log_updated",
      gateway: "ASAAS",
      orderId,
      paymentId,
      event: eventName,
      status: paymentStatus,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Erro interno no webhook do Asaas.",
        details: String(error?.message || error),
      },
      { status: 500 }
    );
  }
}

// útil para teste rápido no navegador
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/asaas/webhook",
    method: "POST",
  });
}