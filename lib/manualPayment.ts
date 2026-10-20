import { supabase } from "@/lib/supabaseClient";

export type ManualPaymentPatch = {
  is_paid: boolean;
  paid_at: string | null;
  payment_method?: string | null;
};

export type ManualPaymentResult =
  | { ok: true; order: { id: string; is_paid: boolean | null; paid_at: string | null; payment_method: string | null } }
  | { ok: false; message: string };

/** Registra a baixa manual (ou o desfazer) no servidor, que confere a senha. */
export async function submitManualPayment(
  orderId: string,
  password: string,
  patch: ManualPaymentPatch
): Promise<ManualPaymentResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { ok: false, message: "Sessão expirada. Entre novamente." };

  try {
    const res = await fetch(`/api/adm/orders/${orderId}/manual-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password, ...patch }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, message: data.message || "Não foi possível registrar a baixa." };
    return { ok: true, order: data.order };
  } catch {
    return { ok: false, message: "Falha de conexão. Tente novamente." };
  }
}
