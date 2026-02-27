"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { PageHeader, Card, Button, Select, Badge, Table, Input } from "@/app/components/ui";

type StoreRow = { id: string; name: string | null };

type OrderRow = {
  id: string;
  store_id: string;
  status: string;
  created_at: string | null;

  is_paid: boolean | null;
  paid_at: string | null;
  payment_method: "PIX" | "CARTAO" | "BOLETO" | null;

  // ✅ NOVO: valor real pago no MP (com juros/multa)
  paid_amount: number | null;

  logistic_status: "RECEBIDO" | "EM_SEPARACAO" | "ENTREGUE" | null;

  delivery_mode: "RETIRADA" | "FRETE" | null;
  freight_fee: number | null;

  credit_applied: number | null;

  due_date: string | null;
};

type TotalsRow = { order_id: string; store_id: string; total_cost: number | null };
type OrderItemRow = { order_id: string; qty: number | null; unit_cost: number | null };
type CreditBalRow = { store_id: string; balance: number | null };

type FinanceSettingsRow = {
  id: number;
  pix_key: string | null;
  apply_late_charges: boolean | null;
  late_fee_percent: number | null;
  daily_interest_percent: number | null;
  updated_at?: string | null;
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

  // ✅ NOVO
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

  // ✅ valor exibido em “A pagar”
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

  const [storeSelected, setStoreSelected] = useState<string[]>([]);
  const [storePopoverOpen, setStorePopoverOpen] = useState(false);
  const [storeSearch, setStoreSearch] = useState("");
  const popRef = useRef<HTMLDivElement | null>(null);

  const [paidFilter, setPaidFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deliveryFilter, setDeliveryFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const [payMethodFilter, setPayMethodFilter] = useState<string>("all");
  const [dueFilter, setDueFilter] = useState<string>("all");
  const [dueFrom, setDueFrom] = useState<string>("");
  const [dueTo, setDueTo] = useState<string>("");

  const [viewMode, setViewMode] = useState<"compact" | "full">("compact");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        router.push("/login");
        return;
      }

      await loadFinanceSettings();
      const storeList = await loadStores();
      await loadFinance(storeList);

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function parsePercentInput(v: string) {
    const s = String(v ?? "").trim().replace("%", "").replace(/\s/g, "");
    if (!s) return 0;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  async function loadFinanceSettings() {
    setSettingsLoading(true);
    try {
      const { data, error } = await supabase
        .from("finance_settings")
        .select("id,pix_key,apply_late_charges,late_fee_percent,daily_interest_percent")
        .eq("id", 1)
        .maybeSingle();

      if (error) {
        console.warn("loadFinanceSettings:", error.message);
        return;
      }

      const row = (data ?? null) as FinanceSettingsRow | null;
      if (row) {
        setPixKey(row.pix_key ?? "");
        setApplyLateCharges(!!(row.apply_late_charges ?? true));
        setLateFeePercent(String(row.late_fee_percent ?? 2).replace(".", ","));
        setDailyInterestPercent(String(row.daily_interest_percent ?? 0.033).replace(".", ","));
      }
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
    };

    const { error } = await supabase.from("finance_settings").upsert(payload, { onConflict: "id" });

    if (error) {
      setMsg(`Erro ao salvar configurações: ${error.message}`);
      setSettingsSaving(false);
      return;
    }

    setSettingsSaving(false);
    const storeList = await loadStores();
    await loadFinance(storeList);
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

  async function loadFinance(storeList: StoreRow[]) {
    setMsg("");

    let q = supabase
      .from("orders")
      .select(
        "id,store_id,status,created_at,is_paid,paid_at,payment_method,paid_amount,logistic_status,delivery_mode,freight_fee,credit_applied,due_date"
      )
      .order("created_at", { ascending: false });

    if (storeSelected.length > 0) q = q.in("store_id", storeSelected);

    if (statusFilter !== "all") q = q.eq("status", statusFilter);
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
    }

    if (orders.length === 0) {
      setRows([]);
      return;
    }

    const orderIds = orders.map((o) => o.id);
    const storeIdsUnique = Array.from(new Set(orders.map((o) => o.store_id)));

    const { data: tots, error: tErr } = await supabase.from("v_order_totals").select("order_id,store_id,total_cost").in("order_id", orderIds);
    if (tErr) setMsg(tErr.message);

    const totalsMap = new Map<string, number>();
    for (const r of (tots ?? []) as TotalsRow[]) totalsMap.set(r.order_id, Number(r.total_cost) || 0);

    const { data: itemsRaw, error: iErr } = await supabase.from("order_items").select("order_id,qty,unit_cost").in("order_id", orderIds);
    if (iErr) console.warn("order_items calc:", iErr.message);

    const itemsCalcMap = new Map<string, number>();
    for (const r of (itemsRaw ?? []) as OrderItemRow[]) {
      const cur = itemsCalcMap.get(r.order_id) ?? 0;
      const line = (Number(r.qty) || 0) * (Number(r.unit_cost) || 0);
      itemsCalcMap.set(r.order_id, cur + line);
    }

    const { data: bals, error: bErr } = await supabase.from("v_store_credit_balance").select("store_id,balance").in("store_id", storeIdsUnique);
    if (bErr) console.warn("credit balance:", bErr.message);

    const balMap = new Map<string, number>();
    for (const r of (bals ?? []) as CreditBalRow[]) balMap.set(r.store_id, Number(r.balance) || 0);

    const storeMap = new Map<string, string>();
    for (const s of storeList) storeMap.set(s.id, s.name ?? s.id);

    const multaPct = clampPercent(parsePercentInput(lateFeePercent)) / 100;
    const jurosDiaPct = clampPercent(parsePercentInput(dailyInterestPercent)) / 100;
    const aplicar = !!applyLateCharges;

    const ui: RowUi[] = orders.map((o) => {
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

      // ✅ REGRA NOVA:
      // Se está pago e temos paid_amount, mostramos exatamente o que foi pago.
      const paid_amount = Number(o.paid_amount ?? 0) || 0;
      const a_pagar_exib = o.is_paid && paid_amount > 0 ? paid_amount : Math.max(a_pagar_base + encargos, 0);

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

    setRows(ui);
  }

  async function onApply() {
    setLoading(true);
    const storeList = await loadStores();
    await loadFinance(storeList);
    setLoading(false);
  }

  const resumo = useMemo(() => {
    const totalMercadoria = rows.reduce((a, r) => a + r.mercadoria, 0);
    const totalFrete = rows.reduce((a, r) => a + r.frete, 0);
    const totalTotal = rows.reduce((a, r) => a + r.total, 0);
    const totalCredito = rows.reduce((a, r) => a + r.credit_applied, 0);

    // ✅ Agora tudo usa a_pagar_exib (pago = valor pago real; aberto = com encargos)
    const totalApagar = rows.reduce((a, r) => a + r.a_pagar_exib, 0);
    const totalPago = rows.reduce((a, r) => a + (r.is_paid ? r.a_pagar_exib : 0), 0);
    const totalAberto = totalApagar - totalPago;

    const qtdVencidos = rows.filter((r) => r.is_overdue).length;
    const qtdAVencer = rows.filter((r) => r.is_due_soon).length;

    return { totalMercadoria, totalFrete, totalTotal, totalCredito, totalApagar, totalPago, totalAberto, qtdVencidos, qtdAVencer };
  }, [rows]);

  const storeFilteredList = useMemo(() => {
    const q = storeSearch.trim().toLowerCase();
    const base = stores;
    if (!q) return base;
    return base.filter((s) => `${s.name ?? ""} ${s.id}`.toLowerCase().includes(q));
  }, [stores, storeSearch]);

  const columns = useMemo(() => {
    const baseCompact = ["Pedido", "Loja", "Operação", "Vencimento", "Forma", "Total", "A pagar", "Pago?"];
    const baseFull = ["Pedido", "Loja", "Operação", "Entrega", "Vencimento", "Forma", "Mercadoria", "Frete", "Total", "Crédito", "A pagar", "Pago?", "Data pagamento", "Saldo crédito"];
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

          {/* Em aberto e vencido: mostra encargos */}
          {!r.is_paid && r.encargos > 0 ? (
            <div className="text-xs text-slate-600">
              Encargos: <b className="text-slate-900">{money(r.encargos)}</b>{" "}
              <span className="text-slate-500">
                (multa {money(r.multa)} + juros {money(r.juros)} • {r.days_late} dia(s))
              </span>
            </div>
          ) : null}

          {/* Pago: se tiver paid_amount e for maior que base, mostra que pagou com encargos */}
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        subtitle="Resumo de pedidos, crédito e pagamentos."
        right={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => router.push("/adm/pedidos")}>Pedidos</Button>
            <Button variant="secondary" onClick={onApply} disabled={loading}>Recarregar</Button>
          </div>
        }
      />

      {msg ? <Card><div className="text-sm text-red-600">{msg}</div></Card> : null}

      <Card
        title="Configurações de cobrança"
        subtitle="Define os encargos automáticos após o vencimento."
        right={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={loadFinanceSettings} disabled={settingsLoading || settingsSaving}>
              {settingsLoading ? "Carregando..." : "Recarregar"}
            </Button>
            <Button onClick={saveFinanceSettings} disabled={settingsLoading || settingsSaving}>
              {settingsSaving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-6">
          <Select
            label="Aplicar multa/juros após vencimento?"
            value={applyLateCharges ? "true" : "false"}
            onChange={(v) => setApplyLateCharges(v === "true")}
            options={[
              { value: "true", label: "Sim" },
              { value: "false", label: "Não" },
            ]}
          />
          <Input label="Multa (% uma vez)" value={lateFeePercent} onChange={setLateFeePercent} placeholder="Ex.: 2" />
          <Input label="Juros (% ao dia)" value={dailyInterestPercent} onChange={setDailyInterestPercent} placeholder="Ex.: 0,033" />

          <div className="md:col-span-6 text-xs text-slate-500">
            Cálculo (somente pedidos <b>em aberto</b> e <b>vencidos</b>): multa = A pagar × (%/100) (uma vez) • juros = A pagar × (%/100) × dias em atraso.
            <br />
            <b>Pago:</b> o sistema mostra o valor real pago (campo <code>orders.paid_amount</code> vindo do Mercado Pago).
          </div>
        </div>
      </Card>

      <Card title="Filtros">
        <div className="grid gap-3 md:grid-cols-6">
          <div className="relative" ref={popRef}>
            <div className="text-xs font-semibold text-slate-600 mb-1">Loja</div>
            <Button variant="secondary" onClick={() => setStorePopoverOpen((v) => !v)} disabled={loading} className="w-full justify-between">
              <span className="truncate">{storeButtonLabel()}</span>
              <span className="ml-2 text-slate-500">{storePopoverOpen ? "▲" : "▼"}</span>
            </Button>

            {storePopoverOpen ? (
              <div className="absolute z-50 mt-2 w-[360px] max-w-[90vw] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">Selecionar lojas</div>
                  <Button variant="secondary" onClick={() => setStorePopoverOpen(false)}>Fechar</Button>
                </div>

                <div className="mt-3">
                  <Input value={storeSearch} onChange={setStoreSearch} placeholder="Buscar loja..." />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={clearStores} disabled={loading}>Todas</Button>
                  <Button variant="secondary" onClick={() => selectOnlyVisible(storeFilteredList)} disabled={loading || storeFilteredList.length === 0}>
                    Selecionar filtradas
                  </Button>
                </div>

                <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-slate-200">
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
                              <div className="text-sm font-semibold text-slate-900 truncate">{s.name ?? s.id}</div>
                              <div className="text-xs font-mono text-slate-500 truncate">{s.id}</div>
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

          <Select label="Status" value={statusFilter} onChange={setStatusFilter} options={[
            { value: "all", label: "Todos" },
            { value: "draft", label: "draft" },
            { value: "submitted", label: "submitted" },
            { value: "approved", label: "approved" },
            { value: "rejected", label: "rejected" },
          ]} />

          <Select label="Pagamento" value={paidFilter} onChange={setPaidFilter} options={[
            { value: "all", label: "Todos" },
            { value: "paid", label: "Somente pagos" },
            { value: "unpaid", label: "Somente não pagos" },
          ]} />

          <Select label="Entrega" value={deliveryFilter} onChange={setDeliveryFilter} options={[
            { value: "all", label: "Todas" },
            { value: "RETIRADA", label: "Retirada" },
            { value: "FRETE", label: "Frete" },
          ]} />

          <Select label="Forma" value={payMethodFilter} onChange={setPayMethodFilter} options={[
            { value: "all", label: "Todas" },
            { value: "PIX", label: "PIX" },
            { value: "CARTAO", label: "Cartão" },
            { value: "BOLETO", label: "Boleto" },
          ]} />

          <Select label="Vencimento" value={dueFilter} onChange={setDueFilter} options={[
            { value: "all", label: "Todos" },
            { value: "due_soon", label: "A vencer (próx. 3 dias)" },
            { value: "overdue", label: "Vencidos" },
            { value: "no_due", label: "Sem vencimento" },
          ]} />

          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1">De (criação)</div>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1">Até (criação)</div>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1">De (venc.)</div>
            <input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1">Até (venc.)</div>
            <input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="md:col-span-6 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Badge tone={resumo.qtdVencidos > 0 ? "red" : "slate"}>Vencidos: {resumo.qtdVencidos}</Badge>
              <Badge tone={resumo.qtdAVencer > 0 ? "yellow" : "slate"}>A vencer: {resumo.qtdAVencer}</Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                label="Visualização"
                value={viewMode}
                onChange={(v) => setViewMode((v as any) === "full" ? "full" : "compact")}
                options={[
                  { value: "compact", label: "Compacta (cabe na tela)" },
                  { value: "full", label: "Completa" },
                ]}
              />

              <Button
                variant="secondary"
                onClick={() => {
                  setStoreSelected([]);
                  setStoreSearch("");
                  setPaidFilter("all");
                  setStatusFilter("all");
                  setDeliveryFilter("all");
                  setPayMethodFilter("all");
                  setDueFilter("all");
                  setDateFrom("");
                  setDateTo("");
                  setDueFrom("");
                  setDueTo("");
                }}
                disabled={loading}
              >
                Limpar
              </Button>

              <Button onClick={onApply} disabled={loading}>Aplicar filtros</Button>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Resumo">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">Mercadoria</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{money(resumo.totalMercadoria)}</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">Frete</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{money(resumo.totalFrete)}</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold text-slate-500">Total</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{money(resumo.totalTotal)}</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold text-slate-500">Crédito abatido</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">- {money(resumo.totalCredito)}</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold text-slate-500">A pagar (exibido)</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{money(resumo.totalApagar)}</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">Pago</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{money(resumo.totalPago)}</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">Em aberto</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{money(resumo.totalAberto)}</div>
          </div>
        </div>
      </Card>

      <Card
        title="Pedidos no financeiro"
        subtitle={`${rows.length} registro(s) • ${viewMode === "compact" ? "visualização compacta" : "visualização completa"}`}
        right={
          <Button variant="secondary" onClick={() => setViewMode((v) => (v === "compact" ? "full" : "compact"))}>
            {viewMode === "compact" ? "Ver completo" : "Ver compacto"}
          </Button>
        }
      >
        {loading ? (
          <div>Carregando...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-600">Nenhum dado encontrado.</div>
        ) : (
          <Table headers={columns} rows={tableRows} onRowClick={(idx) => router.push(`/adm/pedidos/${rows[idx].id}`)} />
        )}
      </Card>
    </div>
  );
}