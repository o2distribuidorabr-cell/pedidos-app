import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ─── helpers de data ─────────────────────────────────────────────────────────

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  x.setHours(0, 0, 0, 0);
  return x;
}

function getPeriodRange(period: string): { startTS: string; endTS: string; label: string } {
  const now = new Date();

  if (period === "this_week") {
    const s = startOfWeek(now);
    const e = new Date(s); e.setDate(s.getDate() + 7);
    return { startTS: `${toISODate(s)}T00:00:00`, endTS: `${toISODate(e)}T00:00:00`, label: `semana atual (${toISODate(s)} a ${toISODate(new Date(e.getTime() - 1))})` };
  }
  if (period === "last_week") {
    const s = startOfWeek(new Date(now.getTime() - 7 * 86400000));
    const e = new Date(s); e.setDate(s.getDate() + 7);
    return { startTS: `${toISODate(s)}T00:00:00`, endTS: `${toISODate(e)}T00:00:00`, label: `semana passada (${toISODate(s)} a ${toISODate(new Date(e.getTime() - 1))})` };
  }
  if (period === "this_month") {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { startTS: `${toISODate(s)}T00:00:00`, endTS: `${toISODate(e)}T00:00:00`, label: `mês atual (${toISODate(s)})` };
  }
  if (period === "last_month") {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const e = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startTS: `${toISODate(s)}T00:00:00`, endTS: `${toISODate(e)}T00:00:00`, label: `mês passado (${toISODate(s)})` };
  }
  throw new Error(`Período inválido: ${period}`);
}

// ─── helpers compartilhados ───────────────────────────────────────────────────

const near = (a: number, b: number) => Math.abs((Number(a) || 0) - (Number(b) || 0)) <= 0.01;

function daysBetween(d1: string, d2: string) {
  return Math.max(Math.floor((new Date(d2).getTime() - new Date(d1).getTime()) / 86400000), 1);
}

function getDateFilterRange(filter: string): { startTS: string; endTS: string; label: string } {
  const now = new Date();

  if (filter === "today") {
    const s = new Date(now);
    s.setHours(0, 0, 0, 0);
    const e = new Date(s);
    e.setDate(e.getDate() + 1);
    return {
      startTS: `${toISODate(s)}T00:00:00`,
      endTS: `${toISODate(e)}T00:00:00`,
      label: `hoje (${toISODate(s)})`,
    };
  }

  if (filter === "yesterday") {
    const s = new Date(now);
    s.setHours(0, 0, 0, 0);
    s.setDate(s.getDate() - 1);
    const e = new Date(s);
    e.setDate(e.getDate() + 1);
    return {
      startTS: `${toISODate(s)}T00:00:00`,
      endTS: `${toISODate(e)}T00:00:00`,
      label: `ontem (${toISODate(s)})`,
    };
  }

  if (filter === "this_week" || filter === "last_week") {
    return getPeriodRange(filter);
  }

  throw new Error(`Filtro de data inválido: ${filter}`);
}

function isValidDateFilter(value: unknown): value is "today" | "yesterday" | "this_week" | "last_week" {
  return value === "today" || value === "yesterday" || value === "this_week" || value === "last_week";
}

async function getFinanceSettings() {
  const { data } = await supabaseAdmin
    .from("finance_settings")
    .select("apply_late_charges,late_fee_percent,daily_interest_percent")
    .eq("id", 1).maybeSingle();
  return {
    aplicar: !!(data?.apply_late_charges ?? true),
    multaPct: Math.min(Math.max(Number(data?.late_fee_percent ?? 0), 0), 100) / 100,
    jurosDiaPct: Math.min(Math.max(Number(data?.daily_interest_percent ?? 0), 0), 100) / 100,
  };
}

// ─── definição das tools para o OpenAI ───────────────────────────────────────

