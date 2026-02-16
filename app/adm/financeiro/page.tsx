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

  logistic_status: "RECEBIDO" | "EM_SEPARACAO" | "ENTREGUE" | null;

  delivery_mode: "RETIRADA" | "FRETE" | null;
  freight_fee: number | null;

  credit_applied: number | null;

  due_date: string | null; // DATE => "YYYY-MM-DD"
};

type TotalsRow = {
  order_id: string;
  store_id: string;
  total_cost: number | null;
};

type OrderItemRow = {
  order_id: string;
  qty: number | null;
  unit_cost: number | null;
};

type CreditBalRow = {
  store_id: string;
  balance: number | null;
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

  created_at: string | null;

  mercadoria: number; // somente itens (sem frete)
  frete: number;
  total: number; // mercadoria + frete
  credit_applied: number;
  a_pagar: number; // total - crédito (>=0)

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

export default function AdmFinanceiroPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [rows, setRows] = useState<RowUi[]>([]);

  // ✅ Multi-seleção (compacta, harmoniosa)
  const [storeSelected, setStoreSelected] = useState<string[]>([]);
  const [storePopoverOpen, setStorePopoverOpen] = useState(false);
  const [storeSearch, setStoreSearch] = useState("");
  const popRef = useRef<HTMLDivElement | null>(null);

  // filtros
  const [paidFilter, setPaidFilter] = useState<string>("all"); // all | paid | unpaid
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deliveryFilter, setDeliveryFilter] = useState<string>("all"); // all | FRETE | RETIRADA
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // filtros extras
  const [payMethodFilter, setPayMethodFilter] = useState<string>("all"); // all | PIX | CARTAO | BOLETO
  const [dueFilter, setDueFilter] = useState<string>("all"); // all | due_soon | overdue | no_due
  const [dueFrom, setDueFrom] = useState<string>(""); // YYYY-MM-DD
  const [dueTo, setDueTo] = useState<string>(""); // YYYY-MM-DD

  // ✅ visualização: "compact" (cabe na página) vs "completa"
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

      const storeList = await loadStores();
      await loadFinance(storeList);

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fecha popover clicando fora
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
        "id,store_id,status,created_at,is_paid,paid_at,payment_method,logistic_status,delivery_mode,freight_fee,credit_applied,due_date"
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

    const ui: RowUi[] = orders.map((o) => {
      const frete = o.delivery_mode === "FRETE" ? Number(o.freight_fee ?? 0) : 0;

      const viewTotal = totalsMap.get(o.id) ?? 0;
      const itemsCalc = itemsCalcMap.get(o.id) ?? 0;

      let mercadoria = viewTotal;

      if (frete > 0 && itemsRaw) {
        if (near(viewTotal, itemsCalc + frete)) {
          mercadoria = Math.max(viewTotal - frete, 0);
        } else if (near(viewTotal, itemsCalc)) {
          mercadoria = viewTotal;
        } else {
          if (!near(itemsCalc, 0)) mercadoria = itemsCalc;
        }
      } else {
        if (itemsRaw && !near(viewTotal, itemsCalc)) mercadoria = itemsCalc;
      }

      const total = mercadoria + frete;
      const credit = Number(o.credit_applied ?? 0);
      const a_pagar = Math.max(total - credit, 0);

      const is_overdue = !!o.due_date && !o.is_paid && o.due_date < today;
      const is_due_soon = !!o.due_date && !o.is_paid && o.due_date >= today && o.due_date <= soonLimit;

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

        created_at: o.created_at,

        mercadoria,
        frete,
        total,
        credit_applied: credit,
        a_pagar,

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
    const totalApagar = rows.reduce((a, r) => a + r.a_pagar, 0);
    const totalPago = rows.reduce((a, r) => a + (r.is_paid ? r.a_pagar : 0), 0);
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

  // ✅ layout: compact cabe na tela (menos colunas)
  const columns = useMemo(() => {
    const baseCompact = [
      "Pedido",
      "Loja",
      "Operação",
      "Vencimento",
      "Forma",
      "Total",
      "A pagar",
      "Pago?",
    ];

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

      const dueCell = (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-800">{fmtYMDToBR(r.due_date)}</span>
          {dueBadge}
        </div>
      );

      const paidCell = <Badge tone={r.is_paid ? "green" : "red"}>{r.is_paid ? "Pago" : "Em aberto"}</Badge>;

      if (viewMode === "compact") {
        return [
          <span key="id" className="font-mono text-xs text-slate-700">{r.id}</span>,
          <span key="store" className="font-semibold text-slate-900">{r.store_name}</span>,
          <div key="op">{opCell}</div>,
          <div key="due">{dueCell}</div>,
          <span key="pm" className="text-slate-800">{payMethodLabel(r.payment_method)}</span>,
          <span key="tot" className="font-semibold text-slate-900">{money(r.total)}</span>,
          <span key="apg" className="font-semibold text-slate-900">{money(r.a_pagar)}</span>,
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
        <span key="apg" className="font-semibold text-slate-900">{money(r.a_pagar)}</span>,
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
            <Button variant="secondary" onClick={() => router.push("/adm/pedidos")}>
              Pedidos
            </Button>
            <Button variant="secondary" onClick={onApply} disabled={loading}>
              Recarregar
            </Button>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm text-red-600">{msg}</div>
        </Card>
      ) : null}

      <Card title="Filtros">
        <div className="grid gap-3 md:grid-cols-6">
          {/* Loja */}
          <div className="relative" ref={popRef}>
            <div className="text-xs font-semibold text-slate-600 mb-1">Loja</div>

            <Button
              variant="secondary"
              onClick={() => setStorePopoverOpen((v) => !v)}
              disabled={loading}
              className="w-full justify-between"
            >
              <span className="truncate">{storeButtonLabel()}</span>
              <span className="ml-2 text-slate-500">{storePopoverOpen ? "▲" : "▼"}</span>
            </Button>

            <div className="mt-2 flex flex-wrap gap-2">
              {storeSelected.length === 0 ? (
                <Badge tone="slate">Todas</Badge>
              ) : (
                <Badge tone="blue">{storeSelected.length} selecionada(s)</Badge>
              )}
            </div>

            {storePopoverOpen ? (
              <div className="absolute z-50 mt-2 w-[360px] max-w-[90vw] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">Selecionar lojas</div>
                  <Button variant="secondary" onClick={() => setStorePopoverOpen(false)}>
                    Fechar
                  </Button>
                </div>

                <div className="mt-3">
                  <Input value={storeSearch} onChange={setStoreSearch} placeholder="Buscar loja..." />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={clearStores} disabled={loading}>
                    Todas
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => selectOnlyVisible(storeFilteredList)}
                    disabled={loading || storeFilteredList.length === 0}
                    title="Seleciona todas as lojas que aparecem na busca"
                  >
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

                <div className="mt-3 text-xs text-slate-500">
                  Se nenhuma estiver marcada, considera <b>todas</b>.
                </div>
              </div>
            ) : null}
          </div>

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
            label="Forma"
            value={payMethodFilter}
            onChange={setPayMethodFilter}
            options={[
              { value: "all", label: "Todas" },
              { value: "PIX", label: "PIX" },
              { value: "CARTAO", label: "Cartão" },
              { value: "BOLETO", label: "Boleto" },
            ]}
          />

          <Select
            label="Vencimento"
            value={dueFilter}
            onChange={setDueFilter}
            options={[
              { value: "all", label: "Todos" },
              { value: "due_soon", label: "A vencer (próx. 3 dias)" },
              { value: "overdue", label: "Vencidos" },
              { value: "no_due", label: "Sem vencimento" },
            ]}
          />

          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1">De (criação)</div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1">Até (criação)</div>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1">De (venc.)</div>
            <input
              type="date"
              value={dueFrom}
              onChange={(e) => setDueFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1">Até (venc.)</div>
            <input
              type="date"
              value={dueTo}
              onChange={(e) => setDueTo(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="md:col-span-6 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Badge tone={resumo.qtdVencidos > 0 ? "red" : "slate"}>Vencidos: {resumo.qtdVencidos}</Badge>
              <Badge tone={resumo.qtdAVencer > 0 ? "yellow" : "slate"}>A vencer: {resumo.qtdAVencer}</Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* ✅ toggle compacto/completo (resolve seu scroll horizontal) */}
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

              <Button onClick={onApply} disabled={loading}>
                Aplicar filtros
              </Button>
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
            <div className="text-xs font-semibold text-slate-500">A pagar</div>
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
          <Table
            headers={columns}
            rows={tableRows}
            onRowClick={(idx) => router.push(`/adm/pedidos/${rows[idx].id}`)}
          />
        )}
      </Card>
    </div>
  );
}