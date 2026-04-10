// lib/st-balance.ts
// Funções de consulta e consumo de saldo ICMS-ST retido

export type StBalanceResult = {
  available: boolean;
  totalRemaining: number;
  entries: Array<{
    id: string;
    quantity_remaining: number;
    st_base_unit: number;
    st_rate: number;
    st_icms_substitute_unit: number;
    st_value_unit: number;
  }>;
};

export type StConsumeResult = {
  ok: boolean;
  st_base: number;
  st_rate: number;
  st_icms_substitute: number;
  st_value: number;
  consumptions: Array<{
    entry_id: string;
    quantity_consumed: number;
    st_base_used: number;
    st_value_used: number;
    st_icms_sub_used: number;
  }>;
  error?: string;
};

function round2(v: number) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function round6(v: number) {
  return Math.round((v + Number.EPSILON) * 1_000_000) / 1_000_000;
}

// Consulta saldo disponível para um produto
export async function getStBalance(
  supabaseUrl: string,
  serviceRole: string,
  productId: string
): Promise<StBalanceResult> {
  const headers = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(
    `${supabaseUrl}/rest/v1/product_st_entries` +
    `?product_id=eq.${encodeURIComponent(productId)}` +
    `&quantity_remaining=gt.0` +
    `&select=id,quantity_remaining,st_base_unit,st_rate,st_icms_substitute_unit,st_value_unit` +
    `&order=created_at.asc`,
    { headers, cache: "no-store" }
  );

  if (!res.ok) {
    return { available: false, totalRemaining: 0, entries: [] };
  }

  const entries = await res.json() as StBalanceResult["entries"];
  const totalRemaining = entries.reduce((acc, e) => acc + Number(e.quantity_remaining), 0);

  return {
    available: totalRemaining > 0,
    totalRemaining: round6(totalRemaining),
    entries,
  };
}

// Calcula quanto de ST será usado para uma quantidade de venda (sem consumir)
export function previewStConsumption(
  entries: StBalanceResult["entries"],
  quantityNeeded: number
): Omit<StConsumeResult, "ok" | "consumptions"> & { sufficient: boolean } {
  let remaining = quantityNeeded;
  let totalBase = 0;
  let totalSub = 0;
  let totalValue = 0;
  let stRate = 0;

  for (const entry of entries) {
    if (remaining <= 0) break;
    const use = Math.min(remaining, Number(entry.quantity_remaining));
    totalBase += use * Number(entry.st_base_unit);
    totalSub += use * Number(entry.st_icms_substitute_unit);
    totalValue += use * Number(entry.st_value_unit);
    stRate = Number(entry.st_rate); // alíquota é constante
    remaining -= use;
  }

  return {
    sufficient: remaining <= 0,
    st_base: round2(totalBase),
    st_rate: stRate,
    st_icms_substitute: round2(totalSub),
    st_value: round2(totalValue),
  };
}

// Consome saldo de ST para uma quantidade de venda (FIFO)
// Registra os consumos e atualiza quantity_remaining
export async function consumeStBalance(
  supabaseUrl: string,
  serviceRole: string,
  productId: string,
  quantityNeeded: number,
  orderId: string | null,
  nfeReference: string
): Promise<StConsumeResult> {
  const headers = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    "Content-Type": "application/json",
  };

  // Busca entradas com saldo, FIFO
  const balance = await getStBalance(supabaseUrl, serviceRole, productId);

  if (!balance.available || balance.totalRemaining < quantityNeeded) {
    return {
      ok: false,
      st_base: 0,
      st_rate: 0,
      st_icms_substitute: 0,
      st_value: 0,
      consumptions: [],
      error: `Saldo insuficiente. Disponível: ${round6(balance.totalRemaining)}, necessário: ${quantityNeeded}.`,
    };
  }

  const consumptions: StConsumeResult["consumptions"] = [];
  let remaining = quantityNeeded;
  let totalBase = 0;
  let totalSub = 0;
  let totalValue = 0;
  let stRate = 0;

  for (const entry of balance.entries) {
    if (remaining <= 0) break;

    const use = round6(Math.min(remaining, Number(entry.quantity_remaining)));
    const newRemaining = round6(Number(entry.quantity_remaining) - use);

    const stBaseUsed = round2(use * Number(entry.st_base_unit));
    const stSubUsed = round2(use * Number(entry.st_icms_substitute_unit));
    const stValueUsed = round2(use * Number(entry.st_value_unit));
    stRate = Number(entry.st_rate);

    // Atualiza saldo da entrada
    const updateRes = await fetch(
      `${supabaseUrl}/rest/v1/product_st_entries?id=eq.${encodeURIComponent(entry.id)}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ quantity_remaining: newRemaining }),
        cache: "no-store",
      }
    );

    if (!updateRes.ok) {
      const txt = await updateRes.text().catch(() => "");
      return {
        ok: false,
        st_base: 0,
        st_rate: 0,
        st_icms_substitute: 0,
        st_value: 0,
        consumptions,
        error: `Falha ao atualizar saldo da entrada ${entry.id}: ${txt}`,
      };
    }

    // Registra consumo
    const consumptionRes = await fetch(
      `${supabaseUrl}/rest/v1/product_st_consumptions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          entry_id: entry.id,
          product_id: productId,
          order_id: orderId || null,
          nfe_reference: nfeReference,
          quantity_consumed: use,
          st_base_used: stBaseUsed,
          st_value_used: stValueUsed,
          st_icms_sub_used: stSubUsed,
        }),
        cache: "no-store",
      }
    );

    if (!consumptionRes.ok) {
      // Não aborta — só loga
      console.error(`Aviso: falha ao registrar consumo ST para entrada ${entry.id}`);
    }

    consumptions.push({
      entry_id: entry.id,
      quantity_consumed: use,
      st_base_used: stBaseUsed,
      st_value_used: stValueUsed,
      st_icms_sub_used: stSubUsed,
    });

    totalBase += stBaseUsed;
    totalSub += stSubUsed;
    totalValue += stValueUsed;
    remaining -= use;
  }

  return {
    ok: true,
    st_base: round2(totalBase),
    st_rate: stRate,
    st_icms_substitute: round2(totalSub),
    st_value: round2(totalValue),
    consumptions,
  };
}
