"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";
import {
  PageHeader,
  Card,
  Select,
  Table,
  Badge,
} from "@/app/components/ui";

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
  logistic_status:
    | "RECEBIDO"
    | "EM_SEPARACAO"
    | "SAIU_PARA_ENTREGA"
    | "ENTREGUE"
    | null;
};

type ProductMini = {
  sku: string | null;
  name: string | null;
  unit: string | null;
};

type OrderItemRow = {
  order_id: string;
  product_id: string;
  qty: number | null;
  products?: ProductMini | ProductMini[] | null;
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

type WeeklyDemandPoint = {
  week_ref: string;
  total_qty: number;
  total_orders: number;
};

type StoreDemandPoint = {
  store_id: string;
  store_name: string;
  total_qty: number;
  total_value: number;
  orders_count: number;
};

type AbcRow = {
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  total_qty: number;
  orders_count: number;
  stores_count: number;
  share_pct: number;
  cumulative_pct: number;
  curve: "A" | "B" | "C";
};

type ForecastRow = {
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  avg_weekly_qty: number;
  last_week_qty: number;
  suggested_next_week_qty: number;
  confidence: "Alta" | "Média" | "Baixa";

  pack_label: string | null;
  pack_base_qty: number | null;
  suggested_pack_count: number | null;
  suggested_display: string;
};

type ChartTone = "blue" | "green" | "yellow" | "red" | "slate";

type SimpleBarChartItem = {
  label: string;
  value: number;
  tone?: ChartTone;
};

type PackInfo = {
  perPack?: number;
  perPackKg?: number;
  packLabel: string;
  unitLabel: string;
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
  const x = new Date(d);
  const day = x.getDay();
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

function normalizeProduct(p?: ProductMini | ProductMini[] | null): ProductMini | null {
  if (!p) return null;
  if (Array.isArray(p)) return p[0] ?? null;
  return p;
}

function weekLabel(isoDate: string) {
  return isoToBR(isoDate);
}

function statusTone(status: string) {
  const s = String(status || "").toLowerCase();
  if (s === "approved") return "green" as const;
  if (s === "rejected") return "red" as const;
  if (s === "submitted") return "blue" as const;
  return "neutral" as const;
}

function curveTone(curve: "A" | "B" | "C") {
  if (curve === "A") return "red" as const;
  if (curve === "B") return "yellow" as const;
  return "blue" as const;
}

function confidenceTone(conf: "Alta" | "Média" | "Baixa") {
  if (conf === "Alta") return "green" as const;
  if (conf === "Média") return "yellow" as const;
  return "neutral" as const;
}

function chartToneByStatus(status: string): ChartTone {
  const s = String(status || "").toLowerCase();
  if (s === "approved") return "green";
  if (s === "rejected") return "red";
  if (s === "submitted") return "blue";
  if (s === "draft") return "yellow";
  return "slate";
}

function chartToneByDemandMode(mode: "pending" | "delivered" | "all"): ChartTone {
  if (mode === "delivered") return "green";
  if (mode === "pending") return "yellow";
  return "blue";
}

function normTxt(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const PACK_RULES: Array<{ match: string; info: PackInfo }> = [
  { match: "bife picanha 120g", info: { perPack: 120, packLabel: "cx", unitLabel: "un" } },
  { match: "bife picanha120g", info: { perPack: 120, packLabel: "cx", unitLabel: "un" } },
  { match: "bife picanha 56g", info: { perPack: 216, packLabel: "cx", unitLabel: "un" } },
  { match: "bife vegetariano", info: { perPack: 20, packLabel: "pct", unitLabel: "un" } },
  { match: "copo milkshake", info: { perPack: 50, packLabel: "pct", unitLabel: "un" } },
  { match: "embalagem batata m", info: { perPack: 800, packLabel: "cx", unitLabel: "un" } },
  { match: "emba batata m", info: { perPack: 800, packLabel: "cx", unitLabel: "un" } },
  { match: "embalagem batata p", info: { perPack: 2250, packLabel: "cx", unitLabel: "un" } },
  { match: "emba batata p", info: { perPack: 2250, packLabel: "cx", unitLabel: "un" } },
  { match: "emba kraft", info: { perPack: 50, packLabel: "pct", unitLabel: "un" } },
  { match: "embalagem kraft", info: { perPack: 50, packLabel: "pct", unitLabel: "un" } },
  { match: "etiqueta de identificacao", info: { perPack: 1000, packLabel: "rolo", unitLabel: "un" } },
  { match: "etiqueta identificacao", info: { perPack: 1000, packLabel: "rolo", unitLabel: "un" } },
  { match: "etiqueta identific", info: { perPack: 1000, packLabel: "rolo", unitLabel: "un" } },
  { match: "molho american burger", info: { perPackKg: 3.5, packLabel: "balde", unitLabel: "kg" } },
  { match: "molho american", info: { perPackKg: 3.5, packLabel: "balde", unitLabel: "kg" } },
  { match: "molho barbecue", info: { perPackKg: 0.397, packLabel: "frasco", unitLabel: "kg" } },
  { match: "molho barbacue", info: { perPackKg: 0.397, packLabel: "frasco", unitLabel: "kg" } },
  { match: "barbecue whisky", info: { perPackKg: 0.397, packLabel: "frasco", unitLabel: "kg" } },
  { match: "barbacue whisky", info: { perPackKg: 0.397, packLabel: "frasco", unitLabel: "kg" } },
  { match: "barbecue wisky", info: { perPackKg: 0.397, packLabel: "frasco", unitLabel: "kg" } },
  { match: "barbacue wisky", info: { perPackKg: 0.397, packLabel: "frasco", unitLabel: "kg" } },
  { match: "pao hb", info: { perPack: 48, packLabel: "cx", unitLabel: "un" } },
  { match: "papel acoplado", info: { perPack: 1000, packLabel: "fardo", unitLabel: "un" } },
  { match: "sache baconese", info: { perPack: 60, packLabel: "cx", unitLabel: "un" } },
  { match: "sache maionese temperada", info: { perPack: 60, packLabel: "cx", unitLabel: "un" } },
];

function getPackInfo(productName: string | null | undefined): PackInfo | null {
  const n = normTxt(productName || "");
  if (!n) return null;
  const rule = PACK_RULES.find((r) => n.includes(r.match));
  return rule?.info ?? null;
}

function ceilPacks(qty: number, pack: PackInfo) {
  const q = Number(qty) || 0;
  if (pack.perPackKg && pack.perPackKg > 0) return Math.ceil(q / pack.perPackKg);
  if (pack.perPack && pack.perPack > 0) return Math.ceil(q / pack.perPack);
  return 0;
}

function formatVolumeSuggestion(qty: number, unit: string, productName: string) {
  const pack = getPackInfo(productName);
  const qtyFmt = Number(qty || 0).toLocaleString("pt-BR");

  if (!pack) {
    return {
      pack_label: null,
      pack_base_qty: null,
      suggested_pack_count: null,
      suggested_display: `${qtyFmt} ${unit || "un"}`,
    };
  }

  const packCount = ceilPacks(qty, pack);
  const baseQty = pack.perPackKg ?? pack.perPack ?? null;

  return {
    pack_label: pack.packLabel,
    pack_base_qty: baseQty,
    suggested_pack_count: packCount,
    suggested_display: `${qtyFmt} ${pack.unitLabel} • ${packCount} ${pack.packLabel}`,
  };
}

function PrimaryActionButton({
  children,
  onClick,
  disabled,
  fullWidth,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-11 items-center justify-center rounded-[18px] px-4 text-sm font-semibold text-white transition",
        "bg-cyan-600 shadow-[0_14px_34px_rgba(8,145,178,0.22)] hover:bg-cyan-700",
        "disabled:cursor-not-allowed disabled:opacity-50",
        fullWidth ? "w-full" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SecondaryActionButton({
  children,
  onClick,
  disabled,
  fullWidth,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-11 items-center justify-center rounded-[18px] px-4 text-sm font-semibold transition",
        "border border-slate-200 bg-white text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] hover:bg-slate-50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        fullWidth ? "w-full" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

function SummaryBox({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900">{value}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <SectionTitle title={title} subtitle={subtitle} />
      <div className="mt-6">{children}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <div className="text-sm text-slate-600">{text}</div>
    </div>
  );
}

function SimpleBarChart({
  data,
  valueFormatter,
}: {
  data: SimpleBarChartItem[];
  valueFormatter?: (value: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 0);

  const toneClass = (tone?: ChartTone) => {
    if (tone === "green") return "bg-emerald-500";
    if (tone === "yellow") return "bg-amber-400";
    if (tone === "red") return "bg-red-500";
    if (tone === "slate") return "bg-slate-400";
    return "bg-cyan-500";
  };

  if (data.length === 0) {
    return <div className="text-sm text-slate-600">Sem dados.</div>;
  }

  return (
    <div className="space-y-3">
      {data.map((item) => {
        const pct = max > 0 ? (item.value / max) * 100 : 0;
        return (
          <div key={item.label} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0 truncate text-slate-700">{item.label}</div>
              <div className="shrink-0 font-semibold text-slate-900">
                {valueFormatter ? valueFormatter(item.value) : item.value.toLocaleString("pt-BR")}
              </div>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${toneClass(item.tone)}`}
                style={{ width: `${Math.max(pct, item.value > 0 ? 6 : 0)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniColumnsChart({
  data,
}: {
  data: WeeklyDemandPoint[];
}) {
  const max = Math.max(...data.map((d) => d.total_qty), 0);

  if (data.length === 0) {
    return <div className="text-sm text-slate-600">Sem dados.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[360px] items-end gap-3">
        {data.map((item) => {
          const pct = max > 0 ? (item.total_qty / max) * 100 : 0;
          return (
            <div key={item.week_ref} className="flex flex-1 flex-col items-center gap-2">
              <div className="text-xs font-semibold text-slate-700">
                {Number(item.total_qty || 0).toLocaleString("pt-BR")}
              </div>
              <div className="flex h-44 w-full items-end rounded-[18px] bg-slate-50 px-2 py-2">
                <div
                  className="w-full rounded-[12px] bg-cyan-500 shadow-[0_14px_24px_rgba(6,182,212,0.22)]"
                  style={{ height: `${Math.max(pct, item.total_qty > 0 ? 8 : 0)}%` }}
                />
              </div>
              <div className="text-center text-[11px] text-slate-500">{weekLabel(item.week_ref)}</div>
              <div className="text-[11px] text-slate-400">{item.total_orders} ped.</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HeatRows({
  rows,
}: {
  rows: StoreDemandPoint[];
}) {
  const max = Math.max(...rows.map((r) => r.total_qty), 0);

  if (rows.length === 0) {
    return <div className="text-sm text-slate-600">Sem dados.</div>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const pct = max > 0 ? (row.total_qty / max) * 100 : 0;
        return (
          <div key={row.store_id} className="rounded-[18px] border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-semibold text-slate-900">{row.store_name}</div>
                <div className="text-xs text-slate-500">
                  {row.orders_count} pedidos • {money(row.total_value)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-semibold text-slate-900">
                  {Number(row.total_qty || 0).toLocaleString("pt-BR")}
                </div>
                <div className="text-xs text-slate-500">qtd</div>
              </div>
            </div>

            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${Math.max(pct, row.total_qty > 0 ? 6 : 0)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MultiStoreSelect({
  stores,
  selectedIds,
  onChangeSelectedIds,
}: {
  stores: StoreRow[];
  selectedIds: string[];
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
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
    );
  }

  function selectAll() {
    onChangeSelectedIds(stores.map((s) => s.id));
  }

  function clear() {
    onChangeSelectedIds([]);
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
    <div ref={ref} className="relative w-full md:w-[260px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-[18px] border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 shadow-sm hover:bg-slate-50"
        title={label}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="truncate">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Lojas</div>
            <div className="truncate font-semibold text-slate-900">{label}</div>
          </div>
          <span className="text-slate-400">▾</span>
        </div>
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[360px] max-w-[85vw] overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-lg">
          <div className="p-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar loja..."
              className="w-full rounded-[16px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
            />

            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Selecionar todas
              </button>
              <button
                type="button"
                onClick={clear}
                className="rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
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

          <div className="max-h-[220px] overflow-auto p-3">
            <label className="flex select-none items-center gap-2 py-1 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={selectedIds.length === 0}
                onChange={clear}
                className="h-4 w-4"
              />
              Todas as lojas
            </label>

            <div className="my-2 border-t border-slate-200" />

            {filtered.length === 0 ? (
              <div className="text-sm text-slate-600">Nenhuma loja encontrada.</div>
            ) : (
              <div className="grid grid-cols-1 gap-1">
                {filtered.map((s) => (
                  <label key={s.id} className="flex select-none items-center gap-2 py-1 text-sm text-slate-700">
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

  const [monthYM, setMonthYM] = useState<string>(currentYM());
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [statusMonthly, setStatusMonthly] = useState<StoreStatusMonthlyRow[]>([]);
  const [items, setItems] = useState<ItemTotalRow[]>([]);

  const [rangePreset, setRangePreset] = useState<"this_week" | "last_week" | "custom">("this_week");
  const [rangeStart, setRangeStart] = useState<string>(() => toISODate(startOfWeek(new Date())));
  const [rangeEnd, setRangeEnd] = useState<string>(() => toISODate(addDays(startOfWeek(new Date()), 6)));

  const [rangeDemandMode, setRangeDemandMode] = useState<"pending" | "delivered" | "all">("pending");
  const [rangeStatus, setRangeStatus] = useState<"submitted_approved" | "all">("submitted_approved");
  const [rangeQuery, setRangeQuery] = useState<string>("");
  const [rangeSort, setRangeSort] = useState<"qty" | "name" | "sku">("qty");
  const [rangeOnlyNonZero, setRangeOnlyNonZero] = useState(true);

  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeMsg, setRangeMsg] = useState("");
  const [rangeAgg, setRangeAgg] = useState<RangeAggRow[]>([]);
  const [rangeOrdersCount, setRangeOrdersCount] = useState<number>(0);
  const [rangeStoresCount, setRangeStoresCount] = useState<number>(0);
  const [weeklyDemand, setWeeklyDemand] = useState<WeeklyDemandPoint[]>([]);
  const [storeDemand, setStoreDemand] = useState<StoreDemandPoint[]>([]);

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

    const { data: st, error: stErr } = await supabase
      .from("stores")
      .select("id,name")
      .order("name", { ascending: true });

    if (stErr) {
      setMsg(stErr.message);
      setStores([]);
    } else {
      setStores((st ?? []) as StoreRow[]);
    }

    await loadMonthly(monthYM, selectedStoreIds);
    await loadPlanning(rangeStart, rangeEnd, selectedStoreIds, rangeStatus, rangeDemandMode);

    setLoading(false);
  }

  async function loadMonthly(ym: string, storeIds: string[]) {
    setMsg("");
    const monthStart = monthStartFromYM(ym);
    const monthRef = toISODate(monthStart);

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
    statusMode: "submitted_approved" | "all",
    demandMode: "pending" | "delivered" | "all"
  ) {
    setRangeLoading(true);
    setRangeMsg("");

    const startTS = `${startISO}T00:00:00`;
    const endExclusiveISO = toISODate(addDays(new Date(`${endISO}T00:00:00`), 1));
    const endTS = `${endExclusiveISO}T00:00:00`;

    let q = supabase
      .from("orders")
      .select("id,store_id,status,submitted_at,logistic_status")
      .gte("submitted_at", startTS)
      .lt("submitted_at", endTS);

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
      setWeeklyDemand([]);
      setStoreDemand([]);
      setRangeLoading(false);
      return;
    }

    let ord = (orders ?? []) as OrderRow[];

    if (demandMode === "pending") {
      ord = ord.filter((o) => o.logistic_status !== "ENTREGUE");
    } else if (demandMode === "delivered") {
      ord = ord.filter((o) => o.logistic_status === "ENTREGUE");
    }

    if (ord.length === 0) {
      setRangeAgg([]);
      setRangeOrdersCount(0);
      setRangeStoresCount(0);
      setWeeklyDemand([]);
      setStoreDemand([]);
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
      setWeeklyDemand([]);
      setStoreDemand([]);
      setRangeLoading(false);
      return;
    }

    const itemsRows = (it ?? []) as unknown as OrderItemRow[];

    const productIds = Array.from(new Set(itemsRows.map((r) => r.product_id).filter(Boolean)));
    const needFallback = itemsRows.some((r) => !normalizeProduct(r.products));
    const productMap = new Map<string, ProductMini>();

    if (needFallback && productIds.length > 0) {
      const { data: pr, error: prErr } = await supabase
        .from("products")
        .select("id,sku,name,unit")
        .in("id", productIds)
        .limit(5000);

      if (!prErr && pr) {
        for (const p of pr as any[]) {
          productMap.set(String(p.id), {
            sku: p.sku ?? null,
            name: p.name ?? null,
            unit: p.unit ?? null,
          });
        }
      }
    }

    const orderToStore = new Map<string, string>();
    const orderToWeek = new Map<string, string>();

    for (const o of ord) {
      orderToStore.set(o.id, o.store_id);
      if (o.submitted_at) {
        const w = startOfWeek(new Date(o.submitted_at));
        orderToWeek.set(o.id, toISODate(w));
      }
    }

    const productAggMap = new Map<
      string,
      { sku: string; name: string; unit: string; qty: number; orders: Set<string>; stores: Set<string> }
    >();

    const weeklyMap = new Map<string, { total_qty: number; order_ids: Set<string> }>();
    const demandStoreMap = new Map<string, { store_name: string; total_qty: number; total_value_proxy: number; order_ids: Set<string> }>();

    for (const r of itemsRows) {
      const pid = r.product_id;
      if (!pid) continue;

      const qty = Number(r.qty || 0);

      const pJoin = normalizeProduct(r.products);
      const pFallback = productMap.get(pid) ?? null;

      const psku = pJoin?.sku ?? pFallback?.sku ?? "";
      const pname = pJoin?.name ?? pFallback?.name ?? "-";
      const punit = pJoin?.unit ?? pFallback?.unit ?? "";

      const cur =
        productAggMap.get(pid) ?? {
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

        const wk = orderToWeek.get(r.order_id);
        if (wk) {
          const weeklyCur = weeklyMap.get(wk) ?? { total_qty: 0, order_ids: new Set<string>() };
          weeklyCur.total_qty += qty;
          weeklyCur.order_ids.add(r.order_id);
          weeklyMap.set(wk, weeklyCur);
        }

        if (sid) {
          const stName = storeNameMap.get(sid) ?? sid;
          const storeCur =
            demandStoreMap.get(sid) ?? {
              store_name: stName,
              total_qty: 0,
              total_value_proxy: 0,
              order_ids: new Set<string>(),
            };

          storeCur.total_qty += qty;
          storeCur.total_value_proxy += qty;
          storeCur.order_ids.add(r.order_id);
          demandStoreMap.set(sid, storeCur);
        }
      }

      if (!cur.sku && psku) cur.sku = psku;
      if ((cur.name === "-" || !cur.name) && pname) cur.name = pname;
      if (!cur.unit && punit) cur.unit = punit;

      productAggMap.set(pid, cur);
    }

    const agg: RangeAggRow[] = Array.from(productAggMap.entries()).map(([product_id, v]) => ({
      product_id,
      sku: v.sku,
      product_name: v.name,
      unit: v.unit,
      total_qty: v.qty,
      orders_count: v.orders.size,
      stores_count: v.stores.size,
    }));

    const weekly: WeeklyDemandPoint[] = Array.from(weeklyMap.entries())
      .map(([week_ref, v]) => ({
        week_ref,
        total_qty: v.total_qty,
        total_orders: v.order_ids.size,
      }))
      .sort((a, b) => a.week_ref.localeCompare(b.week_ref, "pt-BR"));

    const storesAgg: StoreDemandPoint[] = Array.from(demandStoreMap.entries())
      .map(([store_id, v]) => ({
        store_id,
        store_name: v.store_name,
        total_qty: v.total_qty,
        total_value: v.total_value_proxy,
        orders_count: v.order_ids.size,
      }))
      .sort((a, b) => b.total_qty - a.total_qty);

    setRangeAgg(agg);
    setWeeklyDemand(weekly);
    setStoreDemand(storesAgg);
    setRangeLoading(false);
  }

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadMonthly(monthYM, selectedStoreIds);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthYM, selectedStoreIds]);

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

  useEffect(() => {
    (async () => {
      if (!rangeStart || !rangeEnd) return;
      if (rangeStart > rangeEnd) return;
      await loadPlanning(rangeStart, rangeEnd, selectedStoreIds, rangeStatus, rangeDemandMode);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, rangeEnd, selectedStoreIds, rangeStatus, rangeDemandMode]);

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
    if (selectedStoreIds.length > 0) return [];
    const map = new Map<string, number>();

    for (const r of statusMonthly) {
      map.set(r.store_id, (map.get(r.store_id) ?? 0) + (Number(r.total_value) || 0));
    }

    return Array.from(map.entries())
      .map(([store_id, total_value]) => ({ store_id, total_value }))
      .sort((a, b) => b.total_value - a.total_value)
      .slice(0, 8);
  }, [statusMonthly, selectedStoreIds]);

  const monthlyStatusChartData: SimpleBarChartItem[] = useMemo(() => {
    const map = new Map<string, number>();

    for (const r of statusMonthly) {
      map.set(r.status, (map.get(r.status) ?? 0) + (Number(r.total_value) || 0));
    }

    return Array.from(map.entries())
      .map(([label, value]) => ({
        label,
        value,
        tone: chartToneByStatus(label),
      }))
      .sort((a, b) => b.value - a.value);
  }, [statusMonthly]);

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
      .slice(0, 20);
  }, [items]);

  const rangeAggFiltered = useMemo(() => {
    const q = (rangeQuery || "").trim().toLowerCase();
    let arr = rangeAgg.slice();

    if (rangeOnlyNonZero) {
      arr = arr.filter((r) => Number(r.total_qty || 0) > 0);
    }

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

  const topDemandChart: SimpleBarChartItem[] = useMemo(() => {
    return rangeAggFiltered.slice(0, 8).map((r) => ({
      label: r.product_name,
      value: Number(r.total_qty || 0),
      tone: chartToneByDemandMode(rangeDemandMode),
    }));
  }, [rangeAggFiltered, rangeDemandMode]);

  const abcRows = useMemo<AbcRow[]>(() => {
    const base = rangeAggFiltered
      .slice()
      .sort((a, b) => (Number(b.total_qty) || 0) - (Number(a.total_qty) || 0));

    const total = base.reduce((acc, r) => acc + (Number(r.total_qty) || 0), 0);
    let cumulative = 0;

    return base.map((r) => {
      const share = total > 0 ? (Number(r.total_qty || 0) / total) * 100 : 0;
      cumulative += share;

      let curve: "A" | "B" | "C" = "C";
      if (cumulative <= 80) curve = "A";
      else if (cumulative <= 95) curve = "B";

      return {
        ...r,
        share_pct: share,
        cumulative_pct: cumulative,
        curve,
      };
    });
  }, [rangeAggFiltered]);

  const forecastRows = useMemo<ForecastRow[]>(() => {
    const recentWeeks = weeklyDemand.slice(-4).map((w) => w.week_ref);

    if (recentWeeks.length === 0) return [];

    const forecastBase = rangeAggFiltered.map((item) => {
      const avg = Number(item.total_qty || 0) / Math.max(recentWeeks.length, 1);
      const lastWeekQty = avg;
      const suggested = Math.ceil(avg);

      let confidence: "Alta" | "Média" | "Baixa" = "Baixa";
      if (avg >= 20) confidence = "Alta";
      else if (avg >= 8) confidence = "Média";

      const volume = formatVolumeSuggestion(
        suggested,
        item.unit || "un",
        item.product_name || ""
      );

      return {
        product_id: item.product_id,
        sku: item.sku,
        product_name: item.product_name,
        unit: item.unit,
        avg_weekly_qty: avg,
        last_week_qty: lastWeekQty,
        suggested_next_week_qty: suggested,
        confidence,

        pack_label: volume.pack_label,
        pack_base_qty: volume.pack_base_qty,
        suggested_pack_count: volume.suggested_pack_count,
        suggested_display: volume.suggested_display,
      };
    });

    return forecastBase.sort((a, b) => b.suggested_next_week_qty - a.suggested_next_week_qty);
  }, [rangeAggFiltered, weeklyDemand]);

  function buildForecastExportRows() {
    return forecastRows.map((r) => ({
      SKU: r.sku || "",
      Produto: r.product_name || "",
      Unidade: r.unit || "",
      "Média semanal": Number(r.avg_weekly_qty.toFixed(1)),
      "Última base": Number(r.last_week_qty.toFixed(1)),
      "Sugestão próxima semana": r.suggested_next_week_qty,
      "Sugestão por volume": r.suggested_display,
      Confiança: r.confidence,
    }));
  }

  function exportForecastXlsx() {
    const rows = buildForecastExportRows();

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Previsao Compras");

    const ws2 = XLSX.utils.json_to_sheet(
      rangeAggFiltered.map((r) => ({
        SKU: r.sku || "",
        Produto: r.product_name || "",
        Unidade: r.unit || "",
        "Qtd total": Number(r.total_qty || 0),
        Pedidos: Number(r.orders_count || 0),
        Lojas: Number(r.stores_count || 0),
      }))
    );
    XLSX.utils.book_append_sheet(wb, ws2, "Demanda Detalhada");

    XLSX.writeFileXLSX(
      wb,
      `previsao-compras-${rangeStart}-${rangeEnd}.xlsx`
    );
  }

  function exportForecastPdf() {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    doc.setFontSize(14);
    doc.text("Previsão de compra para a próxima semana", 14, 14);

    doc.setFontSize(9);
    doc.text(
      `Período analisado: ${isoToBR(rangeStart)} até ${isoToBR(rangeEnd)} | Demanda: ${rangeDemandMode}`,
      14,
      20
    );

    autoTable(doc, {
      startY: 26,
      head: [[
        "SKU",
        "Produto",
        "Un",
        "Média semanal",
        "Última base",
        "Sugestão",
        "Volume",
        "Confiança",
      ]],
      body: forecastRows.map((r) => [
        r.sku || "",
        r.product_name || "",
        r.unit || "",
        r.avg_weekly_qty.toFixed(1),
        r.last_week_qty.toFixed(1),
        String(r.suggested_next_week_qty),
        r.suggested_display,
        r.confidence,
      ]),
      styles: {
        fontSize: 8,
        cellPadding: 2,
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [8, 145, 178],
      },
      columnStyles: {
        1: { cellWidth: 55 },
        6: { cellWidth: 35 },
      },
    });

    doc.save(`previsao-compras-${rangeStart}-${rangeEnd}.pdf`);
  }

  async function refreshAll() {
    setLoading(true);
    await loadMonthly(monthYM, selectedStoreIds);
    await loadPlanning(rangeStart, rangeEnd, selectedStoreIds, rangeStatus, rangeDemandMode);
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral da rede, demanda semanal e inteligência de compra"
        right={
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
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

            <MultiStoreSelect
              stores={stores}
              selectedIds={selectedStoreIds}
              onChangeSelectedIds={setSelectedStoreIds}
            />

            <SecondaryActionButton onClick={refreshAll} disabled={loading}>
              Atualizar
            </SecondaryActionButton>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm text-red-600">{msg}</div>
        </Card>
      ) : null}

      <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-5 shadow-sm md:p-6">
        <SectionTitle
          title="Resumo executivo"
          subtitle="Panorama mensal consolidado da rede"
        />

        <div className="mt-6 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          <SummaryBox title="Total no mês" value={money(kpis.total)} subtitle={`Referência ${monthYM}`} />
          <SummaryBox title="Em aberto" value={money(kpis.emAberto)} subtitle="submitted / approved" />
          <SummaryBox title="Pedidos no mês" value={kpis.pedidos.toLocaleString("pt-BR")} subtitle="Somatório por status" />
          <SummaryBox
            title="Lojas filtradas"
            value={selectedStoreIds.length === 0 ? "Todas" : selectedStoreIds.length}
            subtitle={selectedStoreIds.length === 0 ? "Sem recorte" : "Lojas selecionadas"}
          />
        </div>
      </div>

      <div className="grid gap-4 md:gap-6 xl:grid-cols-2">
        <ChartCard
          title="Distribuição por status no mês"
          subtitle="Valor financeiro por status"
        >
          <SimpleBarChart
            data={monthlyStatusChartData}
            valueFormatter={(v) => money(v)}
          />
        </ChartCard>

        <ChartCard
          title="Top lojas no mês"
          subtitle="Ranking por valor movimentado"
        >
          {selectedStoreIds.length > 0 ? (
            <EmptyState text="Com lojas específicas selecionadas, o ranking geral perde sentido. Limpe o filtro para ver o top lojas." />
          ) : topStores.length === 0 ? (
            <EmptyState text="Sem dados no período." />
          ) : (
            <SimpleBarChart
              data={topStores.map((s): SimpleBarChartItem => ({
                label: storeNameMap.get(s.store_id) ?? s.store_id,
                value: s.total_value,
                tone: "blue",
              }))}
              valueFormatter={(v) => money(v)}
            />
          )}
        </ChartCard>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <SectionTitle
          title="Planejamento de compras"
          subtitle="Entenda a demanda por período e por estágio logístico"
        />

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 md:gap-4">
          <Select
            label="Período"
            value={rangePreset}
            onChange={(v) => setRangePreset(v as any)}
            options={[
              { value: "this_week", label: "Semana atual (seg-dom)" },
              { value: "last_week", label: "Semana passada (seg-dom)" },
              { value: "custom", label: "Personalizado" },
            ]}
          />

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Início</div>
            <input
              type="date"
              value={rangeStart}
              onChange={(e) => {
                setRangePreset("custom");
                setRangeStart(e.target.value);
              }}
              className="h-10 w-full rounded-[16px] border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none"
            />
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Fim</div>
            <input
              type="date"
              value={rangeEnd}
              onChange={(e) => {
                setRangePreset("custom");
                setRangeEnd(e.target.value);
              }}
              className="h-10 w-full rounded-[16px] border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none"
            />
          </div>

          <Select
            label="Demanda"
            value={rangeDemandMode}
            onChange={(v) => setRangeDemandMode(v as any)}
            options={[
              { value: "pending", label: "Somente pendente" },
              { value: "delivered", label: "Somente entregue" },
              { value: "all", label: "Tudo" },
            ]}
          />

          <Select
            label="Status do pedido"
            value={rangeStatus}
            onChange={(v) => setRangeStatus(v as any)}
            options={[
              { value: "submitted_approved", label: "submitted / approved" },
              { value: "all", label: "Todos os status" },
            ]}
          />

          <div className="flex items-end">
            <PrimaryActionButton
              onClick={() =>
                loadPlanning(rangeStart, rangeEnd, selectedStoreIds, rangeStatus, rangeDemandMode)
              }
              disabled={rangeLoading || !rangeStart || !rangeEnd || rangeStart > rangeEnd}
              fullWidth
            >
              Atualizar período
            </PrimaryActionButton>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
          <div className="lg:col-span-2">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Buscar item
            </div>
            <input
              value={rangeQuery}
              onChange={(e) => setRangeQuery(e.target.value)}
              placeholder="Ex.: batata • B001 • cx"
              className="h-10 w-full rounded-[16px] border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none"
            />
          </div>

          <Select
            label="Ordenar"
            value={rangeSort}
            onChange={(v) => setRangeSort(v as any)}
            options={[
              { value: "qty", label: "Maior qtd" },
              { value: "name", label: "Nome" },
              { value: "sku", label: "SKU" },
            ]}
          />

          <div className="flex items-end">
            <label className="flex h-10 w-full items-center justify-center gap-2 rounded-[16px] border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={rangeOnlyNonZero}
                onChange={(e) => setRangeOnlyNonZero(e.target.checked)}
                className="h-4 w-4"
              />
              Só itens &gt; 0
            </label>
          </div>
        </div>

        {rangeMsg ? <div className="mt-4 text-sm text-red-600">{rangeMsg}</div> : null}

        <div className="mt-6 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          <SummaryBox title="Período" value={`${isoToBR(rangeStart)} → ${isoToBR(rangeEnd)}`} subtitle="Janela analisada" />
          <SummaryBox title="Pedidos" value={rangeOrdersCount.toLocaleString("pt-BR")} subtitle={`Lojas: ${rangeStoresCount}`} />
          <SummaryBox title="Itens diferentes" value={rangeKpis.itemsCount.toLocaleString("pt-BR")} subtitle="Com quantidade" />
          <SummaryBox
            title="Qtd total"
            value={Number(rangeKpis.totalQty).toLocaleString("pt-BR")}
            subtitle={
              rangeDemandMode === "pending"
                ? "Demanda pendente"
                : rangeDemandMode === "delivered"
                ? "Demanda entregue"
                : "Demanda total"
            }
          />
        </div>

        <div className="mt-6 grid gap-4 md:gap-6 xl:grid-cols-2">
          <ChartCard
            title="Demanda por semana"
            subtitle="Quantidade somada por semana"
          >
            {rangeLoading ? (
              <div className="text-sm text-slate-600">Carregando...</div>
            ) : (
              <MiniColumnsChart data={weeklyDemand} />
            )}
          </ChartCard>

          <ChartCard
            title="Produtos com maior demanda"
            subtitle="Top itens no período filtrado"
          >
            {rangeLoading ? (
              <div className="text-sm text-slate-600">Carregando...</div>
            ) : topDemandChart.length === 0 ? (
              <EmptyState text="Sem itens no período." />
            ) : (
              <SimpleBarChart data={topDemandChart} />
            )}
          </ChartCard>
        </div>

        <div className="mt-6 grid gap-4 md:gap-6 xl:grid-cols-2">
          <ChartCard
            title="Heatmap / ranking de lojas"
            subtitle="Lojas com maior demanda no período"
          >
            {rangeLoading ? (
              <div className="text-sm text-slate-600">Carregando...</div>
            ) : storeDemand.length === 0 ? (
              <EmptyState text="Sem dados de lojas no período." />
            ) : (
              <HeatRows rows={storeDemand.slice(0, 10)} />
            )}
          </ChartCard>

          <ChartCard
            title="Curva ABC de produtos"
            subtitle="Classificação por relevância de demanda"
          >
            {rangeLoading ? (
              <div className="text-sm text-slate-600">Carregando...</div>
            ) : abcRows.length === 0 ? (
              <EmptyState text="Sem dados para curva ABC." />
            ) : (
              <div className="overflow-x-auto -mx-1 px-1"><Table
                headers={["Item", "Qtd", "% Part.", "% Acum.", "Curva"]}
                rows={abcRows.slice(0, 12).map((r) => [
                  <div key={`${r.product_id}-name`} className="min-w-[240px]">
                    <div className="font-semibold text-slate-900">{r.product_name}</div>
                    <div className="text-xs text-slate-500">{r.sku ? `SKU: ${r.sku}` : ""}</div>
                  </div>,
                  <div key={`${r.product_id}-qty`} className="font-semibold text-slate-900">
                    {Number(r.total_qty || 0).toLocaleString("pt-BR")}
                  </div>,
                  <div key={`${r.product_id}-share`} className="text-slate-700">
                    {r.share_pct.toFixed(1)}%
                  </div>,
                  <div key={`${r.product_id}-cum`} className="text-slate-700">
                    {r.cumulative_pct.toFixed(1)}%
                  </div>,
                  <Badge key={`${r.product_id}-curve`} tone={curveTone(r.curve)}>
                    {r.curve}
                  </Badge>,
                ])}
              /></div>
            )}
          </ChartCard>
        </div>

        <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
          Observação: o planejamento usa <b>submitted_at</b> como referência do período e o filtro de demanda usa a logística para separar pendente e entregue.
        </div>
      </div>

      <div className="grid gap-4 md:gap-6 xl:grid-cols-2">
        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <SectionTitle
            title="Top itens do mês"
            subtitle="Ranking por valor movimentado"
          />

          <div className="mt-6">
            {topItems.length === 0 ? (
              <EmptyState text="Sem itens no período." />
            ) : (
              <div className="overflow-x-auto -mx-1 px-1"><Table
                headers={["Item", "Qtd", "Pedidos", "Valor"]}
                rows={topItems.map((r) => [
                  <div key={`${r.product_id}-name`} className="min-w-[260px]">
                    <div className="font-semibold text-slate-900">{r.product_name}</div>
                    <div className="text-xs text-slate-500">
                      {r.sku ? `SKU: ${r.sku}` : ""}
                      {r.unit ? ` • Un: ${r.unit}` : ""}
                    </div>
                  </div>,
                  <div key={`${r.product_id}-qty`} className="text-slate-700">
                    {Number(r.total_qty).toLocaleString("pt-BR")}
                  </div>,
                  <div key={`${r.product_id}-orders`} className="text-slate-700">
                    {Number(r.orders).toLocaleString("pt-BR")}
                  </div>,
                  <div key={`${r.product_id}-value`} className="font-semibold text-slate-900">
                    {money(r.total_value)}
                  </div>,
                ])}
              /></div>
            )}
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <SectionTitle
            title="Status do mês"
            subtitle="Quebra por loja e status"
          />

          <div className="mt-6">
            {statusMonthly.length === 0 ? (
              <EmptyState text="Sem dados no período." />
            ) : (
              <div className="overflow-x-auto -mx-1 px-1"><Table
                headers={["Loja", "Status", "Pedidos", "Qtd Itens", "Valor"]}
                rows={statusMonthly
                  .slice()
                  .sort((a, b) => (Number(b.total_value) || 0) - (Number(a.total_value) || 0))
                  .map((r, idx) => [
                    <div key={`lo-${idx}`} className="font-semibold text-slate-900">
                      {storeNameMap.get(r.store_id) ?? r.store_id}
                    </div>,
                    <Badge key={`st-${idx}`} tone={statusTone(r.status)}>
                      {r.status}
                    </Badge>,
                    <div key={`od-${idx}`} className="text-slate-700">
                      {Number(r.orders_count || 0)}
                    </div>,
                    <div key={`qt-${idx}`} className="text-slate-700">
                      {Number(r.total_qty || 0).toLocaleString("pt-BR")}
                    </div>,
                    <div key={`vl-${idx}`} className="font-semibold text-slate-900">
                      {money(Number(r.total_value || 0))}
                    </div>,
                  ])}
              /></div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <SectionTitle
          title="Previsão de compra para a próxima semana"
          subtitle="Sugestão automática com base na demanda recente"
          right={
            <div className="flex flex-wrap gap-2">
              <SecondaryActionButton
                onClick={exportForecastPdf}
                disabled={forecastRows.length === 0}
              >
                Exportar PDF
              </SecondaryActionButton>

              <PrimaryActionButton
                onClick={exportForecastXlsx}
                disabled={forecastRows.length === 0}
              >
                Exportar XLSX
              </PrimaryActionButton>
            </div>
          }
        />

        <div className="mt-6">
          {forecastRows.length === 0 ? (
            <EmptyState text="Sem dados suficientes para projeção." />
          ) : (
            <div className="overflow-x-auto -mx-1 px-1"><Table
              headers={["Item", "Média semanal", "Última base", "Sugestão próxima semana", "Volume", "Confiança"]}
              rows={forecastRows.slice(0, 20).map((r) => [
                <div key={`${r.product_id}-name`} className="min-w-[260px]">
                  <div className="font-semibold text-slate-900">{r.product_name}</div>
                  <div className="text-xs text-slate-500">
                    {r.sku ? `SKU: ${r.sku}` : ""}
                    {r.unit ? ` • Un: ${r.unit}` : ""}
                  </div>
                </div>,
                <div key={`${r.product_id}-avg`} className="text-slate-700">
                  {r.avg_weekly_qty.toFixed(1)}
                </div>,
                <div key={`${r.product_id}-last`} className="text-slate-700">
                  {r.last_week_qty.toFixed(1)}
                </div>,
                <div key={`${r.product_id}-next`} className="font-semibold text-slate-900">
                  {Number(r.suggested_next_week_qty || 0).toLocaleString("pt-BR")}
                </div>,
                <div key={`${r.product_id}-volume`} className="text-slate-700">
                  {r.suggested_display}
                </div>,
                <Badge key={`${r.product_id}-conf`} tone={confidenceTone(r.confidence)}>
                  {r.confidence}
                </Badge>,
              ])}
            /></div>
          )}
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <SectionTitle
          title="Demanda detalhada de produtos"
          subtitle="Base para compras, separação e programação do CD"
          right={
            <div className="flex items-center gap-2">
              <Badge tone={rangeDemandMode === "pending" ? "yellow" : rangeDemandMode === "delivered" ? "green" : "blue"}>
                {rangeDemandMode === "pending"
                  ? "Pendente"
                  : rangeDemandMode === "delivered"
                  ? "Entregue"
                  : "Tudo"}
              </Badge>
            </div>
          }
        />

        <div className="mt-6">
          {rangeLoading ? (
            <div className="text-sm text-slate-600">Carregando planejamento...</div>
          ) : rangeAggFiltered.length === 0 ? (
            <EmptyState text="Sem itens para o período selecionado." />
          ) : (
            <div className="overflow-x-auto -mx-1 px-1"><Table
              headers={["Item", "Un", "Qtd total", "Volume", "Pedidos", "Lojas"]}
              rows={rangeAggFiltered.map((r) => {
                const volume = formatVolumeSuggestion(
                  Number(r.total_qty || 0),
                  r.unit || "un",
                  r.product_name || ""
                );

                return [
                  <div key={`${r.product_id}-name`} className="min-w-[280px]">
                    <div className="font-semibold text-slate-900">{r.product_name}</div>
                    <div className="text-xs text-slate-500">
                      {r.sku ? `SKU: ${r.sku}` : ""}
                    </div>
                  </div>,
                  <div key={`${r.product_id}-unit`} className="text-slate-700">
                    {r.unit || "-"}
                  </div>,
                  <div key={`${r.product_id}-qty`} className="font-semibold text-slate-900">
                    {Number(r.total_qty || 0).toLocaleString("pt-BR")}
                  </div>,
                  <div key={`${r.product_id}-volume`} className="text-slate-700">
                    {volume.suggested_display}
                  </div>,
                  <div key={`${r.product_id}-orders`} className="text-slate-700">
                    {Number(r.orders_count || 0)}
                  </div>,
                  <div key={`${r.product_id}-stores`} className="text-slate-700">
                    {Number(r.stores_count || 0)}
                  </div>,
                ];
              })}
            /></div>
          )}
        </div>
      </div>
    </div>
  );
}