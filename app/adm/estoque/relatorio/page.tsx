"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PageHeader, Card, Input, Select } from "@/app/components/ui";
import Link from "next/link";

type ProductMargin = {
  product_id: string;
  sku: string | null;
  name: string | null;
  unit: string | null;
  avg_cost: number;
  qty_sold: number;
  total_revenue: number;
  total_cost: number;
  profit: number;
  margin_pct: number;
};

function fmtCurrency(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmt(n: number, d = 2) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function buildMonthOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    opts.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return opts;
}

type SortKey = "name" | "qty_sold" | "total_revenue" | "total_cost" | "profit" | "margin_pct";

export default function RelatorioEstoquePage() {
  const router = useRouter();
  const monthOptions = useMemo(buildMonthOptions, []);
  const [month, setMonth] = useState(monthOptions[0].value);
  const [rows, setRows] = useState<ProductMargin[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total_revenue");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) { router.replace("/login"); return; }
      await loadReport(month);
    })();
  }, []);

  useEffect(() => { if (month) loadReport(month); }, [month]);

  async function loadReport(m: string) {
    setLoading(true);
    try {
      const [year, mon] = m.split("-").map(Number);
      const start = new Date(year, mon - 1, 1).toISOString();
      const end   = new Date(year, mon, 1).toISOString();

      // 1. Pedidos aprovados no mês
      const { data: orders, error: oErr } = await supabase
        .from("orders")
        .select("id")
        .eq("status", "approved")
        .gte("created_at", start)
        .lt("created_at", end);
      if (oErr) throw oErr;

      if (!orders || orders.length === 0) { setRows([]); setLoading(false); return; }

      const orderIds = orders.map((o: any) => o.id);

      // 2. Itens dos pedidos
      const { data: items, error: iErr } = await supabase
        .from("order_items")
        .select("product_id, qty, unit_cost")
        .in("order_id", orderIds);
      if (iErr) throw iErr;

      // 3. Custo médio atual + info dos produtos (apenas rastreados)
      const { data: balances, error: bErr } = await supabase
        .from("v_stock_balance")
        .select("product_id, sku, name, unit, avg_cost")
        .eq("track_stock", true);
      if (bErr) throw bErr;

      // 4. Mapa de custo médio e info por produto
      const costMap = new Map<string, { sku: string | null; name: string | null; unit: string | null; avg_cost: number }>();
      for (const b of (balances ?? []) as any[]) {
        costMap.set(b.product_id, {
          sku: b.sku,
          name: b.name,
          unit: b.unit,
          avg_cost: Number(b.avg_cost) || 0,
        });
      }

      // 5. Agrega por produto (apenas os que estão no costMap = track_stock=true)
      const agg = new Map<string, { qty: number; revenue: number; cost: number }>();
      for (const item of (items ?? []) as any[]) {
        if (!costMap.has(item.product_id)) continue; // ignora produtos ocultos
        const prev = agg.get(item.product_id) ?? { qty: 0, revenue: 0, cost: 0 };
        const qty = Number(item.qty) || 0;
        const unitRevenue = Number(item.unit_cost) || 0;
        const avgCost = costMap.get(item.product_id)!.avg_cost;
        agg.set(item.product_id, {
          qty: prev.qty + qty,
          revenue: prev.revenue + qty * unitRevenue,
          cost: prev.cost + qty * avgCost,
        });
      }

      const result: ProductMargin[] = [];
      for (const [productId, vals] of agg.entries()) {
        const info = costMap.get(productId)!;
        const profit = vals.revenue - vals.cost;
        const margin_pct = vals.revenue > 0 ? (profit / vals.revenue) * 100 : 0;
        result.push({
          product_id: productId,
          sku: info.sku,
          name: info.name,
          unit: info.unit,
          avg_cost: info.avg_cost,
          qty_sold: vals.qty,
          total_revenue: vals.revenue,
          total_cost: vals.cost,
          profit,
          margin_pct,
        });
      }

      setRows(result);
    } catch (err: any) {
      console.error("[relatorio]", err);
    } finally {
      setLoading(false);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const filtered = useMemo(() => {
    let list = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        (r.sku ?? "").toLowerCase().includes(q) || (r.name ?? "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const va = sortKey === "name" ? (a.name ?? "") : Number(a[sortKey]);
      const vb = sortKey === "name" ? (b.name ?? "") : Number(b[sortKey]);
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [rows, search, sortKey, sortAsc]);

  const totalRevenue = rows.reduce((a, r) => a + r.total_revenue, 0);
  const totalCost    = rows.reduce((a, r) => a + r.total_cost, 0);
  const totalProfit  = totalRevenue - totalCost;
  const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  function SortTh({ label, k, right = true }: { label: string; k: SortKey; right?: boolean }) {
    const active = sortKey === k;
    return (
      <th
        onClick={() => toggleSort(k)}
        className={`pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-900 select-none ${right ? "text-right" : ""}`}
      >
        {label}{active ? (sortAsc ? " ↑" : " ↓") : ""}
      </th>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatório de margem"
        subtitle="Custo vs receita por produto · pedidos aprovados"
        right={
          <Link href="/adm/estoque" className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
            ← Estoque
          </Link>
        }
      />

      {/* Seletor de mês */}
      <Card>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="w-64">
            <Select
              label="Mês de referência"
              value={month}
              onChange={(v) => setMonth(v)}
              options={monthOptions}
            />
          </div>
          <p className="text-sm text-slate-500 pb-2">
            {loading ? "Carregando..." : `${rows.length} produto(s) vendido(s)`}
          </p>
        </div>
      </Card>

      {/* Cards de totais */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Receita</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{fmtCurrency(totalRevenue)}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Custo (CMV)</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{fmtCurrency(totalCost)}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Lucro bruto</p>
          <p className={`mt-1 text-2xl font-bold ${totalProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {fmtCurrency(totalProfit)}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Margem</p>
          <p className={`mt-1 text-2xl font-bold ${overallMargin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {fmt(overallMargin, 1)}%
          </p>
        </Card>
      </div>

      {/* Tabela */}
      <Card>
        <div className="mb-4">
          <Input label="" value={search} onChange={(v) => setSearch(v)} placeholder="Buscar produto..." />
        </div>

        {loading ? (
          <p className="text-center text-sm text-slate-500 py-8">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-8">
            {rows.length === 0 ? "Nenhum pedido aprovado neste mês." : "Nenhum produto encontrado."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">SKU</th>
                  <SortTh label="Produto" k="name" right={false} />
                  <SortTh label="Qtd" k="qty_sold" />
                  <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Custo médio</th>
                  <SortTh label="Receita" k="total_revenue" />
                  <SortTh label="CMV" k="total_cost" />
                  <SortTh label="Lucro" k="profit" />
                  <SortTh label="Margem %" k="margin_pct" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const m = r.margin_pct;
                  const noCost = r.avg_cost === 0;
                  return (
                    <tr key={r.product_id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-3 pr-4 font-mono text-xs text-slate-400">{r.sku ?? "—"}</td>
                      <td className="py-3 pr-4 font-medium text-slate-900">{r.name ?? "—"}</td>
                      <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                        {fmt(r.qty_sold, 2)} {r.unit ?? ""}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {noCost
                          ? <span className="text-amber-600 text-xs">sem custo</span>
                          : <span className="text-slate-600">{fmtCurrency(r.avg_cost)}</span>
                        }
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-slate-600">{fmtCurrency(r.total_revenue)}</td>
                      <td className="py-3 pr-4 text-right tabular-nums text-slate-600">{fmtCurrency(r.total_cost)}</td>
                      <td className={`py-3 pr-4 text-right font-semibold tabular-nums ${r.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {fmtCurrency(r.profit)}
                      </td>
                      <td className="py-3 text-right">
                        {noCost ? (
                          <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700">—</span>
                        ) : (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${m >= 20 ? "bg-emerald-100 text-emerald-700" : m >= 10 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                            {fmt(m, 1)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td colSpan={4} className="pt-3 pr-4 text-right font-semibold text-slate-700 text-sm">Total</td>
                  <td className="pt-3 pr-4 text-right font-bold tabular-nums">{fmtCurrency(totalRevenue)}</td>
                  <td className="pt-3 pr-4 text-right font-bold tabular-nums">{fmtCurrency(totalCost)}</td>
                  <td className={`pt-3 pr-4 text-right font-bold tabular-nums ${totalProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtCurrency(totalProfit)}</td>
                  <td className="pt-3 text-right">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${overallMargin >= 20 ? "bg-emerald-100 text-emerald-700" : overallMargin >= 10 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                      {fmt(overallMargin, 1)}%
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
