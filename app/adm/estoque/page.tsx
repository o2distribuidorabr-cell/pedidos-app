"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  manual_cost: number | null;
  has_entries: boolean;
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

// Input de custo inline — mostra edição quando clicado
function CostCell({
  row,
  onSave,
}: {
  row: StockRow;
  onSave: (productId: string, value: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(row.avg_cost > 0 ? row.avg_cost : row.manual_cost ?? ""));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sincroniza quando o row muda externamente
  useEffect(() => {
    if (!editing) {
      setVal(String(row.avg_cost > 0 ? row.avg_cost : row.manual_cost ?? ""));
    }
  }, [row.avg_cost, row.manual_cost, editing]);

  function handleClick() {
    if (row.has_entries) return; // custo calculado por entradas — não editável manualmente
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function handleBlur() {
    setEditing(false);
    const n = parseFloat(val.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return;
    if (n === (row.manual_cost ?? 0) && !row.has_entries) return; // sem mudança
    setSaving(true);
    await onSave(row.product_id, n);
    setSaving(false);
  }

  if (row.has_entries) {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <span className="tabular-nums text-slate-600">{fmtCurrency(row.avg_cost)}</span>
        <span
          className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 cursor-default"
          title="Calculado automaticamente pelo preço médio das entradas"
        >
          auto
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          min="0"
          step="any"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => { if (e.key === "Enter") inputRef.current?.blur(); if (e.key === "Escape") { setEditing(false); } }}
          className="w-28 rounded-[10px] border border-slate-300 bg-white px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900/20"
          disabled={saving}
          autoFocus
        />
      ) : (
        <button
          onClick={handleClick}
          title="Clique para definir custo manual"
          className="group flex items-center gap-1 rounded-[8px] px-2 py-1 hover:bg-slate-100 transition text-right"
        >
          <span className="tabular-nums text-slate-600">
            {row.avg_cost > 0 ? fmtCurrency(row.avg_cost) : <span className="text-amber-500 text-xs">definir custo</span>}
          </span>
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-slate-300 group-hover:text-slate-500 flex-shrink-0">
            <path d="M11.013 1.427a1.75 1.75 0 012.474 2.474L4.91 12.48l-3.535.49a.75.75 0 01-.857-.857l.49-3.536 8.006-8.15zm1.06 1.06a.25.25 0 00-.353 0L3.527 10.75l-.235 1.7 1.7-.236 8.08-8.196a.25.25 0 000-.354l-.999-1zm-10.573 9.5l-.016.115.115-.016-.099-.099z"/>
          </svg>
        </button>
      )}
      {row.avg_cost === 0 && !editing && (
        <span className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700">
          manual
        </span>
      )}
      {row.avg_cost > 0 && !row.has_entries && !editing && (
        <span className="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-500">
          manual
        </span>
      )}
    </div>
  );
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
      .select("product_id,sku,name,unit,track_stock,manual_cost,has_entries,current_qty,avg_cost,selling_price")
      .order("name");
    if (!error && data) setRows(data as StockRow[]);
    setLoading(false);
  }

  async function toggleTrackStock(row: StockRow) {
    setTogglingId(row.product_id);
    const newVal = !row.track_stock;
    const { error } = await supabase.from("products").update({ track_stock: newVal }).eq("id", row.product_id);
    if (!error) {
      setRows((prev) => prev.map((r) => r.product_id === row.product_id ? { ...r, track_stock: newVal } : r));
    }
    setTogglingId(null);
  }

  async function saveManualCost(productId: string, value: number) {
    const { error } = await supabase.from("products").update({ manual_cost: value }).eq("id", productId);
    if (!error) {
      setRows((prev) =>
        prev.map((r) =>
          r.product_id === productId
            ? { ...r, manual_cost: value, avg_cost: r.has_entries ? r.avg_cost : value }
            : r
        )
      );
    }
  }

  const tracked = rows.filter((r) => r.track_stock);
  const hidden  = rows.filter((r) => !r.track_stock);

  const filtered = useMemo(() => {
    let list = showHidden ? rows : tracked;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        (r.sku ?? "").toLowerCase().includes(q) || (r.name ?? "").toLowerCase().includes(q)
      );
    }
    if (filter === "zero") list = list.filter((r) => r.track_stock && Number(r.current_qty) <= 0);
    if (filter === "low")  list = list.filter((r) => r.track_stock && Number(r.current_qty) > 0 && Number(r.current_qty) < 10);
    return list;
  }, [rows, search, filter, showHidden, tracked]);

  const totalValue = tracked.reduce((acc, r) => acc + Math.max(0, Number(r.current_qty)) * Number(r.avg_cost), 0);
  const zeroCount  = tracked.filter((r) => Number(r.current_qty) <= 0).length;
  const lowCount   = tracked.filter((r) => Number(r.current_qty) > 0 && Number(r.current_qty) < 10).length;
  const noCostCount = tracked.filter((r) => Number(r.avg_cost) === 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estoque"
        subtitle="Saldo atual por produto"
        right={
          <div className="flex gap-2">
            <Link href="/adm/estoque/entrada" className="inline-flex h-10 items-center gap-2 rounded-[14px] bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 transition">
              + Entrada
            </Link>
            <Link href="/adm/estoque/inventario" className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
              Inventário
            </Link>
            <Link href="/adm/estoque/movimentacao" className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
              Movimentação
            </Link>
            <Link href="/adm/estoque/relatorio" className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
              Relatório
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Valor em estoque</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{fmtCurrency(totalValue)}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Sem estoque</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{zeroCount}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Estoque baixo (&lt;10)</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{lowCount}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Sem custo</p>
          <p className={`mt-1 text-2xl font-bold ${noCostCount > 0 ? "text-amber-600" : "text-slate-400"}`}>{noCostCount}</p>
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
                className={["px-3 py-2 rounded-[10px] text-sm font-medium transition", filter === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"].join(" ")}
              >
                {f === "all" ? "Todos" : f === "zero" ? "Zerados" : "Baixo"}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowHidden((v) => !v)}
            className={["px-3 py-2 rounded-[10px] text-sm font-medium transition flex items-center gap-1.5", showHidden ? "bg-slate-200 text-slate-800" : "bg-slate-100 text-slate-500 hover:bg-slate-200"].join(" ")}
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
                  <th className="pb-3 pr-4 font-semibold text-slate-500 text-xs uppercase tracking-wide text-right">
                    Custo
                    <span className="ml-1 font-normal text-slate-400 normal-case">clique para editar</span>
                  </th>
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
                      <td className="py-3 pr-4">
                        <CostCell row={r} onSave={saveManualCost} />
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-slate-600">{fmtCurrency(totalVal)}</td>
                      <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                        {r.selling_price != null ? fmtCurrency(Number(r.selling_price)) : "—"}
                      </td>
                      <td className="py-3 text-center">
                        <button
                          onClick={() => toggleTrackStock(r)}
                          disabled={toggling}
                          title={r.track_stock ? "Clique para ocultar do estoque" : "Clique para ativar no estoque"}
                          className={["inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none", toggling ? "opacity-50 cursor-wait" : "cursor-pointer", r.track_stock ? "bg-emerald-500" : "bg-slate-200"].join(" ")}
                        >
                          <span className={["inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200", r.track_stock ? "translate-x-6" : "translate-x-1"].join(" ")} />
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
