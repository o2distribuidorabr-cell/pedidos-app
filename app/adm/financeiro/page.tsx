"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { PageHeader, Card, Button, Select, Badge, Table, Input, StatCard } from "@/app/components/ui";

type StoreRow = { id: string; name: string | null };

type OrderRow = {
  id: string;
  store_id: string;
  status: string;
  created_at: string | null;

  is_paid: boolean | null;
  paid_at: string | null;
  payment_method: "PIX" | "CARTAO" | "BOLETO" | null;

  paid_amount: number | null;

  logistic_status: "RECEBIDO" | "EM_SEPARACAO" | "SAIU_PARA_ENTREGA" | "ENTREGUE" | null;

  delivery_mode: "RETIRADA" | "FRETE" | null;
  freight_fee: number | null;

  credit_applied: number | null;

  due_date: string | null;
};

type TotalsRow = { order_id: string; store_id: string; total_cost: number | null };
type OrderItemRow = { order_id: string; qty: number | null; unit_cost: number | null };
type CreditBalRow = { store_id: string; balance: number | null };

type PixProvider = "MP" | "ASAAS" | "SANTANDER";

type FinanceSettingsRow = {
  id: number;
  pix_key: string | null;
  apply_late_charges: boolean | null;
  late_fee_percent: number | null;
  daily_interest_percent: number | null;
  pix_provider?: PixProvider | null;
  updated_at?: string | null;
};

type CalcParams = {
  aplicar: boolean;
  multaPct: number;
  jurosDiaPct: number;
};

type RowUi = {
  id: string;

  store_id: string;
  store_name: string;

  status: string;
  logistic_status: OrderRow["logistic_status"];
  delivery_mode: OrderRow["delivery_mode"];

  due_date: string | null;
  is_overdue: boolean;
  is_due_soon: boolean;

  is_paid: boolean;
  paid_at: string | null;
  payment_method: OrderRow["payment_method"];

  paid_amount: number | null;

  created_at: string | null;

  mercadoria: number;
  frete: number;
  total: number;
  credit_applied: number;
  a_pagar_base: number;

  days_late: number;
  multa: number;
  juros: number;
  encargos: number;

  a_pagar_exib: number;

  credit_balance: number;
};

