"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";
import { PageHeader, Card, Button, Select, StatCard, Table, Badge } from "@/app/components/ui";

type StoreRow = { id: string; name: string };

type StoreStatusMonthlyRow = {
  store_id: string;
  status: string;
  month_ref: string;
  orders_count: number;
  total_qty: number;
  total_value: number;
};

type ItemTotalRow = {
  store_id: string;
  product_id: string;
  sku: string | null;
  product_name: string | null;
  unit: string | null;
  month_ref: string;
  total_qty: number;
  total_value: number;
  orders_count: number;
};

type OrderRow = {
  id: string;
  store_id: string;
  status: string | null;
  submitted_at: string | null;
};

type OrderItemRow = {
  order_id: string;
  product_id: string;
  qty: number | null;
  // ✅ relação pode vir como array
  products?: { sku: string | null; name: string | null; unit: string | null }[] | null;
};

type RangeAggRow = {
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  total_qty: number;
  orders_count: number;
  stores_count: number;
};

function money(v: number) {
  try {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${v}`;
  }
}

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function monthStartFromYM(ym: string) {
  const [y, m] = ym.split("-").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, 1);
}

function currentYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function startOfWeek(d: Date) {
  // semana começando na segunda-feira
  const x = new Date(d);
  const day = x.getDay(); // 0 dom, 1 seg...
  const diff = (day === 0 ? -6 : 1) - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function isoToBR(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** ✅ Select compacto com multi seleção (dropdown) */
function MultiStoreSelect({
  stores,
  selectedIds,
  onChangeSelectedIds,
}: {
  stores: StoreRow[];
  selectedIds: string[]; // vazio = todas
  onChangeSelectedIds: (ids: string[]) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stores) m.set(s.id, s.name);
    return m;
  }, [stores]);

  const label = useMemo(() => {
    if (selectedIds.length === 0) return "Todas as lojas";
    if (selectedIds.length === 1) return nameMap.get(selectedIds[0]) ?? "1 loja";
    return `${selectedIds.length} lojas`;
  }, [selectedIds, nameMap]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return stores;
    return stores.filter((s) => s.name.toLowerCase().includes(t));
  }, [stores, q]);

  function toggle(id: string) {
    onChangeSelectedIds(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
    );
  }

  function selectAll() {
    onChangeSelectedIds(stores.map((s) => s.id));
  }

  function clear() {
    onChangeSelectedIds([]); // volta para "todas"
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  return (
    <div ref={ref} className="relative w-full md:w-[320px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 shadow-sm hover:bg-slate-50"
        title={label}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="truncate">
            <div className="text-[11px] font-semibold text-slate-500">Lojas</div>
            <div className="font-semibold text-slate-900 truncate">{label}</div>
          </div>
          <span className="text-slate-400">▾</span>
        </div>
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          <div className="p-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar loja..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
            />

            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Selecionar todas
              </button>
              <button
                type="button"
                onClick={clear}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Limpar
              </button>

              <div className="ml-auto">
                {selectedIds.length === 0 ? (
                  <Badge tone="blue">Todas</Badge>
                ) : (
                  <Badge tone="blue">{selectedIds.length}</Badge>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200" />

          <div className="max-h-[280px] overflow-auto p-3">
            <label className="flex items-center gap-2 py-1 text-sm text-slate-700 select-none">
              <input type="checkbox" checked={selectedIds.length === 0} onChange={clear} className="h-4 w-4" />
              Todas as lojas
            </label>

            <div className="my-2 border-t border-slate-200" />

            {filtered.length === 0 ? (
              <div className="text-sm text-slate-600">Nenhuma loja encontrada.</div>
            ) : (
              <div className="grid gap-1 md:grid-cols-2">
                {filtered.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 py-1 text-sm text-slate-700 select-none">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(s.id)}
                      onChange={() => toggle(s.id)}
                      className="h-4 w-4"
                    />
                    <span className="truncate">{s.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 p-3 text-[11px] text-slate-500">
            Dica: seleção vazia = todas as lojas.
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AdmDashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // Mensal
  const [monthYM, setMonthYM] = useState<string>(currentYM());

  // ✅ Multi lojas: vazio = todas
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [statusMonthly, setStatusMonthly] = useState<StoreStatusMonthlyRow[]>([]);
  const [items, setItems] = useState<ItemTotalRow[]>([]);

  // Planejamento (por período)
  const [rangePreset, setRangePreset] = useState<"this_week" | "last_week" | "custom">("this_week");
  const [rangeStart, setRangeStart] = useState<string>(() => toISODate(startOfWeek(new Date())));
  const [rangeEnd, setRangeEnd] = useState<string>(() => toISODate(addDays(startOfWeek(new Date()), 6)));
  const [rangeStatus, setRangeStatus] = useState<"submitted_approved" | "all">("submitted_approved");
  const [rangeQuery, setRangeQuery] = useState<string>("");
  const [rangeSort, setRangeSort] = useState<"qty" | "name" | "sku">("qty");
  const [rangeOnlyNonZero, setRangeOnlyNonZero] = useState(true);

  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeMsg, setRangeMsg] = useState("");
  const [rangeAgg, setRangeAgg] = useState<RangeAggRow[]>([]);
  const [rangeOrdersCount, setRangeOrdersCount] = useState<number>(0);
  const [rangeStoresCount, setRangeStoresCount] = useState<number>(0);

  const storeNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stores) m.set(s.id, s.name);
    return m;
  }, [stores]);

  async function bootstrap() {
    setLoading(true);
    setMsg("");

    const ok = await requireAdminOrRedirect(router);
    if (!ok) {
      setLoading(false);
      return;
    }

    const { data: st, error: stErr } = await supabase.from("stores").select("id,name").order("name", { ascending: true });

    if (stErr) {
      setMsg(stErr.message);
      setStores([]);
    } else {
      setStores((st ?? []) as StoreRow[]);
    }

    await loadMonthly(monthYM, selectedStoreIds);
    await loadPlanning(rangeStart, rangeEnd, selectedStoreIds, rangeStatus);

    setLoading(false);
  }

  async function loadMonthly(ym: string, storeIds: string[]) {
    setMsg("");
    const monthStart = monthStartFromYM(ym);
    const monthRef = toISODate(monthStart);

    // Status
    let q1 = supabase
      .from("v_store_status_monthly")
      .select("store_id,status,month_ref,orders_count,total_qty,total_value")
      .eq("month_ref", monthRef);

    if (storeIds.length > 0) q1 = q1.in("store_id", storeIds);

    const { data: sm, error: smErr } = await q1;

    if (smErr) {
      setMsg(smErr.message);
      setStatusMonthly([]);
    } else {
      setStatusMonthly((sm ?? []) as StoreStatusMonthlyRow[]);
    }

    // Itens do mês
    let q2 = supabase
      .from("v_item_totals")
      .select("store_id,product_id,sku,product_name,unit,month_ref,total_qty,total_value,orders_count")
      .eq("month_ref", monthRef);

    if (storeIds.length > 0) q2 = q2.in("store_id", storeIds);

    const { data: it, error: itErr } = await q2.order("total_value", { ascending: false }).limit(500);

    if (itErr) {
      setMsg(itErr.message);
      setItems([]);
    } else {
      setItems((it ?? []) as ItemTotalRow[]);
    }
  }

  async function loadPlanning(
    startISO: string,
    endISO: string,
    storeIds: string[],
    statusMode: "submitted_approved" | "all"
  ) {
    setRangeLoading(true);
    setRangeMsg("");

    // inclui o dia final: endExclusive = end + 1 dia
    const endExclusive = toISODate(addDays(new Date(endISO + "T00:00:00"), 1));

    let q = supabase
      .from("orders")
      .select("id,store_id,status,submitted_at")
      .gte("submitted_at", startISO)
      .lt("submitted_at", endExclusive);

    if (storeIds.length > 0) q = q.in("store_id", storeIds);

    if (statusMode === "submitted_approved") {
      q = q.in("status", ["submitted", "approved"]);
    }

    const { data: orders, error: oErr } = await q.order("submitted_at", { ascending: true }).limit(5000);

    if (oErr) {
      setRangeMsg(oErr.message);
      setRangeAgg([]);
      setRangeOrdersCount(0);
      setRangeStoresCount(0);
      setRangeLoading(false);
      return;
    }

    const ord = (orders ?? []) as OrderRow[];
    if (ord.length === 0) {
      setRangeAgg([]);
      setRangeOrdersCount(0);
      setRangeStoresCount(0);
      setRangeLoading(false);
      return;
    }

    const orderIds = ord.map((x) => x.id);
    const storeSet = new Set(ord.map((x) => x.store_id));
    setRangeOrdersCount(orderIds.length);
    setRangeStoresCount(storeSet.size);

    const { data: it, error: itErr } = await supabase
      .from("order_items")
      .select("order_id,product_id,qty,products:products(sku,name,unit)")
      .in("order_id", orderIds)
      .limit(20000);

    if (itErr) {
      setRangeMsg(itErr.message);
      setRangeAgg([]);
      setRangeLoading(false);
      return;
    }

    // ✅ cast seguro (o supabase pode devolver shape diferente)
    const itemsRows = (it ?? []) as unknown as OrderItemRow[];

    const orderToStore = new Map<string, string>();
    for (const o of ord) orderToStore.set(o.id, o.store_id);

    const map = new Map<
      string,
      { sku: string; name: string; unit: string; qty: number; orders: Set<string>; stores: Set<string> }
    >();

    for (const r of itemsRows) {
      const pid = r.product_id;
      if (!pid) continue;

      const qty = Number(r.qty || 0);

      // ✅ products vem como array: pega o primeiro
      const p0 = r.products?.[0] ?? null;
      const psku = p0?.sku ?? "";
      const pname = p0?.name ?? "-";
      const punit = p0?.unit ?? "";

      const cur =
        map.get(pid) ?? {
          sku: psku,
          name: pname,
          unit: punit,
          qty: 0,
          orders: new Set<string>(),
          stores: new Set<string>(),
        };

      cur.qty += qty;

      if (r.order_id) {
        cur.orders.add(r.order_id);
        const sid = orderToStore.get(r.order_id);
        if (sid) cur.stores.add(sid);
      }

      if (!cur.sku && psku) cur.sku = psku;
      if ((cur.name === "-" || !cur.name) && pname) cur.name = pname;
      if (!cur.unit && punit) cur.unit = punit;

      map.set(pid, cur);
    }

    const agg: RangeAggRow[] = Array.from(map.entries()).map(([product_id, v]) => ({
      product_id,
      sku: v.sku,
      product_name: v.name,
      unit: v.unit,
      total_qty: v.qty,
      orders_count: v.orders.size,
      stores_count: v.stores.size,
    }));

    setRangeAgg(agg);
    setRangeLoading(false);
  }

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Atualiza mensal
  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadMonthly(monthYM, selectedStoreIds);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthYM, selectedStoreIds]);

  // Presets do período
  useEffect(() => {
    if (rangePreset === "custom") return;

    const now = new Date();

    if (rangePreset === "this_week") {
      const s = startOfWeek(now);
      const e = addDays(s, 6);
      setRangeStart(toISODate(s));
      setRangeEnd(toISODate(e));
    }

    if (rangePreset === "last_week") {
      const s = addDays(startOfWeek(now), -7);
      const e = addDays(s, 6);
      setRangeStart(toISODate(s));
      setRangeEnd(toISODate(e));
    }
  }, [rangePreset]);

  // Atualiza planejamento
  useEffect(() => {
    (async () => {
      if (!rangeStart || !rangeEnd) return;
      if (rangeStart > rangeEnd) return;
      await loadPlanning(rangeStart, rangeEnd, selectedStoreIds, rangeStatus);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, rangeEnd, selectedStoreIds, rangeStatus]);

  const kpis = useMemo(() => {
    const total = statusMonthly.reduce((acc, r) => acc + (Number(r.total_value) || 0), 0);
    const pedidos = statusMonthly.reduce((acc, r) => acc + (Number(r.orders_count) || 0), 0);

    const emAbertoStatuses = new Set(["submitted", "approved"]);
    const emAberto = statusMonthly
      .filter((r) => emAbertoStatuses.has(r.status))
      .reduce((acc, r) => acc + (Number(r.total_value) || 0), 0);

    return { total, pedidos, emAberto };
  }, [statusMonthly]);

  const topStores = useMemo(() => {
    // Só faz sentido quando não há seleção (todas as lojas)
    if (selectedStoreIds.length > 0) return [];
    const map = new Map<string, number>();
    for (const r of statusMonthly) {
      map.set(r.store_id, (map.get(r.store_id) ?? 0) + (Number(r.total_value) || 0));
    }
    return Array.from(map.entries())
      .map(([store_id, total_value]) => ({ store_id, total_value }))
      .sort((a, b) => b.total_value - a.total_value)
      .slice(0, 10);
  }, [statusMonthly, selectedStoreIds]);

  const topItems = useMemo(() => {
    const map = new Map<
      string,
      { product_name: string; sku: string; unit: string; total_value: number; total_qty: number; orders: number }
    >();

    for (const r of items) {
      const key = r.product_id;
      const cur =
        map.get(key) ?? {
          product_name: r.product_name ?? "-",
          sku: r.sku ?? "",
          unit: r.unit ?? "",
          total_value: 0,
          total_qty: 0,
          orders: 0,
        };

      cur.total_value += Number(r.total_value) || 0;
      cur.total_qty += Number(r.total_qty) || 0;
      cur.orders += Number(r.orders_count) || 0;

      map.set(key, cur);
    }

    return Array.from(map.entries())
      .map(([product_id, v]) => ({ product_id, ...v }))
      .sort((a, b) => b.total_value - a.total_value)
      .slice(0, 30);
  }, [items]);

  const rangeAggFiltered = useMemo(() => {
    const q = (rangeQuery || "").trim().toLowerCase();
    let arr = rangeAgg.slice();

    if (rangeOnlyNonZero) arr = arr.filter((r) => Number(r.total_qty || 0) > 0);

    if (q) {
      arr = arr.filter((r) => {
        const name = (r.product_name || "").toLowerCase();
        const sku = (r.sku || "").toLowerCase();
        const unit = (r.unit || "").toLowerCase();
        return name.includes(q) || sku.includes(q) || unit.includes(q);
      });
    }

    if (rangeSort === "qty") {
      arr.sort((a, b) => (Number(b.total_qty) || 0) - (Number(a.total_qty) || 0));
    } else if (rangeSort === "name") {
      arr.sort((a, b) => (a.product_name || "").localeCompare(b.product_name || "", "pt-BR"));
    } else {
      arr.sort((a, b) => (a.sku || "").localeCompare(b.sku || "", "pt-BR"));
    }

    return arr;
  }, [rangeAgg, rangeQuery, rangeSort, rangeOnlyNonZero]);

  const rangeKpis = useMemo(() => {
    const totalQty = rangeAgg.reduce((acc, r) => acc + (Number(r.total_qty) || 0), 0);
    const itemsCount = rangeAgg.filter((r) => (Number(r.total_qty) || 0) > 0).length;
    return { totalQty, itemsCount };
  }, [rangeAgg]);

  async function refreshAll() {
    setLoading(true);
    await loadMonthly(monthYM, selectedStoreIds);
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard (Admin)"
        subtitle="Visão geral da rede e planejamento por período"
        right={
          <div className="flex items-center gap-2">
            <Select
              value={monthYM}
              onChange={setMonthYM}
              options={Array.from({ length: 12 }).map((_, i) => {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                return { value: ym, label: ym };
              })}
            />

            <MultiStoreSelect stores={stores} selectedIds={selectedStoreIds} onChangeSelectedIds={setSelectedStoreIds} />

            <Button variant="secondary" onClick={refreshAll} disabled={loading}>
              Atualizar
            </Button>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm text-red-600">{msg}</div>
        </Card>
      ) : null}

      <Card title="Planejamento de compras (por período)">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-6">
            <div className="md:col-span-2">
              <div className="text-xs font-semibold text-slate-600 mb-1">Período</div>
              <Select
                value={rangePreset}
                onChange={(v) => setRangePreset(v as any)}
                options={[
                  { value: "this_week", label: "Semana atual (seg-dom)" },
                  { value: "last_week", label: "Semana passada (seg-dom)" },
                  { value: "custom", label: "Personalizado" },
                ]}
              />
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-600 mb-1">Início</div>
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => {
                  setRangePreset("custom");
                  setRangeStart(e.target.value);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
              />
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-600 mb-1">Fim</div>
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => {
                  setRangePreset("custom");
                  setRangeEnd(e.target.value);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
              />
            </div>

            <div className="md:col-span-2">
              <div className="text-xs font-semibold text-slate-600 mb-1">Considerar pedidos</div>
              <Select
                value={rangeStatus}
                onChange={(v) => setRangeStatus(v as any)}
                options={[
                  { value: "submitted_approved", label: "Em aberto (submitted/approved)" },
                  { value: "all", label: "Todos os status (no período)" },
                ]}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-6">
            <div className="md:col-span-3">
              <div className="text-xs font-semibold text-slate-600 mb-1">Buscar item (nome, SKU ou unidade)</div>
              <input
                value={rangeQuery}
                onChange={(e) => setRangeQuery(e.target.value)}
                placeholder="Ex.: batata • B001 • cx"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
              />
            </div>

            <div className="md:col-span-1">
              <div className="text-xs font-semibold text-slate-600 mb-1">Ordenar</div>
              <Select
                value={rangeSort}
                onChange={(v) => setRangeSort(v as any)}
                options={[
                  { value: "qty", label: "Maior qtd" },
                  { value: "name", label: "Nome" },
                  { value: "sku", label: "SKU" },
                ]}
              />
            </div>

            <div className="md:col-span-1 flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-700 select-none">
                <input
                  type="checkbox"
                  checked={rangeOnlyNonZero}
                  onChange={(e) => setRangeOnlyNonZero(e.target.checked)}
                  className="h-4 w-4"
                />
                Só itens &gt; 0
              </label>
            </div>

            <div className="md:col-span-1 flex items-end justify-end">
              <Button
                variant="secondary"
                onClick={() => loadPlanning(rangeStart, rangeEnd, selectedStoreIds, rangeStatus)}
                disabled={rangeLoading || !rangeStart || !rangeEnd || rangeStart > rangeEnd}
              >
                Atualizar período
              </Button>
            </div>
          </div>

          {rangeMsg ? <div className="text-sm text-red-600">{rangeMsg}</div> : null}

          <div className="grid gap-4 md:grid-cols-4">
            <StatCard title="Período" value={`${isoToBR(rangeStart)} → ${isoToBR(rangeEnd)}`} subtitle="Planejamento" />
            <StatCard title="Pedidos no período" value={rangeOrdersCount} subtitle={`Lojas: ${rangeStoresCount}`} />
            <StatCard title="Itens diferentes" value={rangeKpis.itemsCount} subtitle="Com qtd > 0" />
            <StatCard
              title="Qtd total (somada)"
              value={Number(rangeKpis.totalQty).toLocaleString("pt-BR")}
              subtitle="Somatório"
            />
          </div>

          {rangeLoading ? (
            <div className="text-sm text-slate-600">Carregando planejamento...</div>
          ) : rangeAggFiltered.length === 0 ? (
            <div className="text-sm text-slate-600">Sem itens para o período selecionado.</div>
          ) : (
            <Table
              headers={["Item", "Un", "Qtd total", "Pedidos", "Lojas"]}
              rows={rangeAggFiltered.map((r) => [
                <div key={`${r.product_id}-name`} className="min-w-[280px]">
                  <div className="font-semibold text-slate-900">{r.product_name}</div>
                  <div className="text-xs text-slate-500">{r.sku ? `SKU: ${r.sku}` : ""}</div>
                </div>,
                <div key={`${r.product_id}-unit`} className="text-slate-700">
                  {r.unit || "-"}
                </div>,
                <div key={`${r.product_id}-qty`} className="font-semibold text-slate-900">
                  {Number(r.total_qty || 0).toLocaleString("pt-BR")}
                </div>,
                <div key={`${r.product_id}-orders`} className="text-slate-700">
                  {Number(r.orders_count || 0)}
                </div>,
                <div key={`${r.product_id}-stores`} className="text-slate-700">
                  {Number(r.stores_count || 0)}
                </div>,
              ])}
            />
          )}

          <div className="text-xs text-slate-500">
            Observação: este planejamento usa <span className="font-semibold">submitted_at</span>.
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Total (mês)" value={money(kpis.total)} subtitle={`Ref: ${monthYM}`} />
        <StatCard title="Em aberto (por status)" value={money(kpis.emAberto)} subtitle="submitted/approved" />
        <StatCard title="Qtd. pedidos (mês)" value={kpis.pedidos} subtitle="Somatório por status" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Top lojas (valor no mês)">
          {selectedStoreIds.length > 0 ? (
            <div className="text-sm text-slate-600">
              Com lojas selecionadas, o ranking perde sentido. Limpe o filtro para ver “Top lojas”.
            </div>
          ) : topStores.length === 0 ? (
            <div className="text-sm text-slate-600">Sem dados no período.</div>
          ) : (
            <div className="space-y-2">
              {topStores.map((s) => (
                <div
                  key={s.store_id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2"
                >
                  <div className="text-sm text-slate-800">
                    <span className="font-semibold text-slate-900">{storeNameMap.get(s.store_id) ?? s.store_id}</span>
                  </div>
                  <Badge tone="blue">{money(s.total_value)}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Top itens (valor no mês)">
          {topItems.length === 0 ? (
            <div className="text-sm text-slate-600">Sem itens no período.</div>
          ) : (
            <Table
              headers={["Item", "Qtd", "Pedidos", "Valor"]}
              rows={topItems.map((r) => [
                <div key={`${r.product_id}-name`} className="min-w-[260px]">
                  <div className="font-semibold text-slate-900">{r.product_name}</div>
                  <div className="text-xs text-slate-500">
                    {r.sku ? `SKU: ${r.sku}` : ""} {r.unit ? ` • Un: ${r.unit}` : ""}
                  </div>
                </div>,
                <div key={`${r.product_id}-qty`}>{Number(r.total_qty).toLocaleString("pt-BR")}</div>,
                <div key={`${r.product_id}-orders`}>{Number(r.orders).toLocaleString("pt-BR")}</div>,
                <div key={`${r.product_id}-value`} className="font-semibold">
                  {money(r.total_value)}
                </div>,
              ])}
            />
          )}
        </Card>
      </div>

      <Card title="Status do mês">
        {statusMonthly.length === 0 ? (
          <div className="text-sm text-slate-600">Sem dados no período.</div>
        ) : (
          <Table
            headers={["Loja", "Status", "Pedidos", "Qtd Itens", "Valor"]}
            rows={statusMonthly
              .slice()
              .sort((a, b) => (Number(b.total_value) || 0) - (Number(a.total_value) || 0))
              .map((r, idx) => [
                <div key={`lo-${idx}`} className="font-semibold text-slate-900">
                  {storeNameMap.get(r.store_id) ?? r.store_id}
                </div>,
                <div key={`st-${idx}`}>{r.status}</div>,
                <div key={`od-${idx}`}>{Number(r.orders_count || 0)}</div>,
                <div key={`qt-${idx}`}>{Number(r.total_qty || 0).toLocaleString("pt-BR")}</div>,
                <div key={`vl-${idx}`} className="font-semibold">
                  {money(Number(r.total_value || 0))}
                </div>,
              ])}
          />
        )}
      </Card>
    </div>
  );
}