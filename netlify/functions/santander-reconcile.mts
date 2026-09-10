/**
 * Netlify Scheduled Function — rede de segurança da confirmação PIX Santander.
 *
 * Diferente de Asaas/MP, o PIX Santander depende do webhook
 * (app/api/santander/webhook) para dar baixa automática. Se o webhook falhar
 * (timeout, 5xx, cold start) ou ainda não estiver registrado, o pagamento
 * fica sem confirmar. Esta função roda a cada 10 min e chama
 * /api/santander/reconcile, que reconsulta cada cobrança pendente direto na
 * API do Santander e baixa as que já foram pagas.
 *
 * Idempotente: pedido já pago é ignorado. O segredo nunca é impresso.
 */
import type { Config } from "@netlify/functions";

const JANELA_DIAS = 30;

export default async function handler() {
  const baseUrl = process.env.URL;
  const secret = process.env.INTERNAL_TRIGGER_SECRET;

  if (!baseUrl) {
    console.error("[santander-reconcile] URL não definida — a função não pode chamar a API.");
    throw new Error("santander-reconcile: URL não configurada.");
  }
  if (!secret) {
    console.error("[santander-reconcile] INTERNAL_TRIGGER_SECRET não definido — a função não pode se autenticar.");
    throw new Error("santander-reconcile: INTERNAL_TRIGGER_SECRET não configurado.");
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/santander/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ days: JANELA_DIAS, limit: 500 }),
    });
  } catch (err) {
    console.error(
      "[santander-reconcile] falha de rede ao chamar a API:",
      err instanceof Error ? err.message : String(err),
    );
    throw new Error("santander-reconcile: falha de rede ao chamar a API protegida.");
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // corpo pode não ser JSON em erro de infraestrutura — o status HTTP já basta.
  }

  if (!res.ok) {
    console.error(`[santander-reconcile] API retornou status ${res.status}`, data);
    throw new Error(`santander-reconcile: API retornou status ${res.status}.`);
  }

  console.log("[santander-reconcile] concluído", { resultado: data });
  return new Response(JSON.stringify({ ok: true, resultado: data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const config: Config = {
  schedule: "*/10 * * * *", // a cada 10 minutos
};
