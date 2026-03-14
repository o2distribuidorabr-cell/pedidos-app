import { randomInt } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeliveryConfirmationRow,
  ValidateDeliveryCodeResult,
} from "@/lib/deliveryTypes";

function generateNumericCode(length: number): string {
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += String(randomInt(0, 10));
  }
  return result;
}

export function maskConfirmationCode(code: string | null | undefined): string {
  if (!code) return "";
  if (code.length <= 2) return "*".repeat(code.length);
  return `${code.slice(0, 2)}${"*".repeat(Math.max(0, code.length - 2))}`;
}

export async function getDeliveryConfirmationByOrderId(
  supabase: SupabaseClient,
  orderId: string
): Promise<DeliveryConfirmationRow | null> {
  const { data, error } = await supabase
    .from("delivery_confirmations")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erro ao buscar confirmação da entrega: ${error.message}`
    );
  }

  return (data as DeliveryConfirmationRow | null) ?? null;
}

export async function createOrReplaceDeliveryConfirmation(
  supabase: SupabaseClient,
  params: {
    orderId: string;
    codeLength?: number;
    expiresInHours?: number;
    maxAttempts?: number;
  }
): Promise<DeliveryConfirmationRow> {
  const {
    orderId,
    codeLength = 4,
    expiresInHours = 6,
    maxAttempts = 5,
  } = params;

  const code = generateNumericCode(codeLength);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000);

  const existing = await getDeliveryConfirmationByOrderId(supabase, orderId);

  if (existing) {
    const { data, error } = await supabase
      .from("delivery_confirmations")
      .update({
        confirmation_code: code,
        status: "PENDENTE",
        attempts: 0,
        max_attempts: maxAttempts,
        code_sent_at: now.toISOString(),
        code_expires_at: expiresAt.toISOString(),
        confirmed_at: null,
        confirmed_by: null,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      throw new Error(
        `Erro ao atualizar código de confirmação: ${error.message}`
      );
    }

    return data as DeliveryConfirmationRow;
  }

  const { data, error } = await supabase
    .from("delivery_confirmations")
    .insert({
      order_id: orderId,
      confirmation_code: code,
      status: "PENDENTE",
      attempts: 0,
      max_attempts: maxAttempts,
      code_sent_at: now.toISOString(),
      code_expires_at: expiresAt.toISOString(),
      confirmed_at: null,
      confirmed_by: null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Erro ao criar código de confirmação: ${error.message}`
    );
  }

  return data as DeliveryConfirmationRow;
}

export async function validateDeliveryConfirmationCode(
  supabase: SupabaseClient,
  params: {
    orderId: string;
    code: string;
    confirmedBy?: string | null;
  }
): Promise<ValidateDeliveryCodeResult> {
  const { orderId, code, confirmedBy = null } = params;

  const confirmation = await getDeliveryConfirmationByOrderId(supabase, orderId);

  if (!confirmation) {
    return {
      ok: false,
      reason: "NOT_FOUND",
      message: "Confirmação de entrega não encontrada para este pedido.",
    };
  }

  if (confirmation.status === "CONFIRMADO") {
    return {
      ok: false,
      reason: "ALREADY_CONFIRMED",
      message: "Esta entrega já foi confirmada anteriormente.",
      confirmation,
    };
  }

  if (confirmation.status === "BLOQUEADO") {
    return {
      ok: false,
      reason: "BLOCKED",
      message: "Código bloqueado por excesso de tentativas.",
      attempts: confirmation.attempts,
      maxAttempts: confirmation.max_attempts,
      confirmation,
    };
  }

  const now = new Date();

  if (
    confirmation.code_expires_at &&
    new Date(confirmation.code_expires_at).getTime() < now.getTime()
  ) {
    const { data, error } = await supabase
      .from("delivery_confirmations")
      .update({
        status: "EXPIRADO",
      })
      .eq("id", confirmation.id)
      .select("*")
      .single();

    if (error) {
      throw new Error(
        `Erro ao marcar código como expirado: ${error.message}`
      );
    }

    return {
      ok: false,
      reason: "EXPIRED",
      message: "O código de confirmação expirou.",
      confirmation: data as DeliveryConfirmationRow,
    };
  }

  if (confirmation.confirmation_code !== code) {
    const nextAttempts = confirmation.attempts + 1;
    const blocked = nextAttempts >= confirmation.max_attempts;

    const { data, error } = await supabase
      .from("delivery_confirmations")
      .update({
        attempts: nextAttempts,
        status: blocked ? "BLOQUEADO" : confirmation.status,
      })
      .eq("id", confirmation.id)
      .select("*")
      .single();

    if (error) {
      throw new Error(
        `Erro ao registrar tentativa inválida: ${error.message}`
      );
    }

    return {
      ok: false,
      reason: "INVALID_CODE",
      message: blocked
        ? "Código inválido. Limite de tentativas atingido e entrega bloqueada."
        : "Código inválido.",
      attempts: nextAttempts,
      maxAttempts: confirmation.max_attempts,
      blocked,
      confirmation: data as DeliveryConfirmationRow,
    };
  }

  const { data, error } = await supabase
    .from("delivery_confirmations")
    .update({
      status: "CONFIRMADO",
      confirmed_at: now.toISOString(),
      confirmed_by: confirmedBy,
    })
    .eq("id", confirmation.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Erro ao confirmar código de entrega: ${error.message}`
    );
  }

  return {
    ok: true,
    confirmation: data as DeliveryConfirmationRow,
  };
}