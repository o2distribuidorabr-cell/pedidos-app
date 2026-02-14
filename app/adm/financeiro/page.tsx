"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import {
  PageHeader,
  Card,
  Button,
  Select,
  Badge,
  Table,
} from "@/app/components/ui";

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

export default function AdmFinanceiroPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [rows, setRows] = useState<RowUi[]>([]);

  // filtros
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [paidFilter, setPaidFilter] = useState<string>("all"); // all | paid | unpaid
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deliveryFilter, setDeliveryFilter] = useState<string>("all"); // all | FRETE | RETIRADA
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

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

  async function loadStores(): Promise<StoreRow[]> {
    const { data, error } = await supabase
      .from("stores")
      .select("id,name")
      .order("name", { ascending: true });

    if (error) {
      console.warn("loadStores:", error.message);
      setStores([]);
      return [];
    }

    const list = (data ?? []) as StoreRow[];
    setStores(list);
    return list;
  }

  async function loadFinance(storeList: StoreRow[]) {
    setMsg("");

    let q = supabase
      .from("orders")
      .select(
        "id,store_id,status,created_at,is_paid,paid_at,payment_method,logistic_status,delivery_mode,freight_fee,credit_applied"
      )
      .order("created_at", { ascending: false });

    if (storeFilter !== "all") q = q.eq("store_id", storeFilter);
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

      return {
        id: o.id,
        store_id: o.store_id,
        store_name: storeMap.get(o.store_id) ?? o.store_id,

        status: o.status,
        logistic_status: o.logistic_status,
        delivery_mode: o.delivery_mode,

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

    return { totalMercadoria, totalFrete, totalTotal, totalCredito, totalApagar, totalPago, totalAberto };
  }, [rows]);

  const tableRows = useMemo(() => {
    return rows.map((r) => {
      return [
        <span key="id" className="font-mono text-xs text-slate-700">{r.id}</span>,
        <span key="store" className="font-semibold text-slate-900">{r.store_name}</span>,
        <div key="op" className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(r.status)}>{r.status}</Badge>
          <Badge tone="slate">{logisticLabel(r.logistic_status)}</Badge>
        </div>,
        <span key="del" className="text-slate-800">{deliveryLabel(r.delivery_mode)}</span>,
        <span key="merc" className="font-semibold text-slate-900">{money(r.mercadoria)}</span>,
        <span key="frete" className="text-slate-800">{r.delivery_mode === "FRETE" ? money(r.frete) : "—"}</span>,
        <span key="tot" className="font-semibold text-slate-900">{money(r.total)}</span>,
        <span key="cred" className="text-slate-800">- {money(r.credit_applied)}</span>,
        <span key="apg" className="font-semibold text-slate-900">{money(r.a_pagar)}</span>,
        <Badge key="paid" tone={r.is_paid ? "green" : "red"}>{r.is_paid ? "Pago" : "Em aberto"}</Badge>,
        <span key="dt" className="text-slate-700">{fmtBR(r.paid_at)}</span>,
        <span key="cb" className="font-semibold text-slate-900">{money(r.credit_balance)}</span>,
      ];
    });
  }, [rows]);

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
          <Select
            label="Loja"
            value={storeFilter}
            onChange={setStoreFilter}
            options={[
              { value: "all", label: "Todas" },
              ...stores.map((s) => ({ value: s.id, label: s.name ?? s.id })),
            ]}
          />

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

          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1">De</div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1">Até</div>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="md:col-span-6 flex justify-end">
            <Button onClick={onApply} disabled={loading}>
              Aplicar filtros
            </Button>
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

      <Card title="Pedidos no financeiro" subtitle={`${rows.length} registro(s)`}>
        {loading ? (
          <div>Carregando...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-600">Nenhum dado encontrado.</div>
        ) : (
          <Table
            headers={[
              "Pedido",
              "Loja",
              "Operação",
              "Entrega",
              "Mercadoria",
              "Frete",
              "Total",
              "Crédito",
              "A pagar",
              "Pago?",
              "Data pagamento",
              "Saldo crédito",
            ]}
            rows={tableRows}
            onRowClick={(idx) => router.push(`/adm/pedidos/${rows[idx].id}`)}
          />
        )}
      </Card>
    </div>
  );
}