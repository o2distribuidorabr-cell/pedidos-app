/**
 * Netlify Scheduled Function — rede de segurança da integração
 * pedido -> nota fiscal no ab-portal.
 *
 * O gatilho notify_saiu_para_entrega (supabase/migrations/
 * fix_trigger_saiu_para_entrega_inclui_entregue.sql) dispara em tempo real
 * quando o pedido sai pra entrega OU é entregue. Mas essa chamada é
 * "dispara e esquece" (pg_net, assíncrono): se falhar — timeout do Netlify,
 * 5xx, cold start — a nota não chega e ninguém fica sabendo.
 *
 * Esta função roda de hora em hora e reprocessa os pedidos
 * SAIU_PARA_ENTREGA/ENTREGUE dos últimos JANELA_DIAS dias via
 * /api/orders/backfill-notas-portal. É idempotente: pedido que o ab-portal
 * já recebeu volta "DUPLICADO" e nada é duplicado (chave determinística por
 * pedido + trava por número+série no ab-portal). Assim qualquer disparo
 * perdido se corrige sozinho em no máximo ~1h.
 *
 * Mesmo cuidado de erro das scheduled functions do ab-portal: config
 * ausente lança antes de chamar a API; resposta não-2xx lança; o segredo
 * nunca é impresso.
 */
import type { Config } from "@netlify/functions";

const JANELA_DIAS = 3;

export default async function handler() {
  const baseUrl = process.env.URL;
  const secret = process.env.INTERNAL_TRIGGER_SECRET;

  if (!baseUrl) {
    console.error("[backfill-notas-portal] URL não definida — a função não pode chamar a API.");
    throw new Error("backfill-notas-portal: URL não configurada.");
  }
  if (!secret) {
    console.error("[backfill-notas-portal] INTERNAL_TRIGGER_SECRET não definido — a função não pode se autenticar na API.");
    throw new Error("backfill-notas-portal: INTERNAL_TRIGGER_SECRET não configurado.");
  }

  const fromDate = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/orders/backfill-notas-portal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        from_date: fromDate,
        status: ["SAIU_PARA_ENTREGA", "ENTREGUE"],
        limit: 500,
      }),
    });
  } catch (err) {
    console.error("[backfill-notas-portal] falha de rede ao chamar a API:", err instanceof Error ? err.message : String(err));
    throw new Error("backfill-notas-portal: falha de rede ao chamar a API protegida.");
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // corpo pode não ser JSON em erro de infraestrutura — o status HTTP já basta.
  }

  if (!res.ok) {
    console.error(`[backfill-notas-portal] API retornou status ${res.status}`, data);
    throw new Error(`backfill-notas-portal: API retornou status ${res.status}.`);
  }

  console.log("[backfill-notas-portal] concluído", { from_date: fromDate, resultado: data });
  return new Response(JSON.stringify({ ok: true, from_date: fromDate, resultado: data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const config: Config = {
  schedule: "0 * * * *", // toda hora, no minuto 0
};
