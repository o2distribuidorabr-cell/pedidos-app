"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PageHeader, Card, Input, Badge } from "@/app/components/ui";
import Link from "next/link";

type StockRow = {
  product_id: string;
  sku: string | null;
  name: string | null;
  unit: string | null;
  track_stock: boolean;
  current_qty: number;
  avg_cost: number;
  selling_price: number | null;
};

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtCurrency(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function EstoquePage() {
  const router = useRouter();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "zero">("all");
  const [showHidden, setShowHidden] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) { router.replace("/login"); return; }
      await loadBalance();
    })();
  }, []);

  async function loadBalance() {
    setLoading(true);
    const { data, error } = await supabase
      .from("v_stock_balance")
      .select("product_id,sku,name,unit,track_stock,current_qty,avg_cost,selling_price")
      .order("name");
    if (!error && data) setRows(data as StockRow[]);
    setLoading(false);
  }

  async function toggleTrackStock(row: StockRow) {
    setTogglingId(row.product_id);
    const newVal = !row.track_stock;
    const { error } = await supabase
      .from("products")
      .update({ track_stock: newVal })
      .eq("id", row.product_id);
    if (!error) {
      setRows((prev) =>
        prev.map((r) => r.product_id === row.product_id ? { ...r, track_stock: newVal } : r)
      );
    }
    setTogglingId(null);
  }

  const tracked = rows.filter((r) => r.track_stock);
  const hidden  = rows.filter((r) => !r.track_stock);

  const filtered = useMemo(() => {
    let list = showHidden ? rows : tracked;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        (r.sku ?? "").toLowerCase().includes(q) ||
        (r.name ?? "").toLowerCase().includes(q)
      );
    }
    if (filter === "zero") list = list.filter((r) => r.track_stock && Number(r.current_qty) <= 0);
    if (filter === "low")  list = list.filter((r) => r.track_stock && Number(r.current_qty) > 0 && Number(r.current_qty) < 10);
    return list;
  }, [rows, search, filter, showHidden, tracked]);

  const totalValue = tracked.reduce((acc, r) => acc + Math.max(0, Number(r.current_qty)) * Number(r.avg_cost), 0);
  const zeroCount  = tracked.filter((r) => Number(r.current_qty) <= 0).length;
  const lowCount   = tracked.filter((r) => Number(r.current_qty) > 0 && Number(r.current_qty) < 10).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estoque"
        subtitle="Saldo atual por produto"
        right={
          <div className="flex gap-2">
            <Link
              href="/adm/estoque/entrada"
              className="inline-flex h-10 items-center gap-2 rounded-[14px] bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 transition"
            >
              + Entrada
            </Link>
            <Link
              href="/adm/estoque/inventario"
              className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Inventário
            </Link>
            <Link
              href="/adm/estoque/relatorio"
              className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Relatório
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Valor em estoque</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{fmtCurrency(totalValue)}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Produtos sem estoque</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{zeroCount}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Estoque baixo (&lt;10)</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{lowCount}</p>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <Input label="" value={search} onChange={(v) => setSearch(v)} placeholder="Buscar produto..." />
          </div>
          <div className="flex gap-2">
            {(["all", "zero", "low"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={[
                  "px-3 py-2 rounded-[10px] text-sm font-medium transition",
                  filter === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                ].join(" ")}
              >
                {f === "all" ? "Todos" : f === "zero" ? "Zerados" : "Baixo"}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowHidden((v) => !v)}
            className={[
              "px-3 py-2 rounded-[10px] text-sm font-medium transition flex items-center gap-1.5",
              showHidden ? "bg-slate-200 text-slate-800" : "bg-slate-100 text-slate-500 hover:bg-slate-200",
            ].join(" ")}
            title={showHidden ? "Ocultar produtos desativados do estoque" : "Mostrar produtos ocultos no estoque"}
          >
            {showHidden ? (
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd"/><path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/></svg>
            )}
            {showHidden ? "Ocultar inativos" : `Ocultos (${hidden.length})`}
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500 py-8 text-center">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">Nenhum produto encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="pb-3 pr-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">SKU</th>
                  <th className="pb-3 pr-4 font-semibold text-slate-500 text-xs uppercase tracking-wide">Produto</th>
                  <th className="pb-3 pr-4 font-semibold text-slate-500 text-xs uppercase tracking-wide text-right">Saldo</th>
                  <th className="pb-3 pr-4 font-semibold text-slate-500 text-xs uppercase tracking-wide text-right">Custo médio</th>
                  <th className="pb-3 pr-4 font-semibold text-slate-500 text-xs uppercase tracking-wide text-right">Valor total</th>
                  <th className="pb-3 pr-4 font-semibold text-slate-500 text-xs uppercase tracking-wide text-right">Preço venda</th>
                  <th className="pb-3 font-semibold text-slate-500 text-xs uppercase tracking-wide text-center">Ativo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const qty = Number(r.current_qty);
                  const cost = Number(r.avg_cost);
                  const totalVal = Math.max(0, qty) * cost;
                  const isZero = qty <= 0;
                  const isLow = qty > 0 && qty < 10;
                  const isHidden = !r.track_stock;
                  const toggling = togglingId === r.product_id;
                  return (
                    <tr key={r.product_id} className={`border-b border-slate-50 hover:bg-slate-50 ${isHidden ? "opacity-50" : ""}`}>
                      <td className="py-3 pr-4 font-mono text-xs text-slate-400">{r.sku ?? "—"}</td>
                      <td className="py-3 pr-4 font-medium text-slate-900">
                        {r.name ?? "—"}
                        {!isHidden && isZero && <Badge tone="red" className="ml-2">Zerado</Badge>}
                        {!isHidden && isLow && <Badge tone="yellow" className="ml-2">Baixo</Badge>}
                        {isHidden && <Badge tone="neutral" className="ml-2">Oculto</Badge>}
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold tabular-nums">
                        <span className={isZero && !isHidden ? "text-red-600" : isLow && !isHidden ? "text-amber-600" : "text-slate-900"}>
                          {fmt(qty, 2)} {r.unit ?? ""}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-slate-600">{fmtCurrency(cost)}</td>
                      <td className="py-3 pr-4 text-right tabular-nums text-slate-600">{fmtCurrency(totalVal)}</td>
                      <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                        {r.selling_price != null ? fmtCurrency(Number(r.selling_price)) : "—"}
                      </td>
                      <td className="py-3 text-center">
                        <button
                          onClick={() => toggleTrackStock(r)}
                          disabled={toggling}
                          title={r.track_stock ? "Clique para ocultar do estoque" : "Clique para ativar no estoque"}
                          className={[
                            "inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none",
                            toggling ? "opacity-50 cursor-wait" : "cursor-pointer",
                            r.track_stock ? "bg-emerald-500" : "bg-slate-200",
                          ].join(" ")}
                        >
                          <span className={[
                            "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200",
                            r.track_stock ? "translate-x-6" : "translate-x-1",
                          ].join(" ")} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
