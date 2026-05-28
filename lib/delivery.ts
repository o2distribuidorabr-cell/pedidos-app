import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeliveryStatus,
  FinalizeDeliveryResult,
  OrderDeliveryOverviewRow,
  StartDeliveryFlowResult,
} from "@/lib/deliveryTypes";
import {
  createOrReplaceDeliveryConfirmation,
  validateDeliveryConfirmationCode,
} from "@/lib/deliveryConfirmation";
import {
  createTrackingSession,
  endTrackingSessionByToken,
  getTrackingSessionByToken,
} from "@/lib/deliveryTracking";

function mapLogisticToDeliveryStatus(
  logisticStatus: string | null | undefined
): DeliveryStatus {
  if (logisticStatus === "EM_SEPARACAO") return "EM_SEPARACAO";
  if (logisticStatus === "SAIU_PARA_ENTREGA") return "SAIU_PARA_ENTREGA";
  if (logisticStatus === "ENTREGUE") return "ENTREGUE";
  return "PENDENTE";
}

function mapDeliveryToLogisticStatus(
  deliveryStatus: DeliveryStatus
): "RECEBIDO" | "EM_SEPARACAO" | "SAIU_PARA_ENTREGA" | "ENTREGUE" | null {
  if (deliveryStatus === "EM_SEPARACAO") return "EM_SEPARACAO";
  if (deliveryStatus === "SAIU_PARA_ENTREGA") return "SAIU_PARA_ENTREGA";
  if (deliveryStatus === "ENTREGUE") return "ENTREGUE";
  if (deliveryStatus === "PENDENTE") return "RECEBIDO";
  return null; // OCORRENCIA não entra no fluxo logístico principal
}

export async function getOrderDeliveryOverview(
  supabase: SupabaseClient,
  orderId: string
): Promise<OrderDeliveryOverviewRow | null> {
  const [
    { data: overviewData, error: overviewError },
    { data: orderData, error: orderError },
  ] = await Promise.all([
    supabase
      .from("vw_order_delivery_overview")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("id, logistic_status")
      .eq("id", orderId)
      .maybeSingle(),
  ]);

  if (overviewError) {
    throw new Error(`Erro ao buscar overview da logística: ${overviewError.message}`);
  }

  if (orderError) {
    throw new Error(`Erro ao buscar status do pedido: ${orderError.message}`);
  }

  const overview = (overviewData as OrderDeliveryOverviewRow | null) ?? null;
  if (!overview) return null;

  const logisticStatus =
    (orderData as { logistic_status?: string | null } | null)?.logistic_status ?? null;

  return {
    ...overview,
    delivery_status:
      overview.delivery_status === "OCORRENCIA"
        ? "OCORRENCIA"
        : mapLogisticToDeliveryStatus(logisticStatus),
  };
}

export async function updateOrderDeliveryFields(
  supabase: SupabaseClient,
  params: {
    orderId: string;
    deliveryStatus?: DeliveryStatus;
    driverName?: string | null;
    driverPhone?: string | null;
    deliveryStartedAt?: string | null;
    deliveryFinishedAt?: string | null;
    deliveryNotes?: string | null;
  }
) {
  const {
    orderId,
    deliveryStatus,
    driverName,
    driverPhone,
    deliveryStartedAt,
    deliveryFinishedAt,
    deliveryNotes,
  } = params;

  const payload: Record<string, unknown> = {};

  if (deliveryStatus !== undefined) {
    payload.delivery_status = deliveryStatus;

    const mappedLogisticStatus = mapDeliveryToLogisticStatus(deliveryStatus);
    if (mappedLogisticStatus) {
      payload.logistic_status = mappedLogisticStatus;
    }

    if (deliveryStatus === "ENTREGUE") {
      const now = new Date();
      const deadline = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      payload.delivered_at = now.toISOString();
      payload.delivery_dispute_deadline = deadline.toISOString();
      payload.delivery_confirmation_status = "AGUARDANDO_CONTESTACAO";

      // Vencimento automático: usa prazo padrão da loja a partir da data de entrega
      const { data: orderData } = await supabase
        .from("orders")
        .select("due_date,store_id")
        .eq("id", orderId)
        .single();

      if (!orderData?.due_date && orderData?.store_id) {
        const { data: storeData } = await supabase
          .from("stores")
          .select("default_payment_days")
          .eq("id", orderData.store_id)
          .single();

        const days = storeData?.default_payment_days ?? null;
        if (days != null && days > 0) {
          const due = new Date(now);
          due.setDate(due.getDate() + days);
          const ymd = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
          payload.due_date = ymd;
        }
      }
    }
  }

  if (driverName !== undefined) payload.delivery_driver_name = driverName;
  if (driverPhone !== undefined) payload.delivery_driver_phone = driverPhone;
  if (deliveryStartedAt !== undefined) {
    payload.delivery_started_at = deliveryStartedAt;
  }
  if (deliveryFinishedAt !== undefined) {
    payload.delivery_finished_at = deliveryFinishedAt;
  }
  if (deliveryNotes !== undefined) payload.delivery_notes = deliveryNotes;

  const { error } = await supabase
    .from("orders")
    .update(payload)
    .eq("id", orderId);

  if (error) {
    throw new Error(`Erro ao atualizar pedido logístico: ${error.message}`);
  }
}

