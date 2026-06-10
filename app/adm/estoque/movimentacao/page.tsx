"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PageHeader, Card, Input, Select } from "@/app/components/ui";
import Link from "next/link";

type ProductOption = {
  id: string;
  sku: string | null;
  name: string | null;
  unit: string | null;
};

type Movement = {
  id: string;
  movement_type: "ENTRY" | "ORDER_DEDUCTION" | "INVENTORY_ADJUSTMENT";
  quantity: number;
  unit_cost: number | null;
  unit_revenue: number | null;
  order_id: string | null;
  entry_id: string | null;
  notes: string | null;
  created_at: string;
};

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  ENTRY:                { label: "Entrada de compra",     color: "bg-emerald-100 text-emerald-700" },
  ORDER_DEDUCTION:      { label: "Saída por venda",       color: "bg-red-100 text-red-700" },
  INVENTORY_ADJUSTMENT: { label: "Ajuste de inventário",  color: "bg-amber-100 text-amber-700" },
};

function fmt(n: number, d = 2) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtCurrency(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDT(s: string) {
  return new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MovimentacaoPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [selProduct, setSelProduct] = useState("");
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "ENTRY" | "ORDER_DEDUCTION" | "INVENTORY_ADJUSTMENT">("ALL");

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) { router.replace("/login"); return; }
      const { data } = await supabase
        .from("products")
        .select("id,sku,name,unit")
        .eq("track_stock", true)
        .order("name");
      if (data) setProducts(data as ProductOption[]);
    })();
  }, []);

  useEffect(() => {
    if (!selProduct) { setMovements([]); return; }
    loadMovements(selProduct);
  }, [selProduct]);

  async function loadMovements(productId: string) {
    setLoading(true);
    const { data, error } = await supabase
      .from("stock_movements")
      .select("id,movement_type,quantity,unit_cost,unit_revenue,order_id,entry_id,notes,created_at")
      .eq("product_id", productId)
      .order("created_at", { ascending: false });
    if (!error && data) setMovements(data as Movement[]);
    setLoading(false);
  }

  const productOptions = products.map((p) => ({
    value: p.id,
    label: `${p.sku ? p.sku + " – " : ""}${p.name ?? ""}`,
  }));

  const selectedProduct = products.find((p) => p.id === selProduct);

  const filtered = useMemo(() => {
    let list = movements;
    if (typeFilter !== "ALL") list = list.filter((m) => m.movement_type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) =>
        (m.notes ?? "").toLowerCase().includes(q) ||
        (m.order_id ?? "").toLowerCase().includes(q) ||
        (m.entry_id ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [movements, typeFilter, search]);

  // Saldo acumulado por posição (em ordem cronológica reversa — precisamos inverter para calcular)
  const balanceMap = useMemo(() => {
    const sorted = [...movements].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    let running = 0;
    const map = new Map<string, number>();
    for (const m of sorted) {
      running += Number(m.quantity);
      map.set(m.id, running);
    }
    return map;
  }, [movements]);

  const totalEntries    = movements.filter((m) => m.movement_type === "ENTRY").reduce((a, m) => a + Number(m.quantity), 0);
  const totalDeductions = movements.filter((m) => m.movement_type === "ORDER_DEDUCTION").reduce((a, m) => a + Number(m.quantity), 0);
  const totalAdjust     = movements.filter((m) => m.movement_type === "INVENTORY_ADJUSTMENT").reduce((a, m) => a + Number(m.quantity), 0);
  const currentBalance  = totalEntries + totalDeductions + totalAdjust;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Movimentação de estoque"
        subtitle="Histórico de entradas, saídas e ajustes por produto"
        right={
          <Link href="/adm/estoque" className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
            ← Estoque
          </Link>
        }
      />

      <Card>
        <Select
          label="Selecione o produto"
          value={selProduct}
          onChange={(v) => setSelProduct(v)}
          options={[{ value: "", label: "Escolha um produto..." }, ...productOptions]}
        />
      </Card>

      {selProduct && selectedProduct && (
        <>
          {/* Resumo do produto */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Saldo atual</p>
              <p className={`mt-1 text-2xl font-bold ${currentBalance > 0 ? "text-slate-900" : "text-red-600"}`}>
                {fmt(currentBalance)} {selectedProduct.unit}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total entradas</p>
              <p className="mt-1 text-2xl font-bold text-emerald-600">+{fmt(totalEntries)}</p>
            </Card>
            <Card>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total saídas (vendas)</p>
              <p className="mt-1 text-2xl font-bold text-red-600">{fmt(totalDeductions)}</p>
            </Card>
            <Card>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Ajustes de inventário</p>
              <p className={`mt-1 text-2xl font-bold ${totalAdjust >= 0 ? "text-amber-600" : "text-red-600"}`}>
                {totalAdjust >= 0 ? "+" : ""}{fmt(totalAdjust)}
              </p>
            </Card>
          </div>

          <Card>
            {/* Filtros */}
            <div className="mb-4 flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[180px]">
                <Input label="" value={search} onChange={(v) => setSearch(v)} placeholder="Buscar referência ou nota..." />
              </div>
              <div className="flex gap-2">
                {(["ALL", "ENTRY", "ORDER_DEDUCTION", "INVENTORY_ADJUSTMENT"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={[
                      "px-3 py-2 rounded-[10px] text-xs font-medium transition whitespace-nowrap",
                      typeFilter === t ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                    ].join(" ")}
                  >
                    {t === "ALL" ? "Todos" : TYPE_LABEL[t].label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <p className="text-center text-sm text-slate-500 py-8">Carregando...</p>
            ) : filtered.length === 0 ? (
              <p className="text-center text-sm text-slate-500 py-8">
                {movements.length === 0 ? "Nenhuma movimentação registrada para este produto." : "Nenhum resultado para o filtro selecionado."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left">
                      <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Data</th>
                      <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                      <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Quantidade</th>
                      <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Saldo após</th>
                      <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Custo unit.</th>
                      <th className="pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Referência / Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((m) => {
                      const qty = Number(m.quantity);
                      const isPositive = qty > 0;
                      const info = TYPE_LABEL[m.movement_type] ?? { label: m.movement_type, color: "bg-slate-100 text-slate-600" };
                      const balAfter = balanceMap.get(m.id);
                      const ref = m.order_id
                        ? `Pedido ${m.order_id.slice(0, 8).toUpperCase()}`
                        : m.entry_id
                        ? `Entrada ${m.entry_id.slice(0, 8).toUpperCase()}`
                        : "—";
                      return (
                        <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-3 pr-4 text-slate-500 whitespace-nowrap">{fmtDT(m.created_at)}</td>
                          <td className="py-3 pr-4">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${info.color}`}>
                              {info.label}
                            </span>
                          </td>
                          <td className={`py-3 pr-4 text-right font-bold tabular-nums ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
                            {isPositive ? "+" : ""}{fmt(qty, 4)} {selectedProduct.unit}
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                            {balAfter !== undefined ? fmt(balAfter, 4) : "—"}
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums text-slate-500">
                            {m.unit_cost != null ? fmtCurrency(Number(m.unit_cost)) : "—"}
                          </td>
                          <td className="py-3 text-slate-500 text-xs">
                            <span className="font-mono">{ref}</span>
                            {m.notes && <span className="ml-2 text-slate-400">{m.notes}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
