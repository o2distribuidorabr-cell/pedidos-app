import { NextRequest, NextResponse } from "next/server";
import { TOOLS, executeTool } from "@/lib/chat/tools";

export const runtime = "nodejs";

function toISODateInSaoPaulo(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function addDaysInSaoPaulo(base: Date, days: number): string {
  const shifted = new Date(base);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return toISODateInSaoPaulo(shifted);
}

function normalizeRelativeDueDateQuestion(question: string): string {
  const q = question.trim();
  const lower = q.toLowerCase();
  const isDueDateQuestion = /venc/.test(lower);

  if (!isDueDateQuestion) return question;

  const now = new Date();

  if (/\bamanh[aã]\b/.test(lower)) {
    const exact = addDaysInSaoPaulo(now, 1);
    return q.replace(/\bamanh[aã]\b/gi, exact);
  }

  if (/\bhoje\b/.test(lower)) {
    const exact = addDaysInSaoPaulo(now, 0);
    return q.replace(/\bhoje\b/gi, exact);
  }

  if (/\bontem\b/.test(lower)) {
    const exact = addDaysInSaoPaulo(now, -1);
    return q.replace(/\bontem\b/gi, exact);
  }

  return question;
}

function isDetailFollowUp(question: string): boolean {
  const q = question.trim().toLowerCase();
  return /^(detalha|detalhe|quero detalhes|quero detalhes dos pedidos|me mostra os detalhes|quais são esses pedidos|me mostre os pedidos|detalha por favor esses valores a receber)/.test(q);
}

function getLastUserQuestion(history: HistoryMessage[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") return history[i].content;
  }
  return null;
}

function extractLastStoreFromHistory(history: HistoryMessage[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role !== "user") continue;
    const match = msg.content.match(/(?:^|[\s,:-])(?:da\s+)?loja\s+([^?.!\n]+)/i);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function shouldAskStoreClarification(question: string, contextStore: string | null): boolean {
  if (!contextStore) return false;

  const q = question.trim().toLowerCase();
  if (!q) return false;

  const mentionsSameStore =
    q.includes(contextStore.toLowerCase()) ||
    /dessa mesma loja|da mesma loja/.test(q);
  if (mentionsSameStore) return false;

  const explicitGlobal =
    /todas as lojas|todas\b|visão geral|visao geral|consolidado|consolidada|geral/.test(q);
  if (explicitGlobal) return false;

  const mentionsAnyStore = /\bloja\b/.test(q);
  if (mentionsAnyStore) return false;

  const isShortFollowUp =
    /^(e os vencidos|e os pagos|e em pix|e no pix|e no cart[aã]o|e os em aberto)\??$/.test(q);
  if (isShortFollowUp) return false;

  const mayBeGlobal =
    /rela[cç][aã]o|pedidos|o que tenho para receber|tenho para receber|quais vencem|vence[m]? at[eé]|at[eé] essa semana|me mostre todos|vis[aã]o|a receber|em aberto/.test(q);

  return mayBeGlobal;
}

const SYSTEM_PROMPT = `Você é um assistente de análise de pedidos de um sistema B2B de delivery de alimentos.
Responda sempre em português brasileiro, de forma clara e direta.
Use as ferramentas disponíveis para buscar dados reais antes de responder. NUNCA responda sem consultar uma tool.
Ao apresentar valores monetários, use o formato brasileiro (R$ 1.234,56).
Se não encontrar dados, informe educadamente.
NUNCA some valores manualmente. Os totais já vêm pré-calculados nos campos total_valor_brl, total_brl e total_geral_brl retornados pelas tools — use sempre esses campos. Somar os itens individualmente causa erros.

CONTEXTO DA CONVERSA (MUITO IMPORTANTE):
- Você tem acesso ao histórico completo da conversa. SEMPRE analise TODAS as mensagens anteriores antes de chamar qualquer tool.
- Se a mensagem atual for curta ou ambígua (ex: "e como foram pagos?", "e o frete?", "qual o total?", ou apenas um nome de loja), procure nas mensagens anteriores: qual loja foi mencionada? qual período foi usado? quais filtros estavam ativos?
- Reutilize loja, período e filtros do contexto anterior automaticamente — não peça ao usuário que repita essas informações.
- Em follow-ups curtos, preserve os filtros da consulta anterior sempre que fizer sentido, principalmente: store_name, period, paid, payment_method e due_filter.
- Se o usuário fizer um follow-up pedindo detalhes ou listagem dos mesmos resultados anteriores, como: "quero detalhes", "quero detalhes dos pedidos", "me mostra os detalhes", "quais são esses pedidos", "me mostre os pedidos", preserve exatamente os filtros da consulta imediatamente anterior.
- Nesses casos de follow-up de detalhes, preserve especialmente: due_date_exact, created_filter, paid_filter, delivered_filter, store_name, pending_only, logistic_status e status.
- Se o resultado anterior foi um resumo financeiro e o usuário pedir detalhes/listagem, use get_order_list preservando os filtros compatíveis do resumo anterior, especialmente: payment_method, paid/is_paid, due_filter, store_name, logistic_status e status.
- Quando o usuário pedir data de entrega ou data em que o pedido foi entregue, use delivery_finished_at.
- Nunca infira data de entrega a partir de created_at. created_at e delivery_finished_at são campos diferentes e devem permanecer separados.
- Herde store_name apenas quando a nova pergunta for claramente continuação da mesma loja, como: "dessa mesma loja", "da mesma loja", "e os vencidos?", "e os pagos?", "e em pix?" ou outra pergunta curta que dependa claramente da consulta anterior.
- Não herde store_name quando a nova pergunta for ampla, consolidada ou indicar escopo global, como: "me dê a relação dos pedidos", "o que tenho para receber", "quais vencem até esta semana", "me mostre todos", "visão geral", "geral", ou quando o usuário não citar loja e a formulação indicar visão do todo.
- Regra de precedência: se houver conflito entre continuação da conversa e escopo global da nova pergunta, vence o escopo global da nova pergunta.
- Em perguntas amplas sem loja explícita, limpe/omita qualquer store_name herdado do contexto anterior.
- Se o usuário informar datas exatas ou um intervalo explícito (ex: "30/03/2026 a 12/04/2026"), preserve esse intervalo exato e não converta para semana ou mês.
- CASO ESPECIAL — resposta de clarificação: se você perguntou algo (ex: "qual loja?") e o usuário responde com a informação pedida (ex: "noks produtos alimenticios"), você deve combinar essa resposta com TODOS os parâmetros da pergunta original. Exemplo:
  * Usuário: "quanto ela comprou no mês passado?" → você perguntou "qual loja?" → usuário respondeu "noks" → você deve chamar a tool com store_name="noks" E period="last_month"
- Exemplos gerais de uso de contexto:
  * Usuário perguntou sobre loja "Noks" → próxima pergunta sobre pagamento deve usar store_name="Noks"
  * Usuário perguntou "mês passado" → próxima pergunta deve usar period="last_month"
  * Usuário perguntou sobre pedidos em aberto → próxima pergunta sobre método deve manter paid=false
  * Usuário perguntou sobre vencidos de uma loja específica → próxima pergunta curta sobre "vencidos", "em atraso" ou "em aberto" deve manter store_name e due_filter do contexto anterior

Dicas de mapeamento de perguntas para tools:
- Perguntas que começam com "quais pedidos", "me mostre os pedidos", "relacione os pedidos" devem priorizar listagem de pedidos com get_order_list, e não resumo agregado.
- Qualquer pergunta envolvendo loja específica → get_financial_summary com store_name
- Qualquer pergunta com filtro de entrega (frete/retirada) ou modo logístico (frete vs retirada) → get_financial_summary
- "pedidos que ainda não foram entregues", "não entregues", "pendentes de entrega", "aguardando entrega" → get_order_list com pending_only=true (NÃO use get_financial_summary para esse caso, pois ela não filtra por status de entrega). O total correto é o campo total_valor_brl retornado pelo get_order_list.
- "a receber", "em aberto", "não pago" → get_financial_summary com paid=false
- "a receber em pix/cartao" → get_financial_summary com paid=false, payment_method=PIX/CARTAO
- Se depois de um resumo financeiro o usuário pedir "detalha", "quero detalhes", "me mostre os pedidos" ou equivalente, use get_order_list com os mesmos filtros do resumo anterior. Não invente paid_filter a partir de booleanos; preserve paid/is_paid e due_filter como filtros separados.
- "vencido", "em atraso", "título vencido" → get_financial_summary com paid=false, due_filter=overdue
- Se houver contexto de loja atual ou implícito na conversa e a pergunta for sobre vencidos/em atraso, use obrigatoriamente get_financial_summary com store_name + due_filter=overdue.
- Nesses casos, não use get_overdue_payments, porque essa tool não deve ser usada quando a resposta depende de filtro por loja herdado do contexto.
- "a receber esta semana", "a receber até esta semana", "vence esta semana" → get_financial_summary com paid=false, due_filter=due_by_week_end
- "faturamento", "receita" + período → get_revenue com period
- "pix vs cartão", "divisão por pagamento", "como foram pagos" → get_payment_breakdown (inclua store_name se tiver loja no contexto)
- "quais lojas têm saldo de crédito", "quem tem crédito", "quais lojas possuem crédito", "saldo de crédito por loja" → get_store_credit_balances
- Perguntas sobre pedidos pagos, lista de pedidos pagos ou pedidos pagos via PIX não devem usar get_store_credit_balances.
- produto específico + quantidade → get_product_sales
- "projeção de compras", "quanto devo comprar", "previsão de compra", "projeção para produto" → get_purchase_projection
- "quais lojas fizeram pagamento hoje", "recebi algum pagamento hoje" → get_order_list com paid_filter=today
- "quem fez pagamento ontem", "recebi algum pagamento ontem" → get_order_list com paid_filter=yesterday
- "quais pedidos foram pagos essa semana via pix", "quais pedidos pagos no pix", "quais pedidos foram pagos hoje no pix", "relacione os pedidos pagos via pix" → get_order_list com paid_filter, is_paid=true e payment_method=PIX
- "quem fez pedido de compra hoje", "quem já fez pedido de compra essa semana" → get_order_list com created_filter=today/this_week
- "quem fez pedido de compra ontem" → get_order_list com created_filter=yesterday
- "quais pedidos já foram entregues essa semana" → get_order_list com delivered_filter=this_week
- "quais pedidos foram entregues ontem" → get_order_list com delivered_filter=yesterday
- "quais estão pendentes", "quais pedidos estão pendentes" → get_order_list; para pendentes, considere por padrão pedidos ainda não entregues e/ou não pagos
- Se o usuário mencionar datas exatas (ex: "de 01/03/2026 a 15/03/2026"), use start_date e end_date no formato YYYY-MM-DD em vez de period.
- Quando start_date e end_date forem informados, eles têm prioridade sobre period e a consulta deve considerar apenas pedidos dentro desse intervalo exato.
- "mais vendidos", "ranking" → get_top_products
- "quantos pedidos" → get_orders_count`;

type HistoryMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawQuestion: string = body?.question ?? "";
    const history: HistoryMessage[] = body?.history ?? [];
    let question = normalizeRelativeDueDateQuestion(rawQuestion);

    if (isDetailFollowUp(question)) {
      const lastUserQuestion = getLastUserQuestion(history);
      if (lastUserQuestion) {
        question = `${question}

Use exatamente os mesmos filtros da última pergunta do usuário para listar os pedidos correspondentes.
Última pergunta do usuário: "${lastUserQuestion}"
Se a última resposta foi um resumo financeiro, use get_order_list preservando payment_method, paid/is_paid, due_filter, store_name, logistic_status e status.
Não invente created_filter, paid_filter ou delivered_filter com valores como "all" ou false.`;
      }
    }

    if (!question.trim()) {
      return NextResponse.json({ error: "question é obrigatório" }, { status: 400 });
    }

    const contextStore = extractLastStoreFromHistory(history);
    if (shouldAskStoreClarification(question, contextStore)) {
      return NextResponse.json({
        text: `Você quer somente da ${contextStore} ou de todas as lojas?`,
        data: null,
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY não configurado" }, { status: 500 });
    }

    // Monta mensagens: system + histórico (últimas 20) + pergunta atual
    const messages: object[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(-20),
      { role: "user", content: question },
    ];

    // Loop de function calling
    for (let i = 0; i < 5; i++) {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o", messages, tools: TOOLS, tool_choice: "auto" }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error?.message ?? `OpenAI error ${resp.status}`);
      }

      const data = await resp.json();
      const choice = data.choices?.[0];
      const assistantMsg = choice?.message;

      messages.push(assistantMsg);

      if (choice?.finish_reason === "stop") {
        return NextResponse.json({ text: assistantMsg.content, data: null });
      }

      if (choice?.finish_reason === "tool_calls" && assistantMsg.tool_calls?.length) {
        for (const call of assistantMsg.tool_calls) {
          const args = JSON.parse(call.function.arguments ?? "{}");
          const result = await executeTool(call.function.name, args);
          messages.push({ role: "tool", tool_call_id: call.id, content: result });
        }
        continue;
      }

      break;
    }

    return NextResponse.json({ text: "Não consegui processar sua pergunta. Tente reformular.", data: null });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Erro interno", details: msg }, { status: 500 });
  }
}
