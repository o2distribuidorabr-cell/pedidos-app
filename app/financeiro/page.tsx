"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PortalShell from "@/app/components/PortalShell";
import { Card, PageHeader, Select, Button, StatCard, Table, Input, Badge } from "@/app/components/ui";

type OrderRow = {
  id: string;
  store_id: string;
  status: string;
  created_at: string | null;

  is_paid: boolean | null;
  paid_at: string | null;
  payment_method: "PIX" | "CARTAO" | "BOLETO" | null;

  logistic_status: "RECEBIDO" | "EM_SEPARACAO" | "ENTREGUE" | null;

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
};

type RowUi = {
  id: string;

  status: string;
  logistic_status: OrderRow["logistic_status"];
  delivery_mode: OrderRow["delivery_mode"];
  created_at: string | null;

  mercadoria: number;
  frete: number;
  total: number;
  credit_applied: number;
  a_pagar: number;

  late_days: number;
  late_fee: number;
  late_interest: number;
  a_pagar_com_encargos: number;

  is_paid: boolean;
  paid_at: string | null;
  payment_method: OrderRow["payment_method"];

  due_date: string | null;
  due_status: "PAGO" | "VENCIDO" | "A_VENCER" | "SEM_VENCIMENTO";

  credit_balance: number;
};

type PixCreateResponse = {
  paymentId: string;
  status?: string;
  detail?: string | null;
  qrCode: string;
  qrCodeBase64: string;
  amountUsed?: number;
  expiresAt?: string | null;
  operationalExpiresAt?: string;
  gateway: PixProvider;
  invoiceUrl?: string;
  externalReference?: string;
  rawResponse?: any;
};

type PixPoll = {
  state: "idle" | "checking" | "approved" | "failed" | "expired";
  lastCheckAt?: string; // ISO
  provider?: PixProvider;
  providerStatus?: string | null;
  providerDetail?: string | null;
  message?: string;
  approvedAt?: string | null;
};

function money(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtBR(iso: string | null | undefined) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return String(iso);
  }
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
function logisticLabel(v: OrderRow["logistic_status"]) {
  if (v === "RECEBIDO") return "Recebido";
  if (v === "EM_SEPARACAO") return "Em separação";
  if (v === "ENTREGUE") return "Entregue";
  return "—";
}
function deliveryLabel(v: OrderRow["delivery_mode"]) {
  return v === "FRETE" ? "Frete" : "Retirada";
}
function statusTone(s: string) {
  if (s === "approved") return "green";
  if (s === "submitted") return "blue";
  if (s === "rejected") return "red";
  return "neutral";
}
function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function calcDueStatus(due: string | null, isPaid: boolean) {
  if (isPaid) return "PAGO" as const;
  if (!due) return "SEM_VENCIMENTO" as const;
  return due < todayYMD() ? ("VENCIDO" as const) : ("A_VENCER" as const);
}
function dueBadge(s: RowUi["due_status"]) {
  if (s === "PAGO") return <Badge tone="green">Pago</Badge>;
  if (s === "VENCIDO") return <Badge tone="red">Vencido</Badge>;
  if (s === "A_VENCER") return <Badge tone="yellow">A vencer</Badge>;
  return <Badge tone="neutral">—</Badge>;
}
function daysLateYMD(dueYmd: string) {
  const [y, m, d] = dueYmd.split("-").map(Number);
  const due = new Date(y, m - 1, d, 12, 0, 0);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  const diff = today.getTime() - due.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return Math.max(days, 0);
}
function clamp2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function msLeft(expiresAtISO: string | null) {
  if (!expiresAtISO) return null;
  const t = new Date(expiresAtISO).getTime();
  const now = Date.now();
  return Math.max(t - now, 0);
}
function fmtMMSS(ms: number) {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
function normalizeProvider(v?: string | null): PixProvider {
  const p = String(v || "MP").toUpperCase();
  if (p === "ASAAS") return "ASAAS";
  if (p === "SANTANDER") return "SANTANDER";
  return "MP";
}
function parseAsaasExpiration(value?: string | null): string | null {
  const v = String(value || "").trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) {
    return v.replace(" ", "T");
  }
  return v;
}
function addMinutesISO(minutes: number) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}
function providerLabel(p?: PixProvider | null) {
  if (p === "ASAAS") return "Asaas";
  if (p === "SANTANDER") return "Santander";
  return "Mercado Pago";
}

/** ✅ relógio de "há X segundos" só para UX (não depende de polling) */
function sinceLabel(iso?: string) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Math.max(Date.now() - t, 0);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  return `há ${h}h`;
}

export default function FinanceiroFranqueadoPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [storeId, setStoreId] = useState<string | null>(null);
  const [rows, setRows] = useState<RowUi[]>([]);
  const [creditBalance, setCreditBalance] = useState<number>(0);

  const [financeSettings, setFinanceSettings] = useState<FinanceSettingsRow | null>(null);
  const [pixProvider, setPixProvider] = useState<PixProvider>("MP");

  const [paidFilter, setPaidFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deliveryFilter, setDeliveryFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const [dueFilter, setDueFilter] = useState<string>("all");

  const [userEmail, setUserEmail] = useState<string>("");

  const [pixOpen, setPixOpen] = useState(false);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixErr, setPixErr] = useState<string>("");
  const [pixData, setPixData] = useState<PixCreateResponse | null>(null);
  const [pixOrderId, setPixOrderId] = useState<string>("");
  const [pixAmountUsed, setPixAmountUsed] = useState<number | null>(null);

  const [poll, setPoll] = useState<PixPoll>({ state: "idle" });

  const pollTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const lastCheckClockRef = useRef<number | null>(null); // ✅ relógio de UI
  const [countdownMs, setCountdownMs] = useState<number | null>(null);
  const [lastCheckUiNow, setLastCheckUiNow] = useState<number>(Date.now()); // força re-render do "há X"

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        router.push("/login");
        return;
      }

      setUserEmail(user.email ?? "");

      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("id", user.id)
        .maybeSingle();

      if (pErr) {
        setMsg(pErr.message);
        setLoading(false);
        return;
      }

      const sId = (profile?.store_id as string | null) ?? null;
      setStoreId(sId);

      if (!sId) {
        setMsg("Sem loja vinculada no seu usuário.");
        setLoading(false);
        return;
      }

      const fs = await loadFinanceSettings();
      await loadFinanceForStore(sId, fs);

      setLoading(false);
    })();
  }, [router]);

  useEffect(() => {
    return () => {
      stopAllTimers();
    };
  }, []);

  useEffect(() => {
    if (!pixOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [pixOpen]);

  function stopAllTimers() {
    if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current);
    if (lastCheckClockRef.current) window.clearInterval(lastCheckClockRef.current);
    pollTimerRef.current = null;
    countdownTimerRef.current = null;
    lastCheckClockRef.current = null;
  }

  /** ✅ inicia relógio local para atualizar "há X" sem depender de polling */
  function startLastCheckClock() {
    if (lastCheckClockRef.current) window.clearInterval(lastCheckClockRef.current);
    lastCheckClockRef.current = window.setInterval(() => setLastCheckUiNow(Date.now()), 1000) as any;
  }

  async function loadFinanceSettings(): Promise<FinanceSettingsRow | null> {
    const { data, error } = await supabase
      .from("finance_settings")
      .select("id,pix_key,apply_late_charges,late_fee_percent,daily_interest_percent,pix_provider")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.warn("finance_settings:", error.message);
      setFinanceSettings(null);
      setPixProvider("MP");
      return null;
    }

    const row = (data ?? null) as FinanceSettingsRow | null;
    setFinanceSettings(row);
    setPixProvider(normalizeProvider((row as any)?.pix_provider));
    return row;
  }

  async function loadCreditBalance(sId: string): Promise<number> {
    const { data, error } = await supabase
      .from("v_store_credit_balance")
      .select("store_id,balance")
      .eq("store_id", sId)
      .maybeSingle();

    if (error) {
      console.warn("credit balance:", error.message);
      setCreditBalance(0);
      return 0;
    }

    const b = Number((data as CreditBalRow | null)?.balance ?? 0) || 0;
    setCreditBalance(b);
    return b;
  }

  async function loadFinanceForStore(sId: string, fs?: FinanceSettingsRow | null) {
    setMsg("");

    let q = supabase
      .from("orders")
      .select("id,store_id,status,created_at,is_paid,paid_at,payment_method,logistic_status,delivery_mode,freight_fee,credit_applied,due_date")
      .eq("store_id", sId)
      .order("created_at", { ascending: false });

    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (deliveryFilter !== "all") q = q.eq("delivery_mode", deliveryFilter);

    if (paidFilter === "paid") q = q.eq("is_paid", true);
    if (paidFilter === "unpaid") q = q.or("is_paid.is.null,is_paid.eq.false");

    if (dateFrom) q = q.gte("created_at", toISOStart(dateFrom));
    if (dateTo) q = q.lte("created_at", toISOEnd(dateTo));

    const { data: ords, error: oErr } = await q;
    if (oErr) {
      setMsg(oErr.message);
      setRows([]);
      return;
    }

    const orders = (ords ?? []) as OrderRow[];
    if (orders.length === 0) {
      await loadCreditBalance(sId);
      setRows([]);
      return;
    }

    const orderIds = orders.map((o) => o.id);

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

    const bal = await loadCreditBalance(sId);

    const settings = fs ?? financeSettings;
    const applyCharges = !!settings?.apply_late_charges;
    const feePct = Number(settings?.late_fee_percent ?? 0) || 0;
    const dailyPct = Number(settings?.daily_interest_percent ?? 0) || 0;

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
      const a_pagar = Math.max(total - credit, 0);

      const isPaid = !!o.is_paid;
      const due_status = calcDueStatus(o.due_date ?? null, isPaid);

      let late_days = 0;
      let late_fee = 0;
      let late_interest = 0;
      let a_pagar_com_encargos = a_pagar;

      if (applyCharges && !isPaid && due_status === "VENCIDO" && o.due_date) {
        late_days = daysLateYMD(o.due_date);
        late_fee = a_pagar * (feePct / 100);
        late_interest = a_pagar * (dailyPct / 100) * late_days;
        a_pagar_com_encargos = Math.max(a_pagar + late_fee + late_interest, 0);
      }

      return {
        id: o.id,
        status: o.status,
        logistic_status: o.logistic_status,
        delivery_mode: o.delivery_mode,
        created_at: o.created_at,

        mercadoria,
        frete,
        total,
        credit_applied: credit,
        a_pagar,

        late_days,
        late_fee,
        late_interest,
        a_pagar_com_encargos,

        is_paid: isPaid,
        paid_at: o.paid_at,
        payment_method: o.payment_method,

        due_date: o.due_date ?? null,
        due_status,

        credit_balance: bal,
      };
    });

    const filtered = dueFilter === "all" ? ui : ui.filter((r) => r.due_status === dueFilter);
    setRows(filtered);
  }

  async function onReload() {
    if (!storeId) return;
    setLoading(true);
    const fs = await loadFinanceSettings();
    await loadFinanceForStore(storeId, fs);
    setLoading(false);
  }

  const resumo = useMemo(() => {
    const totalMercadoria = rows.reduce((a, r) => a + r.mercadoria, 0);
    const totalFrete = rows.reduce((a, r) => a + r.frete, 0);
    const totalTotal = rows.reduce((a, r) => a + r.total, 0);
    const totalCredito = rows.reduce((a, r) => a + r.credit_applied, 0);

    const totalApagar = rows.reduce((a, r) => a + r.a_pagar_com_encargos, 0);
    const totalPago = rows.reduce((a, r) => a + (r.is_paid ? r.a_pagar_com_encargos : 0), 0);
    const totalAberto = totalApagar - totalPago;

    const totalVencido = rows.filter((r) => r.due_status === "VENCIDO").reduce((a, r) => a + r.a_pagar_com_encargos, 0);
    const totalAVencer = rows.filter((r) => r.due_status === "A_VENCER").reduce((a, r) => a + r.a_pagar_com_encargos, 0);

    return { totalMercadoria, totalFrete, totalTotal, totalCredito, totalApagar, totalPago, totalAberto, totalVencido, totalAVencer };
  }, [rows]);

  async function logPaymentRecord(params: {
    orderId: string;
    storeId: string;
    gateway: PixProvider;
    paymentId: string;
    status?: string | null;
    amount?: number | null;
    qrCode?: string | null;
    qrCodeBase64?: string | null;
    expiresAt?: string | null;
    invoiceUrl?: string | null;
    externalReference?: string | null;
    rawResponse?: any;
  }) {
    try {
      const resp = await fetch("/api/payments/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const text = await resp.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      if (!resp.ok) {
        const details = data?.details ? JSON.stringify(data.details) : data?.error ? String(data.error) : text.slice(0, 400);
        throw new Error(`Erro ao gravar log do pagamento | HTTP ${resp.status} ${resp.statusText} | ${details}`);
      }

      return data;
    } catch (e) {
      console.warn("Falha ao gravar log de pagamento:", e);
      return null;
    }
  }

  async function checkPaymentOnce(paymentId: string, provider: PixProvider) {
    // ✅ sempre atualiza lastCheckAt (mesmo se der erro depois)
    setPoll((p) => ({ ...p, lastCheckAt: new Date().toISOString(), provider }));

    if (provider === "SANTANDER") {
      const resp = await fetch(
        `/api/santander/status?txid=${encodeURIComponent(paymentId)}${
          pixOrderId ? `&orderId=${encodeURIComponent(pixOrderId)}` : ""
        }`,
        { method: "GET" }
      );

      const text = await resp.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      if (!resp.ok) {
        const details = data?.error
          ? String(data.error)
          : data?.details
          ? JSON.stringify(data.details)
          : text.slice(0, 300);

        throw new Error(`HTTP ${resp.status} ${resp.statusText} | ${details}`);
      }

      const st = String(data?.normalized_status ?? "").toLowerCase();
      const providerStatus = String(data?.status ?? "ATIVA");

      if (st === "approved") {
        setPoll({
          state: "approved",
          provider: "SANTANDER",
          lastCheckAt: new Date().toISOString(),
          providerStatus,
          providerDetail: "Pagamento confirmado",
          approvedAt: data?.approved_at ?? new Date().toISOString(),
        });
        stopAllTimers();
        await onReload();
        return;
      }

      if (st === "expired" || st === "cancelled") {
        setPoll({
          state: "expired",
          provider: "SANTANDER",
          lastCheckAt: new Date().toISOString(),
          providerStatus,
          providerDetail: "Cobrança não está mais ativa",
          message: "QR expirado ou cancelado. Gere um novo PIX.",
        });
        stopAllTimers();
        return;
      }

      setPoll((p) => ({
        ...p,
        state: "checking",
        provider: "SANTANDER",
        providerStatus,
        providerDetail: "Aguardando pagamento",
        lastCheckAt: new Date().toISOString(),
      }));
      return;
    }

    if (provider === "ASAAS") {
      const resp = await fetch(`/api/asaas/status?paymentId=${encodeURIComponent(paymentId)}`, { method: "GET" });
      const text = await resp.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      if (!resp.ok) {
        const details = data?.details ? JSON.stringify(data.details) : data?.error ? String(data.error) : text.slice(0, 300);
        throw new Error(`HTTP ${resp.status} ${resp.statusText} | ${details}`);
      }

      const st = String(data?.status ?? data?.payment?.status ?? "").toUpperCase();
      const detail = String(data?.payment?.description ?? "");

      if (st === "RECEIVED" || st === "CONFIRMED" || st === "RECEIVED_IN_CASH") {
        setPoll({
          state: "approved",
          provider: "ASAAS",
          lastCheckAt: new Date().toISOString(),
          providerStatus: st,
          providerDetail: detail,
          approvedAt: data?.payment?.paymentDate ?? data?.payment?.clientPaymentDate ?? null,
        });
        stopAllTimers();
        await onReload();
        return;
      }

      if (st === "OVERDUE") {
        setPoll({
          state: "expired",
          provider: "ASAAS",
          lastCheckAt: new Date().toISOString(),
          providerStatus: st,
          providerDetail: detail,
          message: "Cobrança vencida. Gere um novo PIX.",
        });
        stopAllTimers();
        return;
      }

      setPoll((p) => ({
        ...p,
        state: "checking",
        provider: "ASAAS",
        providerStatus: st,
        providerDetail: detail,
        lastCheckAt: new Date().toISOString(),
      }));
      return;
    }

    // MP
    const resp = await fetch(`/api/mp/payment-status?paymentId=${encodeURIComponent(paymentId)}`, { method: "GET" });
    const text = await resp.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }

    if (!resp.ok) {
      const details = data?.details ? JSON.stringify(data.details) : data?.error ? String(data.error) : text.slice(0, 300);
      throw new Error(`HTTP ${resp.status} ${resp.statusText} | ${details}`);
    }

    const st = String(data?.normalized_status ?? data?.status ?? "");
    const det = String(data?.status_detail ?? "");

    if (st === "approved") {
      setPoll({
        state: "approved",
        provider: "MP",
        lastCheckAt: new Date().toISOString(),
        providerStatus: st,
        providerDetail: det,
        approvedAt: data?.date_approved ?? null,
      });
      stopAllTimers();
      await onReload();
      return;
    }

    if (st === "expired") {
      setPoll({
        state: "expired",
        provider: "MP",
        lastCheckAt: new Date().toISOString(),
        providerStatus: st,
        providerDetail: det,
        message: "QR expirado. Gere um novo PIX.",
      });
      stopAllTimers();
      return;
    }

    setPoll((p) => ({
      ...p,
      state: "checking",
      provider: "MP",
      providerStatus: st,
      providerDetail: det,
      lastCheckAt: new Date().toISOString(),
    }));
  }

  function startCountdown(expiresAtISO: string | null) {
    if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = null;

    if (!expiresAtISO) {
      setCountdownMs(null);
      return;
    }

    const tick = () => {
      const left = msLeft(expiresAtISO);
      setCountdownMs(left);

      if (left !== null && left <= 0) {
        setPoll((p) => (p.state === "approved" ? p : { ...p, state: "expired", message: "QR expirado. Gere um novo PIX." }));
        if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    tick();
    countdownTimerRef.current = window.setInterval(tick, 1000) as any;
  }

  async function startPolling(paymentId: string, provider: PixProvider, operationalExpiresAtISO: string | null) {
    stopAllTimers();
    startLastCheckClock(); // ✅ mantém UI viva

    setPoll({ state: "checking", lastCheckAt: new Date().toISOString(), provider });

    startCountdown(operationalExpiresAtISO);

    try {
      await checkPaymentOnce(paymentId, provider);
    } catch (e: any) {
      setPoll({
        state: "failed",
        provider,
        lastCheckAt: new Date().toISOString(),
        message: String(e?.message ?? e),
      });
      return;
    }

    pollTimerRef.current = window.setInterval(async () => {
      try {
        const left = msLeft(operationalExpiresAtISO);
        if (left !== null && left <= 0) {
          setPoll({
            state: "expired",
            provider,
            lastCheckAt: new Date().toISOString(),
            message: "QR expirado. Gere um novo PIX.",
          });
          stopAllTimers();
          return;
        }

        await checkPaymentOnce(paymentId, provider);
      } catch (e: any) {
        setPoll({
          state: "failed",
          provider,
          lastCheckAt: new Date().toISOString(),
          message: String(e?.message ?? e),
        });
        stopAllTimers();
      }
    }, 3000) as any;
  }

  async function openPixForOrder(r: RowUi) {
    if (!storeId) {
      setPixErr("Loja não identificada.");
      return;
    }

    setPixErr("");
    setPixData(null);
    setPixOrderId(r.id);
    setPixOpen(true);
    setPixAmountUsed(null);
    setPoll({ state: "idle", provider: pixProvider });
    setCountdownMs(null);
    stopAllTimers();

    const hasCharges =
      r.late_days > 0 &&
      (r.late_fee > 0 || r.late_interest > 0) &&
      !r.is_paid &&
      r.due_status === "VENCIDO";

    const amountFront = clamp2(hasCharges ? r.a_pagar_com_encargos : r.a_pagar);

    try {
      setPixLoading(true);

      if (pixProvider === "SANTANDER") {
        const resp = await fetch("/api/santander/pix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: r.id,
            pedido: r.id,
            storeId,
            value: amountFront,
            valor: amountFront,
            description: `Pedido ${r.id}`,
            nome: "Cliente",
            cpf: "",
            payer: {
              email: userEmail || "cliente@cliente.com",
              name: "Cliente",
              cpf: "",
            },
          }),
        });

        const text = await resp.text();
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }

        if (!resp.ok) {
          const details = data?.error ? String(data.error) : data?.details ? JSON.stringify(data.details) : text.slice(0, 500);
          throw new Error(`HTTP ${resp.status} ${resp.statusText} | ${details}`);
        }

        const paymentId = String(data?.paymentId ?? data?.txid ?? data?.id ?? "").trim();
        const status = String(data?.status ?? "ATIVA").trim();
        const qrCode = String(data?.qrCode ?? "").trim();
        const qrCodeBase64 = String(data?.qrCodeBase64 ?? "").trim();

        if (!paymentId) throw new Error("Santander não retornou paymentId.");
        if (!qrCode) throw new Error("Santander não retornou qrCode.");
        if (!qrCodeBase64) throw new Error("Santander não retornou qrCodeBase64.");

        setPixAmountUsed(Number(data?.amountUsed ?? amountFront));

        await logPaymentRecord({
          orderId: r.id,
          storeId,
          gateway: "SANTANDER",
          paymentId,
          status,
          amount: Number(data?.amountUsed ?? amountFront),
          qrCode,
          qrCodeBase64,
          expiresAt: data?.expiresAt ? String(data.expiresAt) : null,
          invoiceUrl: null,
          externalReference: r.id,
          rawResponse: data,
        });

        // ✅ Santander: validade operacional SEMPRE 10 min a partir de agora
        const operationalExpiresAt = addMinutesISO(10);

        setPixData({
          gateway: "SANTANDER",
          paymentId,
          status,
          detail: data?.detail ?? "QR gerado com sucesso",
          qrCode,
          qrCodeBase64,
          amountUsed: Number(data?.amountUsed ?? amountFront),
          expiresAt: data?.expiresAt ? String(data.expiresAt) : null,
          operationalExpiresAt,
          invoiceUrl: undefined,
          externalReference: r.id,
          rawResponse: data,
        });

        await startPolling(paymentId, "SANTANDER", operationalExpiresAt);
        return;
      }

      if (pixProvider === "ASAAS") {
        const resp = await fetch("/api/asaas/pix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: r.id,
            storeId,
            value: amountFront,
            description: `Pedido ${r.id}`,
            externalReference: r.id,
            dueDate: todayYMD(),
          }),
        });

        const text = await resp.text();
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }

        if (!resp.ok) {
          const details = data?.details ? JSON.stringify(data.details) : data?.error ? String(data.error) : text.slice(0, 400);
          throw new Error(`HTTP ${resp.status} ${resp.statusText} | ${details}`);
        }

        const payId = String(data?.payment?.id ?? "");
        if (!payId) throw new Error("Asaas não retornou payment.id");

        const used = Number(data?.payment?.value ?? data?.pricing?.amountToCharge ?? data?.amountUsed ?? amountFront);
        setPixAmountUsed(Number.isFinite(used) ? used : amountFront);

        const expiresAt = parseAsaasExpiration(data?.pix?.expirationDate);
        const operationalExpiresAt = addMinutesISO(10);

        const qrCode = String(data?.pix?.payload ?? "");
        const qrCodeBase64 = String(data?.pix?.encodedImage ?? "");
        const paymentStatus = String(data?.payment?.status ?? "");
        const invoiceUrl = String(data?.payment?.invoiceUrl ?? "");
        const externalReference = String(data?.payment?.externalReference ?? r.id);

        await logPaymentRecord({
          orderId: r.id,
          storeId,
          gateway: "ASAAS",
          paymentId: payId,
          status: paymentStatus,
          amount: Number.isFinite(used) ? used : amountFront,
          qrCode,
          qrCodeBase64,
          expiresAt,
          invoiceUrl,
          externalReference,
          rawResponse: data,
        });

        setPixData({
          gateway: "ASAAS",
          paymentId: payId,
          status: paymentStatus,
          detail: String(data?.payment?.description ?? ""),
          qrCode,
          qrCodeBase64,
          amountUsed: Number.isFinite(used) ? used : amountFront,
          expiresAt: expiresAt ?? undefined,
          operationalExpiresAt,
          invoiceUrl,
          externalReference,
          rawResponse: data,
        });

        await startPolling(payId, "ASAAS", operationalExpiresAt);
        return;
      }

      // MP
      const resp = await fetch("/api/mp/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: r.id,
          description: `Pedido ${r.id}`,
          payer: { email: userEmail || "cliente@cliente.com" },
          amount: amountFront,
        }),
      });

      const text = await resp.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      if (!resp.ok) {
        const details = data?.details ? JSON.stringify(data.details) : data?.error ? String(data.error) : text.slice(0, 400);
        throw new Error(`HTTP ${resp.status} ${resp.statusText} | ${details}`);
      }

      const payId = String(data?.paymentId ?? "");
      if (!payId) throw new Error("Mercado Pago não retornou paymentId");

      const used = Number(data?.amountUsed ?? amountFront);
      if (Number.isFinite(used)) setPixAmountUsed(used);

      const expiresAt = data?.expiresAt ? String(data.expiresAt) : null;
      const operationalExpiresAt = addMinutesISO(10);

      const qrCode = String(data?.qrCode ?? "");
      const qrCodeBase64 = String(data?.qrCodeBase64 ?? "");
      const paymentStatus = String(data?.status ?? "");
      const externalReference = r.id;

      await logPaymentRecord({
        orderId: r.id,
        storeId,
        gateway: "MP",
        paymentId: payId,
        status: paymentStatus,
        amount: used,
        qrCode,
        qrCodeBase64,
        expiresAt,
        invoiceUrl: null,
        externalReference,
        rawResponse: data,
      });

      setPixData({
        gateway: "MP",
        paymentId: payId,
        status: paymentStatus,
        detail: data?.detail,
        qrCode,
        qrCodeBase64,
        amountUsed: used,
        expiresAt: expiresAt ?? undefined,
        operationalExpiresAt,
        invoiceUrl: undefined,
        externalReference,
        rawResponse: data,
      });

      await startPolling(payId, "MP", operationalExpiresAt);
    } catch (e: any) {
      setPixErr(String(e?.message ?? e));
    } finally {
      setPixLoading(false);
    }
  }

  function closePixModal() {
    setPixOpen(false);
    setPixErr("");
    setPixData(null);
    setPixOrderId("");
    setPixLoading(false);
    setPixAmountUsed(null);
    setPoll({ state: "idle" });
    setCountdownMs(null);
    stopAllTimers();
  }

  const headers = [
    "Pedido",
    "Status",
    "Operação",
    "Entrega",
    "Vencimento",
    "Situação",
    "Forma pgto",
    "Mercadoria",
    "Frete",
    "Total",
    "Crédito",
    "A pagar",
    "Pago?",
    "Data pgto",
    "Saldo crédito",
    "Ações",
  ];

  const tableRows = rows.map((r) => {
    const hasCharges = r.late_days > 0 && (r.late_fee > 0 || r.late_interest > 0) && !r.is_paid && r.due_status === "VENCIDO";
    const canPayPix = !r.is_paid && (hasCharges ? r.a_pagar_com_encargos : r.a_pagar) > 0;

    return [
      <span key="id" className="font-mono text-xs">{r.id}</span>,
      <Badge key="st" tone={statusTone(r.status) as any}>{r.status}</Badge>,
      <span key="op">{logisticLabel(r.logistic_status)}</span>,
      <span key="del">{deliveryLabel(r.delivery_mode)}</span>,
      <span key="due">{r.due_date ?? "-"}</span>,
      <span key="dueSt">{dueBadge(r.due_status)}</span>,
      <span key="pm">{r.payment_method ?? "-"}</span>,
      <span key="m" className="font-semibold">{money(r.mercadoria)}</span>,
      <span key="f">{r.delivery_mode === "FRETE" ? money(r.frete) : "-"}</span>,
      <span key="t" className="font-semibold">{money(r.total)}</span>,
      <span key="c">- {money(r.credit_applied)}</span>,
      <div key="ap" className="min-w-0">
        <div className="font-semibold">{money(hasCharges ? r.a_pagar_com_encargos : r.a_pagar)}</div>
        {hasCharges ? (
          <div className="mt-1 text-[11px] text-slate-500">
            Base {money(r.a_pagar)} + multa {money(r.late_fee)} + juros {money(r.late_interest)} ({r.late_days} dia(s))
          </div>
        ) : null}
      </div>,
      <span key="p">{r.is_paid ? "Sim" : "Não"}</span>,
      <span key="dt">{fmtBR(r.paid_at)}</span>,
      <span key="bal" className="font-semibold">{money(r.credit_balance)}</span>,
      <div key="act" className="flex gap-2">
        <Button
          variant="secondary"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (canPayPix) openPixForOrder(r);
          }}
          disabled={!canPayPix}
        >
          Pagar com PIX
        </Button>
      </div>,
    ];
  });

  if (loading) {
    return (
      <PortalShell title="Financeiro" subtitle="Resumo de pedidos, crédito e pagamentos">
        <Card>
          <div>Carregando...</div>
        </Card>
      </PortalShell>
    );
  }

  return (
    <PortalShell title="Financeiro" subtitle="Resumo de pedidos, crédito e pagamentos">
      <div className="space-y-4">
        <PageHeader
          title="Financeiro"
          subtitle={`Resumo de pedidos, crédito e pagamentos. Provedor PIX ativo: ${providerLabel(pixProvider)}`}
        />

        <Card title="Filtros" right={<Button variant="secondary" onClick={onReload}>Recarregar</Button>}>
          {msg ? <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div> : null}

          <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Provedor PIX ativo nesta loja: <b>{providerLabel(pixProvider)}</b>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
            <Select
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: "Todos" },
                { value: "draft", label: "draft" },
                { value: "submitted", label: "submitted" },
                { value: "approved", label: "approved" },
                { value: "rejected", label: "rejected" },
              ]}
            />

            <Select
              label="Pagamento"
              value={paidFilter}
              onChange={setPaidFilter}
              options={[
                { value: "all", label: "Todos" },
                { value: "paid", label: "Somente pagos" },
                { value: "unpaid", label: "Somente não pagos" },
              ]}
            />

            <Select
              label="Entrega"
              value={deliveryFilter}
              onChange={setDeliveryFilter}
              options={[
                { value: "all", label: "Todas" },
                { value: "RETIRADA", label: "Retirada" },
                { value: "FRETE", label: "Frete" },
              ]}
            />

            <Select
              label="Vencimento"
              value={dueFilter}
              onChange={setDueFilter}
              options={[
                { value: "all", label: "Todos" },
                { value: "A_VENCER", label: "A vencer" },
                { value: "VENCIDO", label: "Vencidos" },
                { value: "PAGO", label: "Pagos" },
                { value: "SEM_VENCIMENTO", label: "Sem vencimento" },
              ]}
            />

            <Input label="De" type="date" value={dateFrom} onChange={setDateFrom} />
            <Input label="Até" type="date" value={dateTo} onChange={setDateTo} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={onReload}>Aplicar filtros</Button>
            <Button
              variant="secondary"
              onClick={() => {
                setPaidFilter("all");
                setStatusFilter("all");
                setDeliveryFilter("all");
                setDueFilter("all");
                setDateFrom("");
                setDateTo("");
              }}
            >
              Limpar filtros
            </Button>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Mercadoria" value={money(resumo.totalMercadoria)} />
          <StatCard label="Frete" value={money(resumo.totalFrete)} />
          <StatCard label="Total" value={money(resumo.totalTotal)} />
          <StatCard label="Crédito abatido" value={`- ${money(resumo.totalCredito)}`} />
          <StatCard label="A pagar (com encargos)" value={money(resumo.totalApagar)} />
          <StatCard label="Pago" value={money(resumo.totalPago)} />
          <StatCard label="Em aberto" value={money(resumo.totalAberto)} />
          <StatCard label="Saldo de crédito" value={money(creditBalance)} />
          <StatCard label="Vencidos (no filtro)" value={money(resumo.totalVencido)} />
          <StatCard label="A vencer (no filtro)" value={money(resumo.totalAVencer)} />
        </div>

        <Card title="Pedidos" subtitle="Clique em uma linha para abrir o pedido" right={<Button variant="secondary" onClick={onReload}>Atualizar</Button>}>
          <div
            className="cursor-pointer"
            onClickCapture={(e) => {
              const btn = (e.target as HTMLElement).closest("button");
              if (btn) return;
              const tr = (e.target as HTMLElement).closest("[data-order-id]") as HTMLElement | null;
              if (!tr) return;
              const id = tr.getAttribute("data-order-id");
              if (id) router.push(`/pedidos/${id}`);
            }}
          >
            <Table
              headers={headers}
              rows={
                rows.length === 0
                  ? []
                  : rows.map((r, idx) => {
                      const row = tableRows[idx];
                      return row.map((cell, cidx) => (
                        <div key={`${r.id}-${cidx}`} data-order-id={r.id}>
                          {cell}
                        </div>
                      ));
                    })
              }
            />
          </div>

          {rows.length === 0 ? <div className="mt-3 text-sm text-slate-500">Nenhum dado encontrado.</div> : null}
        </Card>

        {pixOpen ? (
          <div className="fixed inset-0 z-[60] bg-black/40" role="dialog" aria-modal="true">
            <div className="h-full w-full overflow-y-auto p-4">
              <div className="mx-auto flex min-h-[calc(100vh-2rem)] items-center justify-center">
                <div className="w-full max-w-xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-xl flex flex-col">
                  <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-base font-semibold">Pagamento PIX</div>
                      <div className="text-xs text-slate-500 truncate">
                        Pedido: <span className="font-mono">{pixOrderId}</span>
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        Provedor: <span className="font-semibold">{providerLabel(pixData?.gateway || pixProvider)}</span>
                      </div>
                    </div>
                    <Button variant="secondary" onClick={closePixModal}>
                      Fechar
                    </Button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4">
                    {pixLoading ? <div className="text-sm">Gerando QR Code…</div> : null}

                    {!pixLoading && pixErr ? (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        <div className="font-semibold">Erro</div>
                        <div className="mt-1 break-words">{pixErr}</div>
                      </div>
                    ) : null}

                    {!pixLoading && pixData ? (
                      <div className="grid gap-3">
                        {pixAmountUsed != null ? (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                            Valor da cobrança gerada: <b>{money(pixAmountUsed)}</b>
                            {pixData.gateway === "ASAAS" ? (
                              <div className="mt-1 text-xs text-slate-500">
                                No Asaas, multa e juros serão aplicados conforme o vencimento da cobrança.
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {pixData.operationalExpiresAt ? (
                          <div className="text-sm text-slate-700">
                            Validade operacional do QR:{" "}
                            <b>{countdownMs == null ? "—" : countdownMs <= 0 ? "Expirado" : fmtMMSS(countdownMs)}</b>{" "}
                            <span className="text-xs text-slate-500">(10 minutos no sistema)</span>
                          </div>
                        ) : null}

                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                          <div className="font-semibold text-slate-800">Status</div>
                          <div className="mt-1 text-slate-700">
                            {poll.state === "checking" ? "Aguardando confirmação do pagamento…" : null}
                            {poll.state === "approved" ? "Pagamento efetuado ✅" : null}
                            {poll.state === "expired" ? "QR expirado. Gere um novo PIX." : null}
                            {poll.state === "failed" ? "Falha ao checar status." : null}
                            {poll.state === "idle" ? "—" : null}
                          </div>

                          <div className="mt-1 text-xs text-slate-500">
                            Última checagem: {poll.lastCheckAt ? fmtBR(poll.lastCheckAt) : "—"}
                            {poll.lastCheckAt ? ` • ${sinceLabel(poll.lastCheckAt)}` : ""}
                            {poll.provider ? ` • Provedor: ${providerLabel(poll.provider)}` : ""}
                            {poll.providerStatus ? ` • Status: ${poll.providerStatus}` : ""}
                            {poll.providerDetail ? ` (${poll.providerDetail})` : ""}
                            {/* força re-render do "há X" */}
                            <span className="hidden">{String(lastCheckUiNow)}</span>
                          </div>

                          {poll.state === "failed" && poll.message ? (
                            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 break-words">
                              {poll.message}
                            </div>
                          ) : null}

                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              variant="secondary"
                              onClick={async () => {
                                if (!pixData?.paymentId || !pixData?.gateway) return;
                                try {
                                  await checkPaymentOnce(pixData.paymentId, pixData.gateway);
                                } catch (e: any) {
                                  setPoll({
                                    state: "failed",
                                    provider: pixData.gateway,
                                    lastCheckAt: new Date().toISOString(),
                                    message: String(e?.message ?? e),
                                  });
                                }
                              }}
                            >
                              Rechecar agora
                            </Button>

                            <Button variant="secondary" onClick={onReload}>
                              Atualizar financeiro
                            </Button>
                          </div>
                        </div>

                        <div className="text-xs text-slate-600">
                          ID do pagamento: <span className="font-mono">{pixData.paymentId}</span>
                        </div>

                        {!!pixData.qrCodeBase64 ? (
                          <div className="flex justify-center">
                            <img
                              alt="QR Code PIX"
                              src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                              className="h-auto w-full max-w-[320px] rounded-xl border"
                            />
                          </div>
                        ) : null}

                        <div>
                          <div className="mb-1 text-sm font-semibold">PIX Copia e Cola</div>
                          <textarea readOnly value={pixData.qrCode || ""} className="w-full rounded-xl border px-3 py-2 text-xs" rows={5} />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="sticky bottom-0 z-10 border-t bg-white px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={async () => {
                          if (!pixData?.qrCode) return;
                          await navigator.clipboard.writeText(pixData.qrCode);
                        }}
                        disabled={!pixData?.qrCode}
                      >
                        Copiar código
                      </Button>
                      <Button variant="secondary" onClick={closePixModal}>
                        Ok
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </PortalShell>
  );
}