function money(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtBR(iso: string | null | undefined) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}
function fmtYMDToBR(ymd: string | null | undefined) {
  if (!ymd) return "-";
  try {
    const [y, m, d] = ymd.split("-").map(Number);
    if (!y || !m || !d) return ymd;
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    return dt.toLocaleDateString("pt-BR");
  } catch {
    return String(ymd);
  }
}
function ymdToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDaysYMD(days: number) {
  const base = new Date();
  base.setDate(base.getDate() + days);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const d = String(base.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function daysBetweenYMD(a: string, b: string) {
  try {
    const [ya, ma, da] = a.split("-").map(Number);
    const [yb, mb, db] = b.split("-").map(Number);
    const daDt = new Date(ya, ma - 1, da, 12, 0, 0);
    const dbDt = new Date(yb, mb - 1, db, 12, 0, 0);
    const diff = dbDt.getTime() - daDt.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
}

function logisticLabel(v: OrderRow["logistic_status"]) {
  if (v === "RECEBIDO") return "Recebido";
  if (v === "EM_SEPARACAO") return "Em separação";
  if (v === "SAIU_PARA_ENTREGA") return "Saiu para entrega";
  if (v === "ENTREGUE") return "Entregue";
  return "—";
}
function deliveryLabel(v: OrderRow["delivery_mode"]) {
  return v === "FRETE" ? "Frete" : "Retirada";
}
function statusTone(status: string) {
  if (status === "approved") return "green";
  if (status === "submitted") return "blue";
  if (status === "rejected") return "red";
  return "slate";
}
function toISOStart(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0).toISOString();
}
function toISOEnd(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).toISOString();
}
function near(a: number, b: number, eps = 0.01) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= eps;
}
function payMethodLabel(m: OrderRow["payment_method"]) {
  if (m === "PIX") return "PIX";
  if (m === "CARTAO") return "Cartão";
  if (m === "BOLETO") return "Boleto";
  return "—";
}
function clampPercent(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(n, 1000));
}
function parsePercentInput(v: string) {
  const s = String(v ?? "").trim().replace("%", "").replace(/\s/g, "");
  if (!s) return 0;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function normalizeProvider(v?: string | null): PixProvider {
  const p = String(v || "MP").toUpperCase();
  if (p === "ASAAS") return "ASAAS";
  if (p === "SANTANDER") return "SANTANDER";
  return "MP";
}
function parseMoneyInput(v: string) {
  const s = String(v || "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function dateToTs(v: string | null | undefined) {
  if (!v) return 0;
  const ts = new Date(v).getTime();
  return Number.isFinite(ts) ? ts : 0;
}
function activeFilterCount(params: {
  storeSelected: string[];
  searchTerm: string;
  paidFilter: string;
  statusFilter: string;
  logisticFilter: string;
  deliveryFilter: string;
  dateFrom: string;
  dateTo: string;
  payMethodFilter: string;
  dueFilter: string;
  dueFrom: string;
  dueTo: string;
  amountMin: string;
  amountMax: string;
  withCreditFilter: string;
  sortBy: string;
}) {
  let n = 0;
  if (params.storeSelected.length > 0) n++;
  if (params.searchTerm.trim()) n++;
  if (params.paidFilter !== "all") n++;
  if (params.statusFilter !== "all") n++;
  if (params.logisticFilter !== "all") n++;
  if (params.deliveryFilter !== "all") n++;
  if (params.dateFrom) n++;
  if (params.dateTo) n++;
  if (params.payMethodFilter !== "all") n++;
  if (params.dueFilter !== "all") n++;
  if (params.dueFrom) n++;
  if (params.dueTo) n++;
  if (params.amountMin) n++;
  if (params.amountMax) n++;
  if (params.withCreditFilter !== "all") n++;
  if (params.sortBy !== "created_desc") n++;
  return n;
}

function SectionBlock({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
        </div>
        {right ? <div className="flex flex-wrap gap-2">{right}</div> : null}
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
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

function FilterChip({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center justify-center rounded-[16px] border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
    >
      {children}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
      {text}
    </div>
  );
}

function AlertPanel({
  tone,
  title,
  value,
  subtitle,
}: {
  tone: "red" | "yellow" | "green" | "blue";
  title: string;
  value: React.ReactNode;
  subtitle?: string;
}) {
  const styles =
    tone === "red"
      ? "border-red-200 bg-red-50"
      : tone === "yellow"
      ? "border-amber-200 bg-amber-50"
      : tone === "green"
      ? "border-emerald-200 bg-emerald-50"
      : "border-cyan-200 bg-cyan-50";

  return (
    <div className={`rounded-[24px] border p-4 ${styles}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-600">{subtitle}</div> : null}
    </div>
  );
}

export default function AdmFinanceiroPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [rows, setRows] = useState<RowUi[]>([]);

  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [pixKey, setPixKey] = useState<string>("");
  const [applyLateCharges, setApplyLateCharges] = useState<boolean>(true);
  const [lateFeePercent, setLateFeePercent] = useState<string>("2");
  const [dailyInterestPercent, setDailyInterestPercent] = useState<string>("0,033");

  const [pixProvider, setPixProvider] = useState<PixProvider>("MP");

  const [storeSelected, setStoreSelected] = useState<string[]>([]);
  const [storePopoverOpen, setStorePopoverOpen] = useState(false);
  const [storeSearch, setStoreSearch] = useState("");
  const popRef = useRef<HTMLDivElement | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  const [paidFilter, setPaidFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [logisticFilter, setLogisticFilter] = useState<string>("all");
  const [deliveryFilter, setDeliveryFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const [payMethodFilter, setPayMethodFilter] = useState<string>("all");
  const [dueFilter, setDueFilter] = useState<string>("all");
  const [dueFrom, setDueFrom] = useState<string>("");
  const [dueTo, setDueTo] = useState<string>("");

  const [amountMin, setAmountMin] = useState<string>("");
  const [amountMax, setAmountMax] = useState<string>("");
  const [withCreditFilter, setWithCreditFilter] = useState<string>("all");

  const [sortBy, setSortBy] = useState<string>("created_desc");

  const [viewMode, setViewMode] = useState<"compact" | "full">("compact");

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!storePopoverOpen) return;
      const el = popRef.current;
      if (!el) return;
      const target = e.target as Node;
      if (!el.contains(target)) setStorePopoverOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [storePopoverOpen]);

  function calcParamsFromCurrentState(): CalcParams {
    const multaPct = clampPercent(parsePercentInput(lateFeePercent)) / 100;
    const jurosDiaPct = clampPercent(parsePercentInput(dailyInterestPercent)) / 100;
    const aplicar = !!applyLateCharges;
    return { aplicar, multaPct, jurosDiaPct };
  }

  function calcParamsFromSettingsRow(row: FinanceSettingsRow | null): CalcParams {
    const aplicar = !!(row?.apply_late_charges ?? true);
    const multaPct = clampPercent(Number(row?.late_fee_percent ?? 0)) / 100;
    const jurosDiaPct = clampPercent(Number(row?.daily_interest_percent ?? 0)) / 100;
    return { aplicar, multaPct, jurosDiaPct };
  }

  async function loadFinanceSettings(): Promise<FinanceSettingsRow | null> {
    setSettingsLoading(true);
    try {
      const { data, error } = await supabase
        .from("finance_settings")
        .select("id,pix_key,apply_late_charges,late_fee_percent,daily_interest_percent,pix_provider")
        .eq("id", 1)
        .maybeSingle();

      if (error) {
        console.warn("loadFinanceSettings:", error.message);
        return null;
      }

      const row = (data ?? null) as FinanceSettingsRow | null;

      if (row) {
        setPixKey(row.pix_key ?? "");
        setApplyLateCharges(!!(row.apply_late_charges ?? true));
        setLateFeePercent(String(row.late_fee_percent ?? 2).replace(".", ","));
        setDailyInterestPercent(String(row.daily_interest_percent ?? 0.033).replace(".", ","));
        setPixProvider(normalizeProvider((row as any).pix_provider));
      }

      return row;
    } finally {
      setSettingsLoading(false);
    }
  }

  async function saveFinanceSettings() {
    setMsg("");
    setSettingsSaving(true);

    const multa = clampPercent(parsePercentInput(lateFeePercent));
    const jurosDia = clampPercent(parsePercentInput(dailyInterestPercent));

    const payload: FinanceSettingsRow = {
      id: 1,
      pix_key: pixKey.trim() || null,
      apply_late_charges: !!applyLateCharges,
      late_fee_percent: multa,
      daily_interest_percent: jurosDia,
      pix_provider: pixProvider,
    };

    const { error } = await supabase.from("finance_settings").upsert(payload, { onConflict: "id" });

    if (error) {
      setMsg(`Erro ao salvar configurações: ${error.message}`);
      setSettingsSaving(false);
      return;
    }

    setSettingsSaving(false);

    const storeList = await loadStores();
    await loadFinance(storeList, calcParamsFromCurrentState());
  }

  async function loadStores(): Promise<StoreRow[]> {
    const { data, error } = await supabase.from("stores").select("id,name").order("name", { ascending: true });

    if (error) {
      console.warn("loadStores:", error.message);
      setStores([]);
      return [];
    }

    const list = (data ?? []) as StoreRow[];
    setStores(list);
    return list;
  }

  function storeButtonLabel() {
    if (storeSelected.length === 0) return "Todas as lojas";
    if (storeSelected.length === 1) {
      const s = stores.find((x) => x.id === storeSelected[0]);
      return s?.name ?? storeSelected[0];
    }
    return `${storeSelected.length} lojas selecionadas`;
  }

  function toggleStore(id: string) {
    setStoreSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function clearStores() {
    setStoreSelected([]);
    setStoreSearch("");
  }

  function selectOnlyVisible(list: StoreRow[]) {
    setStoreSelected(list.map((s) => s.id));
  }

  function resetAllFilters() {
    setSearchTerm("");
    setPaidFilter("all");
    setStatusFilter("all");
    setLogisticFilter("all");
    setDeliveryFilter("all");
    setDateFrom("");
    setDateTo("");
    setPayMethodFilter("all");
    setDueFilter("all");
    setDueFrom("");
    setDueTo("");
    setAmountMin("");
    setAmountMax("");
    setWithCreditFilter("all");
    setSortBy("created_desc");
    clearStores();
  }

  async function loadFinance(storeList: StoreRow[], calc?: CalcParams) {
    setMsg("");

    let q = supabase
      .from("orders")
      .select(
        "id,store_id,status,created_at,is_paid,paid_at,payment_method,paid_amount,logistic_status,delivery_mode,freight_fee,credit_applied,due_date"
      )
      .order("created_at", { ascending: false });

    if (storeSelected.length > 0) q = q.in("store_id", storeSelected);

    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (logisticFilter !== "all") q = q.eq("logistic_status", logisticFilter);
    if (deliveryFilter !== "all") q = q.eq("delivery_mode", deliveryFilter);

    if (paidFilter === "paid") q = q.eq("is_paid", true);
    if (paidFilter === "unpaid") q = q.or("is_paid.is.null,is_paid.eq.false");

    if (payMethodFilter !== "all") q = q.eq("payment_method", payMethodFilter);

    if (dateFrom) q = q.gte("created_at", toISOStart(dateFrom));
    if (dateTo) q = q.lte("created_at", toISOEnd(dateTo));

    if (dueFrom) q = q.gte("due_date", dueFrom);
    if (dueTo) q = q.lte("due_date", dueTo);

    if (dueFilter === "no_due") q = q.is("due_date", null);

    const { data: ords, error: oErr } = await q;

    if (oErr) {
      setMsg(oErr.message);
      setRows([]);
      return;
    }

    let orders = (ords ?? []) as OrderRow[];

    const today = ymdToday();
    const soonLimit = addDaysYMD(3);

    if (dueFilter === "overdue") {
      orders = orders.filter((o) => !o.is_paid && !!o.due_date && o.due_date < today);
    } else if (dueFilter === "due_soon") {
      orders = orders.filter((o) => !o.is_paid && !!o.due_date && o.due_date >= today && o.due_date <= soonLimit);
    } else if (dueFilter === "today") {
      orders = orders.filter((o) => !!o.due_date && o.due_date === today);
    } else if (dueFilter === "future") {
      orders = orders.filter((o) => !!o.due_date && o.due_date > today);
    } else if (dueFilter === "with_due") {
      orders = orders.filter((o) => !!o.due_date);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      const storeMapText = new Map<string, string>();
      for (const s of storeList) {
        storeMapText.set(s.id, `${s.name ?? ""} ${s.id}`.toLowerCase());
      }

      orders = orders.filter((o) => {
        const storeText = storeMapText.get(o.store_id) ?? "";
        return o.id.toLowerCase().includes(term) || storeText.includes(term);
      });
    }

    if (orders.length === 0) {
      setRows([]);
      return;
    }

    const orderIds = orders.map((o) => o.id);
    const storeIdsUnique = Array.from(new Set(orders.map((o) => o.store_id)));

    const { data: tots, error: tErr } = await supabase
      .from("v_order_totals")
      .select("order_id,store_id,total_cost")
      .in("order_id", orderIds);

    if (tErr) setMsg(tErr.message);

    const totalsMap = new Map<string, number>();
    for (const r of (tots ?? []) as TotalsRow[]) totalsMap.set(r.order_id, Number(r.total_cost) || 0);

    const { data: itemsRaw, error: iErr } = await supabase
      .from("order_items")
      .select("order_id,qty,unit_cost")
      .in("order_id", orderIds);

    if (iErr) console.warn("order_items calc:", iErr.message);

    const itemsCalcMap = new Map<string, number>();
    for (const r of (itemsRaw ?? []) as OrderItemRow[]) {
      const cur = itemsCalcMap.get(r.order_id) ?? 0;
      const line = (Number(r.qty) || 0) * (Number(r.unit_cost) || 0);
      itemsCalcMap.set(r.order_id, cur + line);
    }

    const { data: bals, error: bErr } = await supabase
      .from("v_store_credit_balance")
      .select("store_id,balance")
      .in("store_id", storeIdsUnique);

    if (bErr) console.warn("credit balance:", bErr.message);

    const balMap = new Map<string, number>();
    for (const r of (bals ?? []) as CreditBalRow[]) balMap.set(r.store_id, Number(r.balance) || 0);

    const storeMap = new Map<string, string>();
    for (const s of storeList) storeMap.set(s.id, s.name ?? s.id);

    const calcUse = calc ?? calcParamsFromCurrentState();
    const aplicar = calcUse.aplicar;
    const multaPct = calcUse.multaPct;
    const jurosDiaPct = calcUse.jurosDiaPct;

    let ui: RowUi[] = orders.map((o) => {
      const frete = o.delivery_mode === "FRETE" ? Number(o.freight_fee ?? 0) : 0;

      const viewTotal = totalsMap.get(o.id) ?? 0;
      const itemsCalc = itemsCalcMap.get(o.id) ?? 0;

      let mercadoria = viewTotal;

      if (frete > 0 && itemsRaw) {
        if (near(viewTotal, itemsCalc + frete)) mercadoria = Math.max(viewTotal - frete, 0);
        else if (near(viewTotal, itemsCalc)) mercadoria = viewTotal;
        else if (!near(itemsCalc, 0)) mercadoria = itemsCalc;
      } else {
        if (itemsRaw && !near(viewTotal, itemsCalc)) mercadoria = itemsCalc;
      }

      const total = mercadoria + frete;
      const credit = Number(o.credit_applied ?? 0);
      const a_pagar_base = Math.max(total - credit, 0);

      const is_overdue = !!o.due_date && !o.is_paid && o.due_date < today;
      const is_due_soon = !!o.due_date && !o.is_paid && o.due_date >= today && o.due_date <= soonLimit;

      const days_late = is_overdue && o.due_date ? Math.max(daysBetweenYMD(o.due_date, today), 1) : 0;

      const multa = aplicar && is_overdue ? a_pagar_base * multaPct : 0;
      const juros = aplicar && is_overdue ? a_pagar_base * jurosDiaPct * days_late : 0;
      const encargos = multa + juros;

      const paid_amount_num = Number(o.paid_amount ?? 0) || 0;
      const a_pagar_exib = o.is_paid && paid_amount_num > 0 ? paid_amount_num : Math.max(a_pagar_base + encargos, 0);

      return {
        id: o.id,

        store_id: o.store_id,
        store_name: storeMap.get(o.store_id) ?? o.store_id,

        status: o.status,
        logistic_status: o.logistic_status,
        delivery_mode: o.delivery_mode,

        due_date: o.due_date ?? null,
        is_overdue,
        is_due_soon,

        is_paid: !!o.is_paid,
        paid_at: o.paid_at,
        payment_method: o.payment_method,

        paid_amount: o.paid_amount ?? null,

        created_at: o.created_at,

        mercadoria,
        frete,
        total,
        credit_applied: credit,
        a_pagar_base,

        days_late,
        multa,
        juros,
        encargos,

        a_pagar_exib,

        credit_balance: balMap.get(o.store_id) ?? 0,
      };
    });

    if (withCreditFilter === "yes") {
      ui = ui.filter((r) => r.credit_applied > 0);
    } else if (withCreditFilter === "no") {
      ui = ui.filter((r) => r.credit_applied <= 0);
    }

    const min = amountMin ? parseMoneyInput(amountMin) : null;
    const max = amountMax ? parseMoneyInput(amountMax) : null;

    if (min !== null) ui = ui.filter((r) => r.a_pagar_exib >= min);
    if (max !== null) ui = ui.filter((r) => r.a_pagar_exib <= max);

    ui.sort((a, b) => {
      if (sortBy === "created_asc") return dateToTs(a.created_at) - dateToTs(b.created_at);
      if (sortBy === "created_desc") return dateToTs(b.created_at) - dateToTs(a.created_at);
      if (sortBy === "due_asc") return dateToTs(a.due_date) - dateToTs(b.due_date);
      if (sortBy === "due_desc") return dateToTs(b.due_date) - dateToTs(a.due_date);
      if (sortBy === "amount_asc") return a.a_pagar_exib - b.a_pagar_exib;
      if (sortBy === "amount_desc") return b.a_pagar_exib - a.a_pagar_exib;
      if (sortBy === "store_asc") return a.store_name.localeCompare(b.store_name, "pt-BR");
      if (sortBy === "store_desc") return b.store_name.localeCompare(a.store_name, "pt-BR");
      return dateToTs(b.created_at) - dateToTs(a.created_at);
    });

    setRows(ui);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        router.push("/login");
        return;
      }

      const settingsRow = await loadFinanceSettings();
      const storeList = await loadStores();

      await loadFinance(storeList, calcParamsFromSettingsRow(settingsRow));

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onApply() {
    setLoading(true);
    const storeList = await loadStores();
    await loadFinance(storeList, calcParamsFromCurrentState());
    setLoading(false);
  }

  const resumo = useMemo(() => {
    const totalMercadoria = rows.reduce((a, r) => a + r.mercadoria, 0);
    const totalFrete = rows.reduce((a, r) => a + r.frete, 0);
    const totalTotal = rows.reduce((a, r) => a + r.total, 0);
    const totalCredito = rows.reduce((a, r) => a + r.credit_applied, 0);

    const totalApagar = rows.reduce((a, r) => a + (!r.is_paid ? r.a_pagar_exib : 0), 0);
    const totalPago = rows.reduce((a, r) => a + (r.is_paid ? r.a_pagar_exib : 0), 0);

    const totalAberto = totalApagar;

    const qtdVencidos = rows.filter((r) => r.is_overdue).length;
    const qtdAVencer = rows.filter((r) => r.is_due_soon).length;

    const valorVencido = rows.filter((r) => r.is_overdue).reduce((a, r) => a + (!r.is_paid ? r.a_pagar_exib : 0), 0);
    const valorAVencer = rows.filter((r) => r.is_due_soon).reduce((a, r) => a + (!r.is_paid ? r.a_pagar_exib : 0), 0);

    return {
      totalMercadoria,
      totalFrete,
      totalTotal,
      totalCredito,
      totalApagar,
      totalPago,
      totalAberto,
      qtdVencidos,
      qtdAVencer,
      valorVencido,
      valorAVencer,
    };
  }, [rows]);

  const storeFilteredList = useMemo(() => {
    const q = storeSearch.trim().toLowerCase();
    const base = stores;
    if (!q) return base;
    return base.filter((s) => `${s.name ?? ""} ${s.id}`.toLowerCase().includes(q));
  }, [stores, storeSearch]);

  const columns = useMemo(() => {
    const baseCompact = ["Pedido", "Loja", "Operação", "Vencimento", "Forma", "Total", "A pagar", "Pago?"];
    const baseFull = [
      "Pedido",
      "Loja",
      "Operação",
      "Entrega",
      "Vencimento",
      "Forma",
      "Mercadoria",
      "Frete",
      "Total",
      "Crédito",
      "A pagar",
      "Pago?",
      "Data pagamento",
      "Saldo crédito",
    ];
    return viewMode === "compact" ? baseCompact : baseFull;
  }, [viewMode]);

  const tableRows = useMemo(() => {
    return rows.map((r) => {
      const dueBadge = !r.due_date ? (
        <Badge tone="slate">Sem venc.</Badge>
      ) : r.is_overdue ? (
        <Badge tone="red">Vencido</Badge>
      ) : r.is_due_soon ? (
        <Badge tone="yellow">A vencer</Badge>
      ) : (
        <Badge tone="green">OK</Badge>
      );

      const opCell = (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(r.status)}>{r.status}</Badge>
          <Badge tone="slate">{logisticLabel(r.logistic_status)}</Badge>
        </div>
      );

      const paidCell = <Badge tone={r.is_paid ? "green" : "red"}>{r.is_paid ? "Pago" : "Em aberto"}</Badge>;

      const dueCell = (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-800">{fmtYMDToBR(r.due_date)}</span>
            {dueBadge}
          </div>

          {!r.is_paid && r.encargos > 0 ? (
            <div className="text-xs text-slate-600">
              Encargos: <b className="text-slate-900">{money(r.encargos)}</b>{" "}
              <span className="text-slate-500">
                (multa {money(r.multa)} + juros {money(r.juros)} • {r.days_late} dia(s))
              </span>
            </div>
          ) : null}

          {r.is_paid && r.paid_amount != null && r.paid_amount > r.a_pagar_base ? (
            <div className="text-xs text-slate-600">
              Pago com encargos: <b className="text-slate-900">{money(r.paid_amount - r.a_pagar_base)}</b>{" "}
              <span className="text-slate-500">(valor pago {money(r.paid_amount)})</span>
            </div>
          ) : null}
        </div>
      );

      if (viewMode === "compact") {
        return [
          <span key="id" className="font-mono text-xs text-slate-700">{r.id}</span>,
          <span key="store" className="font-semibold text-slate-900">{r.store_name}</span>,
          <div key="op">{opCell}</div>,
          <div key="due">{dueCell}</div>,
          <span key="pm" className="text-slate-800">{payMethodLabel(r.payment_method)}</span>,
          <span key="tot" className="font-semibold text-slate-900">{money(r.total)}</span>,
          <span key="apg" className="font-semibold text-slate-900">{money(r.a_pagar_exib)}</span>,
          <div key="paid">{paidCell}</div>,
        ];
      }

      return [
        <span key="id" className="font-mono text-xs text-slate-700">{r.id}</span>,
        <span key="store" className="font-semibold text-slate-900">{r.store_name}</span>,
        <div key="op">{opCell}</div>,
        <span key="del" className="text-slate-800">{deliveryLabel(r.delivery_mode)}</span>,
        <div key="due">{dueCell}</div>,
        <span key="pm" className="text-slate-800">{payMethodLabel(r.payment_method)}</span>,
        <span key="merc" className="font-semibold text-slate-900">{money(r.mercadoria)}</span>,
        <span key="frete" className="text-slate-800">{r.delivery_mode === "FRETE" ? money(r.frete) : "—"}</span>,
        <span key="tot" className="font-semibold text-slate-900">{money(r.total)}</span>,
        <span key="cred" className="text-slate-800">- {money(r.credit_applied)}</span>,
        <span key="apg" className="font-semibold text-slate-900">{money(r.a_pagar_exib)}</span>,
        <div key="paid">{paidCell}</div>,
        <span key="dt" className="text-slate-700">{fmtBR(r.paid_at)}</span>,
        <span key="cb" className="font-semibold text-slate-900">{money(r.credit_balance)}</span>,
      ];
    });
  }, [rows, viewMode]);

  const filtrosAtivos = activeFilterCount({
    storeSelected,
    searchTerm,
    paidFilter,
    statusFilter,
    logisticFilter,
    deliveryFilter,
    dateFrom,
    dateTo,
    payMethodFilter,
    dueFilter,
    dueFrom,
    dueTo,
    amountMin,
    amountMax,
    withCreditFilter,
    sortBy,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        subtitle="Visão administrativa de cobranças, pagamentos, vencimentos e crédito."
        right={
          <div className="flex flex-wrap gap-2">
            <SecondaryActionButton onClick={() => router.push("/adm/pedidos")}>
              Pedidos
            </SecondaryActionButton>
            <SecondaryActionButton onClick={onApply} disabled={loading}>
              Recarregar
            </SecondaryActionButton>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm text-red-600">{msg}</div>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <AlertPanel
          tone="red"
          title="Vencidos"
          value={resumo.qtdVencidos}
          subtitle={`${money(resumo.valorVencido)} em aberto`}
        />
        <AlertPanel
          tone="yellow"
          title="A vencer"
          value={resumo.qtdAVencer}
          subtitle={`${money(resumo.valorAVencer)} próximos 3 dias`}
        />
        <AlertPanel
          tone="blue"
          title="Em aberto"
          value={money(resumo.totalAberto)}
          subtitle="Total exibido no filtro"
        />
      </div>

      <SectionBlock
        title="Configurações de cobrança"
        subtitle="Essas regras afetam o valor exibido após vencimento e o provedor PIX ativo."
        right={
          <>
            <SecondaryActionButton onClick={loadFinanceSettings} disabled={settingsLoading || settingsSaving}>
              {settingsLoading ? "Carregando..." : "Recarregar"}
            </SecondaryActionButton>
            <PrimaryActionButton onClick={saveFinanceSettings} disabled={settingsLoading || settingsSaving}>
              {settingsSaving ? "Salvando..." : "Salvar"}
            </PrimaryActionButton>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Select
            label="Provedor PIX ativo"
            value={pixProvider}
            onChange={(v) => setPixProvider(normalizeProvider(String(v)))}
            options={[
              { value: "MP", label: "Mercado Pago (MP)" },
              { value: "ASAAS", label: "Asaas" },
              { value: "SANTANDER", label: "Santander" },
            ]}
          />

          <Select
            label="Aplicar multa/juros?"
            value={applyLateCharges ? "true" : "false"}
            onChange={(v) => setApplyLateCharges(v === "true")}
            options={[
              { value: "true", label: "Sim" },
              { value: "false", label: "Não" },
            ]}
          />

          <Input
            label="Multa (% uma vez)"
            value={lateFeePercent}
            onChange={setLateFeePercent}
            placeholder="Ex.: 2"
          />

          <Input
            label="Juros (% ao dia)"
            value={dailyInterestPercent}
            onChange={setDailyInterestPercent}
            placeholder="Ex.: 0,033"
          />
        </div>

        <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-600">
          <div>
            <b>Provedor PIX ativo:</b> define qual integração será usada nos próximos QR Codes gerados pelo portal do franqueado.
          </div>
          <div>
            <b>Cálculo:</b> multa = A pagar × (%/100) uma vez • juros = A pagar × (%/100) × dias em atraso.
          </div>
          <div>
            <b>Pago:</b> quando existir <code>orders.paid_amount</code>, o sistema mostra o valor efetivamente pago.
          </div>
          <div>
            <b>Chave PIX:</b> o campo segue preservado na tabela, mas esta tela continua sem alterar a lógica operacional de geração.
          </div>
        </div>
      </SectionBlock>

      <SectionBlock
        title="Filtros"
        subtitle={filtrosAtivos === 0 ? "Nenhum filtro ativo." : `${filtrosAtivos} filtro(s) ativo(s).`}
        right={
          <>
            <SecondaryActionButton onClick={resetAllFilters} disabled={loading}>
              Limpar filtros
            </SecondaryActionButton>
            <PrimaryActionButton onClick={onApply} disabled={loading}>
              {loading ? "Aplicando..." : "Aplicar filtros"}
            </PrimaryActionButton>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="relative" ref={popRef}>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Lojas</div>
              <button
                type="button"
                onClick={() => setStorePopoverOpen((v) => !v)}
                disabled={loading}
                className="flex h-10 w-full items-center justify-between rounded-[16px] border border-slate-200 bg-white px-3 text-left text-sm text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
              >
                <span className="truncate">{storeButtonLabel()}</span>
                <span className="ml-2 text-slate-500">{storePopoverOpen ? "▲" : "▼"}</span>
              </button>

              {storePopoverOpen ? (
                <div className="absolute z-50 mt-2 w-[360px] max-w-[90vw] rounded-[24px] border border-slate-200 bg-white p-3 shadow-xl">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900">Selecionar lojas</div>
                    <SecondaryActionButton onClick={() => setStorePopoverOpen(false)}>
                      Fechar
                    </SecondaryActionButton>
                  </div>

                  <div className="mt-3">
                    <Input value={storeSearch} onChange={setStoreSearch} placeholder="Buscar loja..." />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <SecondaryActionButton onClick={clearStores} disabled={loading}>
                      Todas
                    </SecondaryActionButton>
                    <SecondaryActionButton
                      onClick={() => selectOnlyVisible(storeFilteredList)}
                      disabled={loading || storeFilteredList.length === 0}
                    >
                      Selecionar filtradas
                    </SecondaryActionButton>
                  </div>

                  <div className="mt-3 max-h-64 overflow-auto rounded-[18px] border border-slate-200">
                    {storeFilteredList.length === 0 ? (
                      <div className="p-3 text-sm text-slate-500">Nenhuma loja encontrada.</div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {storeFilteredList.map((s) => {
                          const checked = storeSelected.includes(s.id);
                          return (
                            <label key={s.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-slate-50">
                              <input type="checkbox" checked={checked} onChange={() => toggleStore(s.id)} />
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-slate-900">{s.name ?? s.id}</div>
                                <div className="truncate font-mono text-xs text-slate-500">{s.id}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <Input
              label="Buscar pedido ou loja"
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Ex.: ID do pedido ou nome da unidade"
            />

            <Select
              label="Situação financeira"
              value={paidFilter}
              onChange={setPaidFilter}
              options={[
                { value: "all", label: "Todos" },
                { value: "paid", label: "Somente pagos" },
                { value: "unpaid", label: "Somente em aberto" },
              ]}
            />

            <Select
              label="Forma de pagamento"
              value={payMethodFilter}
              onChange={setPayMethodFilter}
              options={[
                { value: "all", label: "Todas" },
                { value: "PIX", label: "PIX" },
                { value: "CARTAO", label: "Cartão" },
                { value: "BOLETO", label: "Boleto" },
              ]}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <Select
              label="Status do pedido"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: "Todos" },
                { value: "submitted", label: "Submitted" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
              ]}
            />

            <Select
  label="Status logístico"
  value={logisticFilter}
  onChange={setLogisticFilter}
  options={[
    { value: "all", label: "Todos" },
    { value: "RECEBIDO", label: "Recebido" },
    { value: "EM_SEPARACAO", label: "Em separação" },
    { value: "SAIU_PARA_ENTREGA", label: "Saiu para entrega" },
    { value: "ENTREGUE", label: "Entregue" },
  ]}
/>

            <Select
              label="Entrega"
              value={deliveryFilter}
              onChange={setDeliveryFilter}
              options={[
                { value: "all", label: "Todas" },
                { value: "FRETE", label: "Frete" },
                { value: "RETIRADA", label: "Retirada" },
              ]}
            />

            <Select
              label="Vencimento"
              value={dueFilter}
              onChange={setDueFilter}
              options={[
                { value: "all", label: "Todos" },
                { value: "overdue", label: "Vencidos" },
                { value: "due_soon", label: "A vencer (3 dias)" },
                { value: "today", label: "Vence hoje" },
                { value: "future", label: "Vence depois" },
                { value: "with_due", label: "Com vencimento" },
                { value: "no_due", label: "Sem vencimento" },
              ]}
            />

            <Select
              label="Usou crédito?"
              value={withCreditFilter}
              onChange={setWithCreditFilter}
              options={[
                { value: "all", label: "Todos" },
                { value: "yes", label: "Com crédito" },
                { value: "no", label: "Sem crédito" },
              ]}
            />

            <Select
              label="Ordenar por"
              value={sortBy}
              onChange={setSortBy}
              options={[
                { value: "created_desc", label: "Criação (mais recente)" },
                { value: "created_asc", label: "Criação (mais antiga)" },
                { value: "due_asc", label: "Vencimento (mais próximo)" },
                { value: "due_desc", label: "Vencimento (mais distante)" },
                { value: "amount_desc", label: "A pagar (maior)" },
                { value: "amount_asc", label: "A pagar (menor)" },
                { value: "store_asc", label: "Loja (A-Z)" },
                { value: "store_desc", label: "Loja (Z-A)" },
              ]}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <Input label="Criado de" type="date" value={dateFrom} onChange={setDateFrom} />
            <Input label="Criado até" type="date" value={dateTo} onChange={setDateTo} />
            <Input label="Vencimento de" type="date" value={dueFrom} onChange={setDueFrom} />
            <Input label="Vencimento até" type="date" value={dueTo} onChange={setDueTo} />
            <Input label="A pagar mín." value={amountMin} onChange={setAmountMin} placeholder="Ex.: 100" />
            <Input label="A pagar máx." value={amountMax} onChange={setAmountMax} placeholder="Ex.: 5000" />
          </div>

          <div className="flex flex-wrap gap-2">
            <FilterChip
              onClick={() => {
                const hoje = ymdToday();
                setDateFrom(hoje);
                setDateTo(hoje);
              }}
            >
              Criados hoje
            </FilterChip>

            <FilterChip
              onClick={() => {
                setDateFrom(addDaysYMD(-7));
                setDateTo(ymdToday());
              }}
            >
              Últimos 7 dias
            </FilterChip>

            <FilterChip
              onClick={() => {
                setDateFrom(addDaysYMD(-30));
                setDateTo(ymdToday());
              }}
            >
              Últimos 30 dias
            </FilterChip>

            <FilterChip
              onClick={() => {
                setDueFilter("overdue");
                setPaidFilter("unpaid");
              }}
            >
              Em aberto vencidos
            </FilterChip>

            <FilterChip
              onClick={() => {
                setDueFilter("due_soon");
                setPaidFilter("unpaid");
              }}
            >
              A vencer
            </FilterChip>

            <FilterChip
              onClick={() => {
                setPaidFilter("paid");
              }}
            >
              Somente pagos
            </FilterChip>

            <FilterChip
              onClick={() => {
                setPaidFilter("unpaid");
              }}
            >
              Somente em aberto
            </FilterChip>
          </div>
        </div>
      </SectionBlock>

      <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Resumo financeiro</div>
            <div className="mt-1 text-sm text-slate-600">Valores consolidados considerando os filtros aplicados.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <SecondaryActionButton onClick={() => setViewMode((v) => (v === "compact" ? "full" : "compact"))}>
              {viewMode === "compact" ? "Ver completo" : "Ver compacto"}
            </SecondaryActionButton>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Mercadoria" value={money(resumo.totalMercadoria)} />
          <StatCard label="Frete" value={money(resumo.totalFrete)} />
          <StatCard label="Total" value={money(resumo.totalTotal)} />
          <StatCard label="Crédito abatido" value={`- ${money(resumo.totalCredito)}`} />
          <StatCard label="A pagar (exibido)" value={money(resumo.totalApagar)} />
          <StatCard label="Pago" value={money(resumo.totalPago)} />
          <StatCard label="Em aberto" value={money(resumo.totalAberto)} />
          <StatCard label="Qtd. vencidos" value={resumo.qtdVencidos} />
          <StatCard label="Qtd. a vencer" value={resumo.qtdAVencer} />
          <StatCard label="Valor vencido" value={money(resumo.valorVencido)} />
        </div>
      </div>

      <SectionBlock
        title="Pedidos no financeiro"
        subtitle={`${rows.length} registro(s) • ${viewMode === "compact" ? "visualização compacta" : "visualização completa"}`}
      >
        {loading ? (
          <div className="text-sm text-slate-600">Carregando...</div>
        ) : rows.length === 0 ? (
          <EmptyState text="Nenhum dado encontrado com os filtros atuais." />
        ) : (
          <Table
            headers={columns}
            rows={tableRows}
            onRowClick={(idx) => router.push(`/adm/pedidos/${rows[idx].id}`)}
          />
        )}
      </SectionBlock>
    </div>
  );
}