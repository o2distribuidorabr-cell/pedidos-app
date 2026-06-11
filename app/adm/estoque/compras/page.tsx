"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PageHeader, Card, Input, Select } from "@/app/components/ui";
import Link from "next/link";

type PlanRow = {
  product_id: string;
  sku: string | null;
  name: string | null;
  unit: string | null;
  avg_cost: number;
  current_qty: number;
  weekly_consumption: number;
  coverage_weeks: number;
  demand: number;
  suggested_qty: number;
};

type PeriodPreset = "7" | "14" | "30" | "60" | "90" | "all" | "custom";

type PeriodConfig = {
  since: string | null; // null = sem filtro de início (todo o histórico)
  until: string;
  divisor: number;      // número de semanas no intervalo
  label: string;
};

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function buildPresetConfig(preset: Exclude<PeriodPreset, "custom" | "all">): PeriodConfig {
  const map: Record<string, { days: number; label: string }> = {
    "7":  { days: 7,  label: "Última semana (7 dias)" },
    "14": { days: 14, label: "Últimas 2 semanas" },
    "30": { days: 30, label: "Último mês (30 dias)" },
    "60": { days: 60, label: "Últimos 2 meses (60 dias)" },
    "90": { days: 90, label: "Últimos 3 meses (90 dias)" },
  };
  const { days, label } = map[preset];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return {
    since: since.toISOString(),
    until: new Date().toISOString(),
    divisor: days / 7,
    label,
  };
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtCurrency(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function coverageBadge(weeks: number, consumption: number) {
  if (consumption === 0) return <span className="text-slate-400 text-xs">sem saída</span>;
  const color = weeks < 1 ? "bg-red-100 text-red-700" : weeks < 2 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      {weeks === Infinity ? "∞" : fmt(weeks, 1)} sem.
    </span>
  );
}

function printPlan(rows: PlanRow[], periodLabel: string) {
  const hasQty = rows.filter((r) => r.suggested_qty > 0);
  const total = hasQty.reduce((a, r) => a + r.suggested_qty * r.avg_cost, 0);
  const trs = hasQty.map((r) => `
    <tr>
      <td>${r.sku ?? "—"}</td>
      <td>${r.name ?? "—"}</td>
      <td class="num">${fmt(r.weekly_consumption, 2)} ${r.unit ?? ""}</td>
      <td class="num">${fmt(r.current_qty, 2)} ${r.unit ?? ""}</td>
      <td class="num"><strong>${fmt(r.suggested_qty, 2)} ${r.unit ?? ""}</strong></td>
      <td class="num">${r.avg_cost > 0 ? fmtCurrency(r.suggested_qty * r.avg_cost) : "—"}</td>
    </tr>`).join("");
  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Planejamento de Compras</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:20px}
  h1{font-size:15px;margin-bottom:4px}
  .meta{font-size:10px;color:#666;margin-bottom:16px}
  table{width:100%;border-collapse:collapse}
  th{background:#f0f0f0;text-align:left;padding:5px 8px;font-size:10px;text-transform:uppercase;border:1px solid #ccc}
  td{padding:5px 8px;border:1px solid #ddd}
  .num{text-align:right}
  tr:nth-child(even) td{background:#fafafa}
  tfoot td{font-weight:bold;background:#f0f0f0}
  @media print{button{display:none}}
</style></head><body>
<h1>Planejamento de Compras — O2 Distribuidora</h1>
<p class="meta">Período: ${periodLabel} · Gerado em: ${new Date().toLocaleString("pt-BR")} · ${hasQty.length} produto(s)</p>
<table><thead><tr>
  <th>SKU</th><th>Produto</th><th>Cons. semanal médio</th><th>Estoque atual</th><th>Sugestão de compra</th><th>Custo estimado</th>
</tr></thead>
<tbody>${trs}</tbody>
<tfoot><tr>
  <td colspan="5" style="text-align:right">Total estimado</td>
  <td class="num">${fmtCurrency(total)}</td>
</tr></tfoot></table>
<script>window.onload=()=>window.print();</script>
</body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

const PRESET_OPTIONS = [
  { value: "7",     label: "Última semana (7 dias)" },
  { value: "14",    label: "Últimas 2 semanas" },
  { value: "30",    label: "Último mês (30 dias)" },
  { value: "60",    label: "Últimos 2 meses (60 dias)" },
  { value: "90",    label: "Últimos 3 meses (90 dias)" },
  { value: "all",   label: "Todo o histórico" },
  { value: "custom", label: "Período personalizado..." },
];

export default function ComprasPage() {
  const router = useRouter();

  const [preset, setPreset] = useState<PeriodPreset>("30");
  const [customFrom, setCustomFrom] = useState(() => toISODate(new Date(Date.now() - 30 * 86400000)));
  const [customTo, setCustomTo] = useState(() => toISODate(new Date()));

  const [rows, setRows] = useState<PlanRow[]>([]);
  const [edited, setEdited] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [onlyDemand, setOnlyDemand] = useState(true);
  const [search, setSearch] = useState("");
  const [periodLabel, setPeriodLabel] = useState("");
  const [ordersFound, setOrdersFound] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) { router.replace("/login"); return; }
      // Carrega com o preset padrão ao abrir
      const cfg = buildPresetConfig("30");
      await loadPlan(cfg);
    })();
  }, []);

  function buildConfig(): PeriodConfig | null {
    if (preset === "all") {
      return {
        since: null,
        until: new Date().toISOString(),
        divisor: 1, // será recalculado com base no primeiro pedido
        label: "Todo o histórico",
      };
    }
    if (preset === "custom") {
      if (!customFrom || !customTo) return null;
      const from = new Date(customFrom + "T00:00:00");
      const to = new Date(customTo + "T23:59:59");
      if (from >= to) return null;
      const days = Math.max((to.getTime() - from.getTime()) / 86400000, 1);
      return {
        since: from.toISOString(),
        until: to.toISOString(),
        divisor: days / 7,
        label: `${customFrom} a ${customTo}`,
      };
    }
    return buildPresetConfig(preset as Exclude<PeriodPreset, "custom" | "all">);
  }

  async function triggerLoad() {
    const cfg = buildConfig();
    if (cfg) await loadPlan(cfg);
  }

  async function loadPlan(cfg: PeriodConfig) {
    setLoading(true);
    setEdited({});
    setOrdersFound(null);
    setPeriodLabel(cfg.label);
    try {
      // 1. Saldo atual (track_stock=true)
      const { data: balances, error: bErr } = await supabase
        .from("v_stock_balance")
        .select("product_id,sku,name,unit,current_qty,avg_cost")
        .eq("track_stock", true);
      if (bErr) throw bErr;

      const trackedIds = new Set(((balances ?? []) as any[]).map((b) => b.product_id));

      // 2. Pedidos aprovados no período
      let ordersQuery = supabase
        .from("orders")
        .select("id,created_at")
        .eq("status", "approved");

      if (cfg.since) ordersQuery = ordersQuery.gte("created_at", cfg.since);
      ordersQuery = ordersQuery.lte("created_at", cfg.until);

      const { data: orders, error: oErr } = await ordersQuery;
      if (oErr) throw oErr;

      const orderList = (orders ?? []) as any[];
      setOrdersFound(orderList.length);

      const consumoMap = new Map<string, number>();
      let effectiveDivisor = cfg.divisor;

      if (orderList.length > 0) {
        // Para "todo o histórico", calcula o divisor com base na amplitude real dos pedidos
        if (preset === "all" && orderList.length > 1) {
          const dates = orderList.map((o) => new Date(o.created_at).getTime());
          const minDate = Math.min(...dates);
          const maxDate = Math.max(...dates);
          const days = Math.max((maxDate - minDate) / 86400000, 7);
          effectiveDivisor = days / 7;
        }

        const orderIds = orderList.map((o) => o.id);

        // Busca em lotes de 200 para evitar URL muito longa
        const { data: items, error: iErr } = await supabase
          .from("order_items")
          .select("product_id,qty")
          .in("order_id", orderIds);
        if (iErr) throw iErr;
        for (const item of (items ?? []) as any[]) {
          if (!trackedIds.has(item.product_id)) continue;
          const prev = consumoMap.get(item.product_id) ?? 0;
          consumoMap.set(item.product_id, prev + Math.abs(Number(item.qty)));
        }
      }

      const plan: PlanRow[] = ((balances ?? []) as any[]).map((b) => {
        const totalConsumo = consumoMap.get(b.product_id) ?? 0;
        const weeklyConsumption = totalConsumo / effectiveDivisor;
        const currentQty = Number(b.current_qty);
        const demand = Math.max(0, weeklyConsumption - currentQty);
        const coverageWeeks = weeklyConsumption > 0 ? currentQty / weeklyConsumption : Infinity;
        return {
          product_id: b.product_id,
          sku: b.sku,
          name: b.name,
          unit: b.unit,
          avg_cost: Number(b.avg_cost) || 0,
          current_qty: currentQty,
          weekly_consumption: weeklyConsumption,
          coverage_weeks: coverageWeeks,
          demand,
          suggested_qty: Math.ceil(demand * 100) / 100,
        };
      });

      plan.sort((a, b) => {
        if (b.demand !== a.demand) return b.demand - a.demand;
        return (a.name ?? "").localeCompare(b.name ?? "");
      });

      setRows(plan);
    } catch (err: any) {
      console.error("[compras]", err);
    } finally {
      setLoading(false);
    }
  }

  function getSuggested(row: PlanRow) {
    return edited[row.product_id] !== undefined ? edited[row.product_id] : row.suggested_qty;
  }

  function setSuggested(productId: string, value: string) {
    const n = parseFloat(value.replace(",", "."));
    setEdited((prev) => ({ ...prev, [productId]: Number.isFinite(n) && n >= 0 ? n : 0 }));
  }

  const filtered = useMemo(() => {
    let list = rows;
    if (onlyDemand) list = list.filter((r) => getSuggested(r) > 0 || r.demand > 0);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        (r.sku ?? "").toLowerCase().includes(q) || (r.name ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, onlyDemand, search, edited]);

  const planRows = rows.map((r) => ({ ...r, suggested_qty: getSuggested(r) }));
  const totalCost = planRows.reduce((a, r) => a + getSuggested(r) * r.avg_cost, 0);
  const demandCount = rows.filter((r) => r.demand > 0).length;
  const noDemandCount = rows.filter((r) => r.demand === 0 && r.weekly_consumption > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planejamento de compras"
        subtitle="Consumo médio semanal de pedidos aprovados × estoque atual"
        right={
          <div className="flex gap-2">
            <button
              onClick={() => printPlan(planRows, periodLabel)}
              className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9a1 1 0 110-2 1 1 0 010 2zm1 2v-2h6v2H7z" clipRule="evenodd" />
              </svg>
              Imprimir lista
            </button>
            <Link href="/adm/estoque" className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
              ← Estoque
            </Link>
          </div>
        }
      />

      {/* Filtros */}
      <Card>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="w-64">
            <Select
              label="Período para calcular média"
              value={preset}
              onChange={(v) => setPreset(v as PeriodPreset)}
              options={PRESET_OPTIONS}
            />
          </div>

          {preset === "custom" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">De</label>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-10 rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Até</label>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={toISODate(new Date())}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-10 rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                />
              </div>
            </>
          )}

          <div className="flex gap-2 items-end pb-0.5">
            <button
              onClick={triggerLoad}
              className="h-10 px-4 rounded-[10px] text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition"
            >
              Calcular
            </button>
            <button
              onClick={() => setOnlyDemand((v) => !v)}
              className={["h-10 px-3 rounded-[10px] text-sm font-medium transition", onlyDemand ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-slate-900 text-white"].join(" ")}
            >
              {onlyDemand ? "Só com demanda" : "Ver todos"}
            </button>
          </div>

          <div className="flex-1 min-w-[180px]">
            <Input label="" value={search} onChange={(v) => setSearch(v)} placeholder="Buscar produto..." />
          </div>
        </div>

        {/* Info do período calculado */}
        {periodLabel && ordersFound !== null && (
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <span className="text-xs text-slate-500">
              Período: <span className="font-semibold text-slate-700">{periodLabel}</span>
            </span>
            <span className={[
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
              ordersFound > 0 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
            ].join(" ")}>
              {ordersFound} pedido{ordersFound !== 1 ? "s" : ""} aprovado{ordersFound !== 1 ? "s" : ""} encontrado{ordersFound !== 1 ? "s" : ""}
            </span>
            {ordersFound === 0 && (
              <span className="text-xs text-amber-600">
                Nenhum pedido aprovado neste período — tente ampliar o intervalo ou usar "Todo o histórico"
              </span>
            )}
          </div>
        )}
      </Card>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Custo estimado total</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{fmtCurrency(totalCost)}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Produtos com demanda</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{demandCount}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Estoque suficiente</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{noDemandCount}</p>
        </Card>
      </div>

      {/* Tabela */}
      <Card>
        {loading ? (
          <p className="text-center text-sm text-slate-500 py-8">Calculando demanda...</p>
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-8">
            Selecione um período e clique em Calcular.
          </p>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-500">Nenhum produto com demanda no período.</p>
            <button
              onClick={() => setOnlyDemand(false)}
              className="mt-2 text-sm text-slate-700 underline"
            >
              Ver todos os produtos
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">SKU</th>
                  <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Produto</th>
                  <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">
                    Cons. médio/sem.
                  </th>
                  <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Estoque atual</th>
                  <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Cobertura</th>
                  <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Demanda</th>
                  <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">
                    Sugestão <span className="font-normal text-slate-400 normal-case">editável</span>
                  </th>
                  <th className="pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Custo est.</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const suggested = getSuggested(r);
                  const hasDemand = r.demand > 0;
                  return (
                    <tr key={r.product_id} className={`border-b border-slate-50 hover:bg-slate-50 ${hasDemand ? "" : "opacity-60"}`}>
                      <td className="py-3 pr-4 font-mono text-xs text-slate-400">{r.sku ?? "—"}</td>
                      <td className="py-3 pr-4 font-medium text-slate-900">{r.name ?? "—"}</td>
                      <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                        {r.weekly_consumption > 0
                          ? `${fmt(r.weekly_consumption, 2)} ${r.unit ?? ""}`
                          : <span className="text-slate-300">sem saída</span>}
                      </td>
                      <td className={`py-3 pr-4 text-right tabular-nums font-semibold ${r.current_qty < 0 ? "text-red-600" : r.current_qty === 0 ? "text-slate-400" : "text-slate-900"}`}>
                        {fmt(r.current_qty, 2)} {r.unit ?? ""}
                      </td>
                      <td className="py-3 pr-4 text-center">
                        {coverageBadge(r.coverage_weeks, r.weekly_consumption)}
                      </td>
                      <td className={`py-3 pr-4 text-right tabular-nums font-semibold ${hasDemand ? "text-red-600" : "text-slate-300"}`}>
                        {hasDemand ? `${fmt(r.demand, 2)} ${r.unit ?? ""}` : "—"}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center justify-end">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={edited[r.product_id] !== undefined ? edited[r.product_id] : r.suggested_qty}
                            onChange={(e) => setSuggested(r.product_id, e.target.value)}
                            className={[
                              "w-28 rounded-[10px] border px-3 py-1.5 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900/20",
                              hasDemand ? "border-red-200 bg-red-50 font-semibold text-red-700" : "border-slate-200 bg-white text-slate-600",
                            ].join(" ")}
                          />
                          <span className="ml-1.5 text-xs text-slate-400">{r.unit ?? ""}</span>
                        </div>
                      </td>
                      <td className="py-3 text-right tabular-nums text-slate-600">
                        {r.avg_cost > 0 && suggested > 0 ? fmtCurrency(suggested * r.avg_cost) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td colSpan={7} className="pt-3 pr-4 text-right font-semibold text-slate-700 text-sm">Total estimado</td>
                  <td className="pt-3 text-right font-bold text-slate-900 tabular-nums">{fmtCurrency(totalCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