export const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_revenue",
      description:
        "Retorna o faturamento/receita total de pedidos. Use para: faturamento por período, valor a receber (paid=false), valor já pago (paid=true). Para 'valor a receber' ou 'em aberto', SEMPRE use paid=false — o período será ignorado automaticamente.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["all", "this_week", "last_week", "this_month", "last_month"],
            description: "Período pela data de submissão. Use 'all' quando paid=false (valor a receber não tem restrição de data). this_week=semana atual, last_week=semana passada, this_month=mês atual, last_month=mês passado",
          },
          paid: {
            type: "boolean",
            description: "true=apenas pagos, false=apenas não pagos (a receber). Omitir = todos.",
          },
          payment_method: {
            type: "string",
            description: "Filtrar por método de pagamento específico (ex: pix, cartao). Omitir = todos.",
          },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_payment_breakdown",
      description:
        "Retorna o faturamento e número de pedidos agrupados por método de pagamento (pix, cartão, etc) num período. Use quando a pergunta pedir comparação ou divisão por forma de pagamento. Também aceita filtro por loja — use quando o contexto mencionar uma loja específica.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["all", "this_week", "last_week", "this_month", "last_month"],
            description: "Período de tempo. Use 'all' quando não houver período definido.",
          },
          store_name: {
            type: "string",
            description: "Nome ou parte do nome da loja para filtrar. Omitir = todas as lojas. IMPORTANTE: se o contexto da conversa menciona uma loja específica, inclua aqui.",
          },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_product_sales",
      description:
        "Retorna a quantidade total vendida de um produto num período. Use quando a pergunta mencionar um produto específico. Se o usuário informar datas exatas, use start_date e end_date (prioridade sobre period).",
      parameters: {
        type: "object",
        properties: {
          product_name: {
            type: "string",
            description: "Nome ou parte do nome do produto a buscar",
          },
          period: {
            type: "string",
            enum: ["this_week", "last_week", "this_month", "last_month"],
            description: "Período predefinido. Ignorado se start_date e end_date forem fornecidos.",
          },
          start_date: {
            type: "string",
            description: "Data inicial exata no formato YYYY-MM-DD. Use junto com end_date quando o usuário informar datas específicas.",
          },
          end_date: {
            type: "string",
            description: "Data final exata no formato YYYY-MM-DD (inclusiva). Use junto com start_date quando o usuário informar datas específicas.",
          },
        },
        required: ["product_name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_purchase_projection",
      description:
        "Calcula projeção de compras por produto a partir das vendas no intervalo informado. Use para perguntas como: projeção de compras, quanto devo comprar, previsão de compra, projeção para produto.",
      parameters: {
        type: "object",
        properties: {
          product_name: {
            type: "string",
            description: "Nome ou parte do nome do produto a buscar",
          },
          start_date: {
            type: "string",
            description: "Data inicial exata no formato YYYY-MM-DD.",
          },
          end_date: {
            type: "string",
            description: "Data final exata no formato YYYY-MM-DD (inclusiva).",
          },
          group_by: {
            type: "string",
            enum: ["week"],
            description: "Agrupamento da projeção. Padrão: week.",
          },
        },
        required: ["product_name", "start_date", "end_date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_order_list",
      description:
        "Lista pedidos com filtros operacionais por evento e período. Use para perguntas como: quais lojas fizeram pagamento hoje, recebi algum pagamento hoje, quem fez pedido de compra hoje, quem já fez pedido de compra essa semana, quais pedidos já foram entregues essa semana, quais estão pendentes.",
      parameters: {
        type: "object",
        properties: {
          created_filter: {
            type: "string",
            enum: ["today", "yesterday", "this_week", "last_week"],
            description: "Filtra pela data de criação do pedido.",
          },
          paid_filter: {
            type: "string",
            enum: ["today", "yesterday", "this_week", "last_week"],
            description: "Filtra pela data de pagamento (paid_at).",
          },
          delivered_filter: {
            type: "string",
            enum: ["today", "yesterday", "this_week", "last_week"],
            description: "Filtra pela data de entrega (delivery_finished_at).",
          },
          due_date_exact: {
            type: "string",
            description: "Filtra pedidos com due_date exatamente igual à data informada no formato YYYY-MM-DD.",
          },
          store_name: {
            type: "string",
            description: "Nome ou parte do nome da loja para filtrar. Omitir = todas as lojas.",
          },
          is_paid: {
            type: "boolean",
            description: "true=apenas pagos, false=apenas não pagos. Omitir = todos.",
          },
          payment_method: {
            type: "string",
            enum: ["PIX", "CARTAO", "BOLETO", "all"],
            description: "Forma de pagamento. Omitir = todas.",
          },
          due_filter: {
            type: "string",
            enum: ["overdue", "due_soon", "today", "future", "due_by_week_end", "with_due", "no_due", "all"],
            description: "Filtro por vencimento: overdue=vencidos, due_soon=vence em 3 dias, today=vence hoje, future=vence no futuro, due_by_week_end=vencidos+hoje+a vencer até fim da semana, with_due=com vencimento, no_due=sem vencimento.",
          },
          logistic_status: {
            type: "string",
            enum: ["RECEBIDO", "EM_SEPARACAO", "SAIU_PARA_ENTREGA", "ENTREGUE", "all"],
            description: "Status logístico. Omitir = todos.",
          },
          status: {
            type: "string",
            enum: ["submitted", "approved", "all"],
            description: "Status do pedido. Padrão: submitted e approved.",
          },
          pending_only: {
            type: "boolean",
            description: "Quando true, considera como pendentes pedidos ainda não entregues e/ou não pagos.",
          },
          limit: {
            type: "number",
            description: "Quantidade máxima de pedidos retornados. Padrão: 20.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_orders_count",
      description:
        "Retorna o número de pedidos num período. Use para perguntas sobre quantos pedidos, volume de pedidos.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["this_week", "last_week", "this_month", "last_month"],
            description: "Período de tempo",
          },
          status: {
            type: "string",
            enum: ["submitted", "approved", "all"],
            description: "Filtro de status. Padrão: all",
          },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_overdue_payments",
      description:
        "Retorna pedidos com pagamento em atraso/vencido: due_date já passou e ainda não foram pagos. Use para perguntas sobre atraso, vencimento, títulos vencidos, inadimplência, pagamentos atrasados. O valor já desconta crédito abatido.",
      parameters: {
        type: "object",
        properties: {
          payment_method: {
            type: "string",
            description: "Filtrar por método de pagamento (ex: pix, cartao). Omitir = todos.",
          },
          include_details: {
            type: "boolean",
            description: "true = inclui lista de pedidos vencidos com loja e valor. Padrão false.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_top_products",
      description:
        "Retorna os produtos mais vendidos em quantidade num período. Use para perguntas sobre ranking, top produtos, o que mais vendeu.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["this_week", "last_week", "this_month", "last_month"],
            description: "Período de tempo",
          },
          limit: {
            type: "number",
            description: "Quantos produtos retornar (padrão 5)",
          },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_store_credit_balances",
      description:
        "Lista as lojas que possuem saldo de crédito maior que zero. Use para perguntas como: quais lojas têm saldo de crédito, quem tem crédito, quais lojas possuem crédito, saldo de crédito por loja.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_financial_summary",
      description:
        "Resumo financeiro completo com os mesmos filtros da página financeiro. Use para perguntas que envolvam loja específica, status logístico, modo de entrega, vencimento ou qualquer combinação de filtros. Retorna: total, a pagar, pago, em aberto, vencidos.",
      parameters: {
        type: "object",
        properties: {
          store_name: { type: "string", description: "Nome ou parte do nome da loja. Omitir = todas." },
          status: { type: "string", enum: ["submitted", "approved", "all"], description: "Status do pedido. Padrão: submitted e approved." },
          logistic_status: { type: "string", enum: ["RECEBIDO", "EM_SEPARACAO", "SAIU_PARA_ENTREGA", "ENTREGUE", "all"], description: "Status logístico. Omitir = todos." },
          delivery_mode: { type: "string", enum: ["FRETE", "RETIRADA", "all"], description: "Modo de entrega. Omitir = todos." },
          paid: { type: "boolean", description: "true=apenas pagos, false=apenas não pagos. Omitir = todos." },
          payment_method: { type: "string", enum: ["PIX", "CARTAO", "BOLETO", "all"], description: "Forma de pagamento. Omitir = todas." },
          period: { type: "string", enum: ["all", "this_week", "last_week", "this_month", "last_month"], description: "Período por data de criação. Padrão: all." },
          due_filter: { type: "string", enum: ["overdue", "due_soon", "today", "future", "due_by_week_end", "with_due", "no_due", "all"], description: "Filtro por vencimento: overdue=vencidos, due_soon=vence em 3 dias, today=vence hoje, future=vence no futuro, due_by_week_end=vencidos+hoje+a vencer até fim da semana (use para 'a receber esta semana'), with_due=com vencimento, no_due=sem vencimento." },
        },
        required: [],
      },
    },
  },
];

// ─── implementação das tools ──────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "de","do","da","dos","das","o","a","os","as","e","em","com","para","por","um","uma","g","kg",
]);

type StoreResult =
  | { ok: true; ids: string[]; names: string[] }
  | { ok: false; ambiguous: true; matches: string[] }
  | { ok: false; ambiguous: false };

async function findStores(storeName: string): Promise<StoreResult> {
  type Row = { id: string; name: string };

  // 1) Tenta match exato da frase completa
  const { data: exact } = await supabaseAdmin
    .from("stores").select("id,name").ilike("name", `%${storeName}%`);

  if (exact?.length === 1) {
    return { ok: true, ids: [exact[0].id], names: [exact[0].name] };
  }

  if ((exact?.length ?? 0) > 1) {
    // Tenta match mais restrito: AND de todas as palavras significativas
    const words = storeName.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    if (words.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = supabaseAdmin.from("stores").select("id,name");
      for (const w of words) q = q.ilike("name", `%${w}%`);
      const { data: andResult } = await q;
      if (andResult?.length === 1) {
        return { ok: true, ids: [andResult[0].id], names: [andResult[0].name] };
      }
      if ((andResult?.length ?? 0) > 1) {
        return { ok: false, ambiguous: true, matches: (andResult as Row[]).map((r) => r.name) };
      }
    }
    return { ok: false, ambiguous: true, matches: (exact as Row[]).map((r) => r.name) };
  }

  return { ok: false, ambiguous: false };
}

async function findProductIds(productName: string): Promise<{ ids: string[]; names: string[] }> {
  type Row = { id: string; name: string };

  const { data: exact } = await supabaseAdmin.from("products").select("id,name").ilike("name", `%${productName}%`);
  if (exact?.length) return { ids: exact.map((r: Row) => r.id), names: exact.map((r: Row) => r.name) };

  const words = productName.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  if (!words.length) return { ids: [], names: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabaseAdmin.from("products").select("id,name");
  for (const w of words) q = q.ilike("name", `%${w}%`);
  const { data: andResult } = await q;
  if (andResult?.length) return { ids: andResult.map((r: Row) => r.id), names: andResult.map((r: Row) => r.name) };

  const { data: orResult } = await supabaseAdmin
    .from("products").select("id,name")
    .or(words.map((w) => `name.ilike.%${w}%`).join(","));
  return { ids: (orResult ?? []).map((r: Row) => r.id), names: (orResult ?? []).map((r: Row) => r.name) };
}

export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  // ── get_revenue ────────────────────────────────────────────────────────────
  if (name === "get_revenue") {
    // Quando paid=false (a receber), data de criação não importa — ignora período
    const period = (args.paid === false) ? "all" : String(args.period ?? "all");
    const isAll = period === "all";
    const { startTS, endTS, label } = isAll
      ? { startTS: null, endTS: null, label: args.paid === false ? "em aberto" : "todos os períodos" }
      : getPeriodRange(period);

    let q = supabaseAdmin
      .from("orders")
      .select("id, freight_fee, order_items(qty, unit_cost)")
      .in("status", ["submitted", "approved"]);

    if (!isAll) {
      q = q.not("submitted_at", "is", null).gte("submitted_at", startTS!).lt("submitted_at", endTS!);
    }

    if (args.paid === true) q = q.eq("is_paid", true);
    if (args.paid === false) q = q.eq("is_paid", false);
    if (args.payment_method) q = q.ilike("payment_method", `%${args.payment_method}%`);

    const { data, error } = await q;
    if (error) return JSON.stringify({ error: error.message });

    type Row = { id: string; freight_fee: number | null; order_items: { qty: number; unit_cost: number }[] };
    let total = 0;
    for (const order of (data as Row[] ?? [])) {
      total += (order.order_items ?? []).reduce((s, i) => s + i.qty * i.unit_cost, 0) + (order.freight_fee ?? 0);
    }

    return JSON.stringify({ periodo: label, total_brl: brl.format(total), total_num: total, pedidos: data?.length ?? 0 });
  }

  // ── get_payment_breakdown ──────────────────────────────────────────────────
  if (name === "get_payment_breakdown") {
    const period = String(args.period ?? "all");
    const isAll = period === "all";
    const { startTS, endTS, label } = isAll
      ? { startTS: null, endTS: null, label: "todos os períodos" }
      : getPeriodRange(period);

    // Resolve store filter
    let storeIds: string[] | null = null;
    if (args.store_name) {
      const storeResult = await findStores(String(args.store_name));
      if (!storeResult.ok) {
        if (storeResult.ambiguous)
          return JSON.stringify({ erro: `Encontrei ${storeResult.matches.length} lojas com esse nome. Qual você quer dizer? ${storeResult.matches.join(" / ")}` });
        return JSON.stringify({ erro: `Loja "${args.store_name}" não encontrada.` });
      }
      storeIds = storeResult.ids;
    }

    let q = supabaseAdmin
      .from("orders")
      .select("id, freight_fee, payment_method, order_items(qty, unit_cost)")
      .in("status", ["submitted", "approved"]);

    if (!isAll) {
      q = q.not("submitted_at", "is", null).gte("submitted_at", startTS!).lt("submitted_at", endTS!);
    }

    if (storeIds) q = q.in("store_id", storeIds);

    const { data, error } = await q;

    if (error) return JSON.stringify({ error: error.message });

    type Row = { id: string; freight_fee: number | null; payment_method: string | null; order_items: { qty: number; unit_cost: number }[] };

    const map = new Map<string, { total: number; pedidos: number }>();
    for (const order of (data as Row[] ?? [])) {
      const method = order.payment_method?.toLowerCase() || "não informado";
      const orderTotal = (order.order_items ?? []).reduce((s, i) => s + i.qty * i.unit_cost, 0) + (order.freight_fee ?? 0);
      const cur = map.get(method) ?? { total: 0, pedidos: 0 };
      cur.total += orderTotal;
      cur.pedidos += 1;
      map.set(method, cur);
    }

    const breakdown = Array.from(map.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .map(([method, v]) => ({ metodo: method, total_brl: brl.format(v.total), total_num: v.total, pedidos: v.pedidos }));

    const grandTotal = breakdown.reduce((s, r) => s + r.total_num, 0);

    return JSON.stringify({ periodo: label, total_geral_brl: brl.format(grandTotal), breakdown });
  }

  // ── get_product_sales ──────────────────────────────────────────────────────
  if (name === "get_product_sales") {
    let startTS: string, endTS: string, label: string;
    if (args.start_date && args.end_date) {
      startTS = `${args.start_date}T00:00:00`;
      // end_date é inclusivo: avança um dia para usar .lt()
      const end = new Date(String(args.end_date));
      end.setDate(end.getDate() + 1);
      endTS = `${toISODate(end)}T00:00:00`;
      label = `${args.start_date} a ${args.end_date}`;
    } else {
      if (!args.period) {
        return JSON.stringify({ erro: "Informe period ou start_date e end_date para consultar vendas do produto." });
      }
      ({ startTS, endTS, label } = getPeriodRange(String(args.period)));
    }

    const { ids, names } = await findProductIds(String(args.product_name));

    if (!ids.length) return JSON.stringify({ erro: `Produto "${args.product_name}" não encontrado no cadastro.` });

    const { data: orders } = await supabaseAdmin
      .from("orders").select("id")
      .in("status", ["submitted", "approved"])
      .not("submitted_at", "is", null)
      .gte("submitted_at", startTS).lt("submitted_at", endTS);

    const orderIds = (orders ?? []).map((o: { id: string }) => o.id);
    if (!orderIds.length) return JSON.stringify({ periodo: label, produtos: names, total_qty: 0 });

    const { data: items, error } = await supabaseAdmin
      .from("order_items").select("qty, product_id")
      .in("order_id", orderIds).in("product_id", ids);

    if (error) return JSON.stringify({ error: error.message });

    const totalQty = (items ?? []).reduce((s: number, i: { qty: number }) => s + i.qty, 0);
    return JSON.stringify({ periodo: label, produtos_encontrados: names, total_qty: totalQty });
  }

  // ── get_orders_count ───────────────────────────────────────────────────────
  // ── get_purchase_projection ───────────────────────────────────────────────
  if (name === "get_purchase_projection") {
    const startDate = String(args.start_date ?? "");
    const endDate = String(args.end_date ?? "");
    const groupBy = String(args.group_by ?? "week");

    const startTS = `${startDate}T00:00:00`;
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1);
    const endTS = `${toISODate(end)}T00:00:00`;

    const { ids, names } = await findProductIds(String(args.product_name));
    if (!ids.length) {
      return JSON.stringify({ erro: `Produto "${args.product_name}" não encontrado no cadastro.` });
    }

    const { data: orders } = await supabaseAdmin
      .from("orders").select("id")
      .in("status", ["submitted", "approved"])
      .not("submitted_at", "is", null)
      .gte("submitted_at", startTS).lt("submitted_at", endTS);

    const orderIds = (orders ?? []).map((o: { id: string }) => o.id);
    if (!orderIds.length) {
      return JSON.stringify({
        produto: names[0] ?? String(args.product_name),
        produtos_encontrados: names,
        start_date: startDate,
        end_date: endDate,
        group_by: groupBy,
        total_vendido: 0,
        semanas_analisadas: 0,
        media_semanal: 0,
        sugestao_compra: 0,
      });
    }

    const { data: items, error } = await supabaseAdmin
      .from("order_items").select("qty, product_id")
      .in("order_id", orderIds).in("product_id", ids);

    if (error) return JSON.stringify({ error: error.message });

    const totalVendido = (items ?? []).reduce((s: number, i: { qty: number }) => s + i.qty, 0);
    const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
    const totalDays = Math.max(Math.floor(diffMs / 86400000) + 1, 1);
    const semanasAnalisadas = Number((totalDays / 7).toFixed(2));
    const mediaSemanal = semanasAnalisadas > 0 ? Number((totalVendido / semanasAnalisadas).toFixed(2)) : 0;
    const sugestaoCompra = Math.ceil(mediaSemanal);

    return JSON.stringify({
      produto: names[0] ?? String(args.product_name),
      produtos_encontrados: names,
      start_date: startDate,
      end_date: endDate,
      group_by: groupBy,
      total_vendido: totalVendido,
      semanas_analisadas: semanasAnalisadas,
      media_semanal: mediaSemanal,
      sugestao_compra: sugestaoCompra,
    });
  }

  // ── get_order_list ────────────────────────────────────────────────────────
  if (name === "get_order_list") {
    let storeIds: string[] | null = null;
    if (args.store_name) {
      const storeResult = await findStores(String(args.store_name));
      if (!storeResult.ok) {
        if (storeResult.ambiguous) {
          return JSON.stringify({ erro: `Encontrei ${storeResult.matches.length} lojas com esse nome. Qual você quer dizer? ${storeResult.matches.join(" / ")}` });
        }
        return JSON.stringify({ erro: `Loja "${args.store_name}" não encontrada.` });
      }
      storeIds = storeResult.ids;
    }

    let q = supabaseAdmin
      .from("orders")
      .select("id,store_id,created_at,paid_at,due_date,status,logistic_status,payment_method,is_paid,freight_fee,delivery_finished_at,stores(name)")
      .order("created_at", { ascending: false });

    if (storeIds) q = q.in("store_id", storeIds);

    const status = String(args.status ?? "all");
    if (status !== "all") q = q.eq("status", status);
    else q = q.in("status", ["submitted", "approved"]);

    if (args.is_paid === true) q = q.eq("is_paid", true);
    if (args.is_paid === false) q = q.or("is_paid.is.null,is_paid.eq.false");

    if (args.payment_method && args.payment_method !== "all") {
      q = q.eq("payment_method", args.payment_method);
    }

    if (args.logistic_status && args.logistic_status !== "all") {
      q = q.eq("logistic_status", args.logistic_status);
    }

    if (isValidDateFilter(args.created_filter)) {
      const { startTS, endTS } = getDateFilterRange(args.created_filter);
      q = q.gte("created_at", startTS).lt("created_at", endTS);
    }

    if (isValidDateFilter(args.paid_filter)) {
      const { startTS, endTS } = getDateFilterRange(args.paid_filter);
      q = q.not("paid_at", "is", null).gte("paid_at", startTS).lt("paid_at", endTS);
    }

    if (isValidDateFilter(args.delivered_filter)) {
      const { startTS, endTS } = getDateFilterRange(args.delivered_filter);
      q = q.eq("logistic_status", "ENTREGUE").not("delivery_finished_at", "is", null).gte("delivery_finished_at", startTS).lt("delivery_finished_at", endTS);
    }

    if (args.due_date_exact) {
      q = q.eq("due_date", String(args.due_date_exact));
    }

    const rawLimit = Number(args.limit ?? 20);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 20;
    q = q.limit(limit);

    const { data, error } = await q;
    if (error) return JSON.stringify({ error: error.message });

    type OrderListRow = {
      id: string;
      store_id: string;
      created_at: string | null;
      paid_at: string | null;
      due_date: string | null;
      status: string | null;
      logistic_status: string | null;
      payment_method: string | null;
      is_paid: boolean | null;
      freight_fee: number | null;
      delivery_finished_at: string | null;
      stores: { name: string }[] | null;
    };

    let orders = (data ?? []) as OrderListRow[];

    const today = toISODate(new Date());
    const dueFilter = String(args.due_filter ?? "all");
    if (dueFilter === "no_due") {
      orders = orders.filter((o) => !o.due_date);
    } else if (dueFilter === "overdue") {
      orders = orders.filter((o) => !o.is_paid && !!o.due_date && o.due_date < today);
    } else if (dueFilter === "due_soon") {
      const soonLimit = toISODate(new Date(Date.now() + 3 * 86400000));
      orders = orders.filter((o) => !o.is_paid && !!o.due_date && o.due_date >= today && o.due_date <= soonLimit);
    } else if (dueFilter === "today") {
      orders = orders.filter((o) => !!o.due_date && o.due_date === today);
    } else if (dueFilter === "future") {
      orders = orders.filter((o) => !!o.due_date && o.due_date > today);
    } else if (dueFilter === "due_by_week_end") {
      const endOfWeek = toISODate(new Date(startOfWeek(new Date()).getTime() + 6 * 86400000));
      orders = orders.filter((o) => !o.is_paid && !!o.due_date && o.due_date <= endOfWeek);
    } else if (dueFilter === "with_due") {
      orders = orders.filter((o) => !!o.due_date);
    }

    if (args.pending_only === true) {
      orders = orders.filter((o) => o.logistic_status !== "ENTREGUE" || !o.is_paid);
    }

    const orderIds = orders.map((o) => o.id);
    const totalsMap = new Map<string, number>();

    if (orderIds.length) {
      const { data: totals } = await supabaseAdmin
        .from("v_order_totals")
        .select("order_id,total_cost")
        .in("order_id", orderIds);

      for (const row of (totals ?? []) as { order_id: string; total_cost: number | null }[]) {
        totalsMap.set(row.order_id, Number(row.total_cost ?? 0));
      }
    }

    return JSON.stringify({
      total: orders.length,
      pedidos: orders.map((o) => ({
        id: o.id,
        loja: o.stores?.[0]?.name ?? o.store_id,
        created_at: o.created_at,
        delivery_finished_at: o.delivery_finished_at,
        data_entrega: o.delivery_finished_at,
        paid_at: o.paid_at,
        due_date: o.due_date,
        status: o.status,
        logistic_status: o.logistic_status,
        payment_method: o.payment_method,
        valor_total_brl: brl.format((totalsMap.get(o.id) ?? 0) + Number(o.freight_fee ?? 0)),
        valor_total_num: (totalsMap.get(o.id) ?? 0) + Number(o.freight_fee ?? 0),
      })),
    });
  }

  if (name === "get_orders_count") {
    const { startTS, endTS, label } = getPeriodRange(String(args.period));
    const status = String(args.status ?? "all");

    let q = supabaseAdmin
      .from("orders").select("id", { count: "exact", head: true })
      .not("submitted_at", "is", null)
      .gte("submitted_at", startTS).lt("submitted_at", endTS);

    if (status !== "all") q = q.eq("status", status);
    else q = q.in("status", ["submitted", "approved"]);

    const { count, error } = await q;
    if (error) return JSON.stringify({ error: error.message });

    return JSON.stringify({ periodo: label, total_pedidos: count ?? 0, status_filtro: status });
  }

  // ── get_overdue_payments ───────────────────────────────────────────────────
  if (name === "get_overdue_payments") {
    const today = toISODate(new Date());

    // 1) Busca configurações de encargos (mesma fonte do financeiro)
    const { data: settingsRow } = await supabaseAdmin
      .from("finance_settings").select("apply_late_charges,late_fee_percent,daily_interest_percent")
      .eq("id", 1).maybeSingle();

    const aplicar = !!(settingsRow?.apply_late_charges ?? true);
    const multaPct = Math.min(Math.max(Number(settingsRow?.late_fee_percent ?? 0), 0), 100) / 100;
    const jurosDiaPct = Math.min(Math.max(Number(settingsRow?.daily_interest_percent ?? 0), 0), 100) / 100;

    // 2) Pedidos vencidos
    let q = supabaseAdmin
      .from("orders")
      .select("id, due_date, freight_fee, delivery_mode, credit_applied, payment_method, store_id, stores(name)")
      .in("status", ["submitted", "approved"])
      .eq("is_paid", false)
      .not("due_date", "is", null)
      .lt("due_date", today)
      .order("due_date", { ascending: true });

    if (args.payment_method) q = q.ilike("payment_method", `%${args.payment_method}%`);

    const { data, error } = await q;
    if (error) return JSON.stringify({ error: error.message });

    type OrderRow = {
      id: string; due_date: string; freight_fee: number | null;
      delivery_mode: string | null; credit_applied: number | null;
      payment_method: string | null; store_id: string;
      stores: { name: string }[] | null;
    };

    const orderIds = (data as OrderRow[] ?? []).map((o) => o.id);
    if (!orderIds.length) return JSON.stringify({ total_vencido_brl: brl.format(0), pedidos_vencidos: 0, referencia: `vencimentos anteriores a ${today}` });

    // 3) v_order_totals + order_items (exatamente como o financeiro)
    const [totalsRes, itemsRes] = await Promise.all([
      supabaseAdmin.from("v_order_totals").select("order_id,total_cost").in("order_id", orderIds),
      supabaseAdmin.from("order_items").select("order_id,qty,unit_cost").in("order_id", orderIds),
    ]);

    const totalsMap = new Map<string, number>();
    for (const r of (totalsRes.data ?? []) as { order_id: string; total_cost: number }[])
      totalsMap.set(r.order_id, Number(r.total_cost) || 0);

    const itemsCalcMap = new Map<string, number>();
    for (const r of (itemsRes.data ?? []) as { order_id: string; qty: number; unit_cost: number }[])
      itemsCalcMap.set(r.order_id, (itemsCalcMap.get(r.order_id) ?? 0) + (Number(r.qty) || 0) * (Number(r.unit_cost) || 0));

    let totalVencido = 0;
    const rows = (data as OrderRow[] ?? []).map((order) => {
      const viewTotal = totalsMap.get(order.id) ?? 0;
      const itemsCalc = itemsCalcMap.get(order.id) ?? 0;
      const frete = order.delivery_mode === "FRETE" ? Number(order.freight_fee ?? 0) : 0;

      // Replica lógica exata do financeiro (page.tsx linha 743-750)
      let mercadoria = viewTotal;
      if (frete > 0) {
        if (near(viewTotal, itemsCalc + frete)) mercadoria = Math.max(viewTotal - frete, 0);
        else if (near(viewTotal, itemsCalc))    mercadoria = viewTotal;
        else if (!near(itemsCalc, 0))           mercadoria = itemsCalc;
      } else {
        if (!near(viewTotal, itemsCalc))        mercadoria = itemsCalc;
      }
      const total = mercadoria + frete;
      const credito = Number(order.credit_applied ?? 0);
      const a_pagar_base = Math.max(total - credito, 0);
      const days_late = daysBetween(order.due_date, today);
      const multa = aplicar ? a_pagar_base * multaPct : 0;
      const juros = aplicar ? a_pagar_base * jurosDiaPct * days_late : 0;
      const a_pagar_exib = Math.max(a_pagar_base + multa + juros, 0);
      totalVencido += a_pagar_exib;

      return {
        order_id: order.id,
        loja: order.stores?.[0]?.name ?? order.store_id,
        due_date: order.due_date,
        dias_atraso: days_late,
        metodo: order.payment_method ?? "não informado",
        mercadoria_brl: brl.format(mercadoria),
        frete_brl: frete > 0 ? brl.format(frete) : null,
        credito_abatido_brl: credito > 0 ? brl.format(credito) : null,
        encargos_brl: (multa + juros) > 0 ? brl.format(multa + juros) : null,
        a_pagar_brl: brl.format(a_pagar_exib),
        a_pagar_num: a_pagar_exib,
      };
    });

    const result: Record<string, unknown> = {
      total_vencido_brl: brl.format(totalVencido),
      total_vencido_num: totalVencido,
      pedidos_vencidos: rows.length,
      referencia: `vencimentos anteriores a ${today}`,
      encargos_aplicados: aplicar,
      filtro_pagamento: args.payment_method ?? "todos",
    };

    if (args.include_details) result.detalhes = rows;

    return JSON.stringify(result);
  }

  // ── get_top_products ───────────────────────────────────────────────────────
  if (name === "get_top_products") {
    const { startTS, endTS, label } = getPeriodRange(String(args.period));
    const limit = Number(args.limit ?? 5);

    const { data: orders } = await supabaseAdmin
      .from("orders").select("id")
      .in("status", ["submitted", "approved"])
      .not("submitted_at", "is", null)
      .gte("submitted_at", startTS).lt("submitted_at", endTS);

    const orderIds = (orders ?? []).map((o: { id: string }) => o.id);
    if (!orderIds.length) return JSON.stringify({ periodo: label, ranking: [] });

    const { data: items, error } = await supabaseAdmin
      .from("order_items")
      .select("qty, product_id, products(name, sku)")
      .in("order_id", orderIds);

    if (error) return JSON.stringify({ error: error.message });

    type ItemRow = { qty: number; product_id: string; products: { name: string; sku: string }[] | null };
    const map = new Map<string, { name: string; qty: number }>();
    for (const item of (items as ItemRow[] ?? [])) {
      const cur = map.get(item.product_id) ?? { name: item.products?.[0]?.name ?? item.product_id, qty: 0 };
      cur.qty += item.qty;
      map.set(item.product_id, cur);
    }

    const ranking = Array.from(map.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, limit)
      .map((r, i) => ({ posicao: i + 1, produto: r.name, qty: r.qty }));

    return JSON.stringify({ periodo: label, ranking });
  }

  // ── get_financial_summary ──────────────────────────────────────────────────
  // ── get_store_credit_balances ─────────────────────────────────────────────
  if (name === "get_store_credit_balances") {
    const { data, error } = await supabaseAdmin
      .from("v_store_credit_balance")
      .select("store_id,balance,stores(name)")
      .gt("balance", 0)
      .order("balance", { ascending: false });

    if (error) return JSON.stringify({ error: error.message });

    type CreditRow = {
      store_id: string;
      balance: number | null;
      stores: { name: string }[] | null;
    };

    const lojas = ((data ?? []) as CreditRow[]).map((row) => ({
      loja: row.stores?.[0]?.name ?? row.store_id,
      saldo_brl: brl.format(Number(row.balance ?? 0)),
      saldo_num: Number(row.balance ?? 0),
    }));

    return JSON.stringify({
      total_lojas_com_credito: lojas.length,
      lojas,
    });
  }

  if (name === "get_financial_summary") {
    const today = toISODate(new Date());

    // 1) Busca lojas se filtro de loja informado
    let storeIds: string[] | null = null;
    if (args.store_name) {
      const storeResult = await findStores(String(args.store_name));
      if (!storeResult.ok) {
        if (storeResult.ambiguous)
          return JSON.stringify({ erro: `Encontrei ${storeResult.matches.length} lojas com esse nome. Qual você quer dizer? ${storeResult.matches.join(" / ")}` });
        return JSON.stringify({ erro: `Loja "${args.store_name}" não encontrada.` });
      }
      storeIds = storeResult.ids;
    }

    // 2) Monta query de pedidos (mesmo padrão da página financeiro)
    let q = supabaseAdmin
      .from("orders")
      .select("id,store_id,status,created_at,is_paid,paid_at,payment_method,paid_amount,logistic_status,delivery_mode,freight_fee,credit_applied,due_date")
      .order("created_at", { ascending: false });

    if (storeIds) q = q.in("store_id", storeIds);

    const status = String(args.status ?? "all");
    if (status !== "all") q = q.eq("status", status);
    else q = q.in("status", ["submitted", "approved"]);

    if (args.logistic_status && args.logistic_status !== "all") q = q.eq("logistic_status", args.logistic_status);
    if (args.delivery_mode && args.delivery_mode !== "all") q = q.eq("delivery_mode", args.delivery_mode);
    if (args.paid === true) q = q.eq("is_paid", true);
    if (args.paid === false) q = q.or("is_paid.is.null,is_paid.eq.false");
    if (args.payment_method && args.payment_method !== "all") q = q.eq("payment_method", args.payment_method);

    const period = String(args.period ?? "all");
    if (period !== "all") {
      const { startTS, endTS } = getPeriodRange(period);
      q = q.gte("created_at", startTS).lt("created_at", endTS);
    }

    const dueFilter = String(args.due_filter ?? "all");
    if (dueFilter === "no_due") q = q.is("due_date", null);

    const { data: ords, error: oErr } = await q;
    if (oErr) return JSON.stringify({ error: oErr.message });

    type ORow = { id: string; store_id: string; status: string; created_at: string; is_paid: boolean | null; paid_at: string | null; payment_method: string | null; paid_amount: number | null; logistic_status: string | null; delivery_mode: string | null; freight_fee: number | null; credit_applied: number | null; due_date: string | null };
    let orders = (ords ?? []) as ORow[];

    // Filtros de vencimento aplicados em memória (igual à página financeiro)
    if (dueFilter === "overdue")   orders = orders.filter((o) => !o.is_paid && !!o.due_date && o.due_date < today);
    else if (dueFilter === "due_soon") orders = orders.filter((o) => !o.is_paid && !!o.due_date && o.due_date >= today && o.due_date <= toISODate(new Date(Date.now() + 3 * 86400000)));
    else if (dueFilter === "today")  orders = orders.filter((o) => !!o.due_date && o.due_date === today);
    else if (dueFilter === "future") orders = orders.filter((o) => !!o.due_date && o.due_date > today);
    else if (dueFilter === "due_by_week_end") { const endOfWeek = toISODate(new Date(startOfWeek(new Date()).getTime() + 6 * 86400000)); orders = orders.filter((o) => !o.is_paid && !!o.due_date && o.due_date <= endOfWeek); }
    else if (dueFilter === "with_due") orders = orders.filter((o) => !!o.due_date);

    if (!orders.length) return JSON.stringify({ total_pedidos: 0, total_geral_brl: brl.format(0), em_aberto_brl: brl.format(0), pago_brl: brl.format(0), qtd_vencidos: 0, valor_vencido_brl: brl.format(0) });

    const orderIds = orders.map((o) => o.id);

    // 3) v_order_totals + order_items + finance_settings (igual à página financeiro)
    const [totalsRes, itemsRes, settings] = await Promise.all([
      supabaseAdmin.from("v_order_totals").select("order_id,total_cost").in("order_id", orderIds),
      supabaseAdmin.from("order_items").select("order_id,qty,unit_cost").in("order_id", orderIds),
      getFinanceSettings(),
    ]);

    const totalsMap = new Map<string, number>();
    for (const r of (totalsRes.data ?? []) as { order_id: string; total_cost: number }[])
      totalsMap.set(r.order_id, Number(r.total_cost) || 0);

    const itemsCalcMap = new Map<string, number>();
    for (const r of (itemsRes.data ?? []) as { order_id: string; qty: number; unit_cost: number }[])
      itemsCalcMap.set(r.order_id, (itemsCalcMap.get(r.order_id) ?? 0) + (Number(r.qty) || 0) * (Number(r.unit_cost) || 0));

    const { aplicar, multaPct, jurosDiaPct } = settings;

    // 4) Calcula exatamente como a página financeiro
    let sumMercadoria = 0, sumFrete = 0, sumCredito = 0, sumPago = 0, sumEmAberto = 0;
    let qtdVencidos = 0, valorVencido = 0;

    for (const o of orders) {
      const viewTotal = totalsMap.get(o.id) ?? 0;
      const itemsCalc = itemsCalcMap.get(o.id) ?? 0;
      const frete = o.delivery_mode === "FRETE" ? Number(o.freight_fee ?? 0) : 0;

      let mercadoria = viewTotal;
      if (frete > 0) {
        if (near(viewTotal, itemsCalc + frete))      mercadoria = Math.max(viewTotal - frete, 0);
        else if (near(viewTotal, itemsCalc))          mercadoria = viewTotal;
        else if (!near(itemsCalc, 0))                 mercadoria = itemsCalc;
      } else {
        if (!near(viewTotal, itemsCalc))              mercadoria = itemsCalc;
      }

      const total = mercadoria + frete;
      const credito = Number(o.credit_applied ?? 0);
      const a_pagar_base = Math.max(total - credito, 0);
      const is_overdue = !!o.due_date && !o.is_paid && o.due_date < today;
      const days_late = is_overdue && o.due_date ? daysBetween(o.due_date, today) : 0;
      const multa = aplicar && is_overdue ? a_pagar_base * multaPct : 0;
      const juros = aplicar && is_overdue ? a_pagar_base * jurosDiaPct * days_late : 0;
      const paid_amount_num = Number(o.paid_amount ?? 0) || 0;
      const a_pagar_exib = o.is_paid && paid_amount_num > 0 ? paid_amount_num : Math.max(a_pagar_base + multa + juros, 0);

      sumMercadoria += mercadoria;
      sumFrete += frete;
      sumCredito += credito;
      if (o.is_paid) sumPago += a_pagar_exib;
      else sumEmAberto += a_pagar_exib;
      if (is_overdue) { qtdVencidos++; valorVencido += a_pagar_exib; }
    }

    const sumTotal = sumMercadoria + sumFrete;
    const filtrosAplicados: string[] = [];
    if (args.store_name) filtrosAplicados.push(`loja: ${args.store_name}`);
    if (args.payment_method && args.payment_method !== "all") filtrosAplicados.push(`pagamento: ${args.payment_method}`);
    if (args.paid === true) filtrosAplicados.push("apenas pagos");
    if (args.paid === false) filtrosAplicados.push("apenas em aberto");
    if (args.delivery_mode && args.delivery_mode !== "all") filtrosAplicados.push(`entrega: ${args.delivery_mode}`);
    if (args.logistic_status && args.logistic_status !== "all") filtrosAplicados.push(`logística: ${args.logistic_status}`);
    if (dueFilter !== "all") filtrosAplicados.push(`vencimento: ${dueFilter}`);
    if (period !== "all") filtrosAplicados.push(`período: ${period}`);

    return JSON.stringify({
      filtros: filtrosAplicados.join(", ") || "nenhum",
      total_pedidos: orders.length,
      mercadoria_brl: brl.format(sumMercadoria),
      frete_brl: brl.format(sumFrete),
      total_geral_brl: brl.format(sumTotal),
      credito_abatido_brl: brl.format(sumCredito),
      a_pagar_brl: brl.format(sumEmAberto + sumPago),
      pago_brl: brl.format(sumPago),
      em_aberto_brl: brl.format(sumEmAberto),
      qtd_vencidos: qtdVencidos,
      valor_vencido_brl: brl.format(valorVencido),
    });
  }

  return JSON.stringify({ erro: `Tool desconhecida: ${name}` });
}
