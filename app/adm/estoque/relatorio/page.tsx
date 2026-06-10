"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PageHeader, Card, Input } from "@/app/components/ui";
import Link from "next/link";

type MarginRow = {
  product_id: string;
  sku: string | null;
  name: string | null;
  unit: string | null;
  qty_sold: number;
  total_cost: number;
  total_revenue: number;
  margin_pct: number;
};

function fmtCurrency(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

type SortKey = "name" | "qty_sold" | "total_revenue" | "total_cost" | "margin_pct";

export default function RelatorioEstoquePage() {
  const router = useRouter();
  const [rows, setRows] = useState<MarginRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total_revenue");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) { router.replace("/login"); return; }
      const { data, error } = await supabase
        .from("v_stock_margin")
        .select("product_id,sku,name,unit,qty_sold,total_cost,total_revenue,margin_pct")
        .order("total_revenue", { ascending: false });
      if (!error && data) setRows(data as MarginRow[]);
      setLoading(false);
    })();
  }, []);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const filtered = useMemo(() => {
    let list = rows.filter((r) => Number(r.qty_sold) > 0 || true); // mostra tudo
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        (r.sku ?? "").toLowerCase().includes(q) || (r.name ?? "").toLowerCase().includes(q)
      );
    }
    list = [...list].sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      if (sortKey === "name") { va = a.name ?? ""; vb = b.name ?? ""; }
      else { va = Number(a[sortKey]); vb = Number(b[sortKey]); }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return list;
  }, [rows, search, sortKey, sortAsc]);

  const totalRevenue = rows.reduce((a, r) => a + Number(r.total_revenue), 0);
  const totalCost    = rows.reduce((a, r) => a + Number(r.total_cost), 0);
  const totalProfit  = totalRevenue - totalCost;
  const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  function SortTh({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <th
        className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-900 select-none text-right"
        onClick={() => toggleSort(k)}
      >
        {label} {active ? (sortAsc ? "↑" : "↓") : ""}
      </th>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatório de margem"
        subtitle="Custo vs receita por produto"
        right={
          <Link href="/adm/estoque" className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
            ← Estoque
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Receita total</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{fmtCurrency(totalRevenue)}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Custo total</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{fmtCurrency(totalCost)}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Lucro bruto</p>
          <p className={`mt-1 text-2xl font-bold ${totalProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {fmtCurrency(totalProfit)}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Margem geral</p>
          <p className={`mt-1 text-2xl font-bold ${overallMargin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {fmt(overallMargin, 1)}%
          </p>
        </Card>
      </div>

      <Card>
        <div className="mb-4">
          <Input label="" value={search} onChange={(v) => setSearch(v)} placeholder="Buscar produto..." />
        </div>

        {loading ? (
          <p className="text-center text-sm text-slate-500 py-8">Carregando...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">SKU</th>
                  <th
                    className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-900 select-none"
                    onClick={() => toggleSort("name")}
                  >
                    Produto {sortKey === "name" ? (sortAsc ? "↑" : "↓") : ""}
                  </th>
                  <SortTh label="Qtd vendida" k="qty_sold" />
                  <SortTh label="Receita" k="total_revenue" />
                  <SortTh label="Custo" k="total_cost" />
                  <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Lucro</th>
                  <SortTh label="Margem %" k="margin_pct" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-slate-500">Nenhum produto encontrado.</td>
                  </tr>
                ) : filtered.map((r) => {
                  const profit = Number(r.total_revenue) - Number(r.total_cost);
                  const margin = Number(r.margin_pct);
                  const hasSales = Number(r.qty_sold) > 0;
                  return (
                    <tr key={r.product_id} className={`border-b border-slate-50 hover:bg-slate-50 ${!hasSales ? "opacity-50" : ""}`}>
                      <td className="py-3 pr-4 font-mono text-xs text-slate-400">{r.sku ?? "—"}</td>
                      <td className="py-3 pr-4 font-medium text-slate-900">{r.name ?? "—"}</td>
                      <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                        {hasSales ? `${fmt(Number(r.qty_sold), 2)} ${r.unit ?? ""}` : "—"}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                        {hasSales ? fmtCurrency(Number(r.total_revenue)) : "—"}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                        {hasSales ? fmtCurrency(Number(r.total_cost)) : "—"}
                      </td>
                      <td className={`py-3 pr-4 text-right font-semibold tabular-nums ${profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {hasSales ? fmtCurrency(profit) : "—"}
                      </td>
                      <td className="py-3 text-right">
                        {hasSales ? (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${margin >= 20 ? "bg-emerald-100 text-emerald-700" : margin >= 10 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                            {fmt(margin, 1)}%
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200">
                    <td colSpan={3} className="pt-3 pr-4 font-semibold text-slate-700 text-right text-sm">Total</td>
                    <td className="pt-3 pr-4 text-right font-bold tabular-nums text-slate-900">{fmtCurrency(totalRevenue)}</td>
                    <td className="pt-3 pr-4 text-right font-bold tabular-nums text-slate-900">{fmtCurrency(totalCost)}</td>
                    <td className={`pt-3 pr-4 text-right font-bold tabular-nums ${totalProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtCurrency(totalProfit)}</td>
                    <td className="pt-3 text-right">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${overallMargin >= 20 ? "bg-emerald-100 text-emerald-700" : overallMargin >= 10 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                        {fmt(overallMargin, 1)}%
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
