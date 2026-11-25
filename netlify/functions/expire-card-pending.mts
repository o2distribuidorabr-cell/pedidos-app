/**
 * Netlify Scheduled Function — expira pedidos de cartão não pagos em 15 min.
 *
 * Roda a cada 5 minutos e chama /api/orders/expire-card-pending, que cancela
 * pedidos "aguardando pagamento" no cartão fora do prazo e devolve o crédito
 * pré-pago que tinha sido usado neles. Idempotente. O segredo nunca é impresso.
 */
import type { Config } from "@netlify/functions";

export default async function handler() {
  const baseUrl = process.env.URL;
  const secret = process.env.INTERNAL_TRIGGER_SECRET;

  if (!baseUrl) throw new Error("expire-card-pending: URL não configurada.");
  if (!secret) throw new Error("expire-card-pending: INTERNAL_TRIGGER_SECRET não configurado.");

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/orders/expire-card-pending`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: "{}",
    });
  } catch (err) {
    console.error("[expire-card-pending] falha de rede:", err instanceof Error ? err.message : String(err));
    throw new Error("expire-card-pending: falha de rede ao chamar a API protegida.");
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // corpo pode não ser JSON em erro de infraestrutura — o status HTTP basta.
  }

  if (!res.ok) {
    console.error(`[expire-card-pending] API retornou status ${res.status}`, data);
    throw new Error(`expire-card-pending: API retornou status ${res.status}.`);
  }

  console.log("[expire-card-pending] concluído", { resultado: data });
  return new Response(JSON.stringify({ ok: true, resultado: data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const config: Config = {
  schedule: "*/5 * * * *", // a cada 5 minutos
};