export async function markOrderAsInSeparation(
  supabase: SupabaseClient,
  params: {
    orderId: string;
    driverName?: string | null;
    driverPhone?: string | null;
    deliveryNotes?: string | null;
  }
): Promise<void> {
  const { orderId, driverName, driverPhone, deliveryNotes } = params;

  await updateOrderDeliveryFields(supabase, {
    orderId,
    deliveryStatus: "EM_SEPARACAO",
    driverName,
    driverPhone,
    deliveryNotes,
  });
}

export async function startDeliveryFlow(
  supabase: SupabaseClient,
  params: {
    orderId: string;
    driverName?: string | null;
    driverPhone?: string | null;
    confirmationCodeLength?: number;
    confirmationExpiresInHours?: number;
    confirmationMaxAttempts?: number;
    deliveryNotes?: string | null;
  }
): Promise<StartDeliveryFlowResult> {
  const {
    orderId,
    driverName = null,
    driverPhone = null,
    confirmationCodeLength = 4,
    confirmationExpiresInHours = 6,
    confirmationMaxAttempts = 5,
    deliveryNotes = null,
  } = params;

  const startedAt = new Date().toISOString();

  await updateOrderDeliveryFields(supabase, {
    orderId,
    deliveryStatus: "SAIU_PARA_ENTREGA",
    driverName,
    driverPhone,
    deliveryStartedAt: startedAt,
    deliveryFinishedAt: null,
    deliveryNotes,
  });

  const trackingSession = await createTrackingSession(supabase, {
    orderId,
    driverName,
    driverPhone,
  });

  const confirmation = await createOrReplaceDeliveryConfirmation(supabase, {
    orderId,
    codeLength: confirmationCodeLength,
    expiresInHours: confirmationExpiresInHours,
    maxAttempts: confirmationMaxAttempts,
  });

  return {
    orderId,
    trackingSession,
    confirmation,
  };
}

export async function markOrderDeliveryOccurrence(
  supabase: SupabaseClient,
  params: {
    orderId: string;
    notes: string;
  }
): Promise<void> {
  await updateOrderDeliveryFields(supabase, {
    orderId: params.orderId,
    deliveryStatus: "OCORRENCIA",
    deliveryNotes: params.notes,
  });
}

export async function finalizeDeliveryByTokenAndCode(
  supabase: SupabaseClient,
  params: {
    token: string;
    code: string;
    confirmedBy?: string | null;
  }
): Promise<FinalizeDeliveryResult> {
  const { token, code, confirmedBy = "motorista" } = params;

  const session = await getTrackingSessionByToken(supabase, token);

  if (!session) {
    return {
      ok: false,
      reason: "SESSION_NOT_FOUND",
      message: "Sessão de entrega não encontrada.",
    };
  }

  if (session.status === "ENCERRADO") {
    return {
      ok: false,
      reason: "SESSION_ALREADY_ENDED",
      message: "Esta sessão já foi encerrada.",
    };
  }

  const validation = await validateDeliveryConfirmationCode(supabase, {
    orderId: session.order_id,
    code,
    confirmedBy,
  });

  if (!validation.ok) {
    return {
      ok: false,
      reason: validation.reason,
      message: validation.message,
      attempts: validation.attempts,
      maxAttempts: validation.maxAttempts,
    };
  }

  const finishedAt = new Date().toISOString();

  await updateOrderDeliveryFields(supabase, {
    orderId: session.order_id,
    deliveryStatus: "ENTREGUE",
    deliveryFinishedAt: finishedAt,
  });

  await endTrackingSessionByToken(supabase, token);

  return {
    ok: true,
    orderId: session.order_id,
    sessionId: session.id,
    confirmedAt: validation.confirmation.confirmed_at,
    finishedAt,
  };
}