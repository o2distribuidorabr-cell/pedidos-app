"use client";

import { useEffect, useMemo, useState } from "react";
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

  status: string;
  logistic_status: OrderRow["logistic_status"];
  delivery_mode: OrderRow["delivery_mode"];
  created_at: string | null;

  mercadoria: number;
  frete: number;
  total: number;
  credit_applied: number;
  a_pagar: number;

  is_paid: boolean;
  paid_at: string | null;
  payment_method: OrderRow["payment_method"];

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

export default function FinanceiroFranqueadoPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [storeId, setStoreId] = useState<string | null>(null);
  const [rows, setRows] = useState<RowUi[]>([]);
  const [creditBalance, setCreditBalance] = useState<number>(0);

  // filtros
  const [paidFilter, setPaidFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deliveryFilter, setDeliveryFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

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

      const { data: profile, error: pErr } = await supabase.from("profiles").select("store_id").eq("id", user.id).maybeSingle();
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

      await loadFinanceForStore(sId);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCreditBalance(sId: string): Promise<number> {
    const { data, error } = await supabase.from("v_store_credit_balance").select("store_id,balance").eq("store_id", sId).maybeSingle();

    if (error) {
      console.warn("credit balance:", error.message);
      setCreditBalance(0);
      return 0;
    }

    const b = Number((data as CreditBalRow | null)?.balance ?? 0) || 0;
    setCreditBalance(b);
    return b;
  }

  async function loadFinanceForStore(sId: string) {
    setMsg("");

    let q = supabase
      .from("orders")
      .select("id,store_id,status,created_at,is_paid,paid_at,payment_method,logistic_status,delivery_mode,freight_fee,credit_applied")
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

    const bal = await loadCreditBalance(sId);

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

        is_paid: !!o.is_paid,
        paid_at: o.paid_at,
        payment_method: o.payment_method,

        credit_balance: bal,
      };
    });

    setRows(ui);
  }

  async function onReload() {
    if (!storeId) return;
    setLoading(true);
    await loadFinanceForStore(storeId);
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

  const headers = ["Pedido", "Status", "Operação", "Entrega", "Mercadoria", "Frete", "Total", "Crédito", "A pagar", "Pago?", "Data pgto", "Saldo crédito"];

  const tableRows = rows.map((r) => [
    <span key="id" className="font-mono text-xs">{r.id}</span>,
    <Badge key="st" tone={statusTone(r.status) as any}>{r.status}</Badge>,
    <span key="op">{logisticLabel(r.logistic_status)}</span>,
    <span key="del">{deliveryLabel(r.delivery_mode)}</span>,
    <span key="m" className="font-semibold">{money(r.mercadoria)}</span>,
    <span key="f">{r.delivery_mode === "FRETE" ? money(r.frete) : "-"}</span>,
    <span key="t" className="font-semibold">{money(r.total)}</span>,
    <span key="c">- {money(r.credit_applied)}</span>,
    <span key="ap" className="font-semibold">{money(r.a_pagar)}</span>,
    <span key="p">{r.is_paid ? "Sim" : "Não"}</span>,
    <span key="dt">{fmtBR(r.paid_at)}</span>,
    <span key="bal" className="font-semibold">{money(r.credit_balance)}</span>,
  ]);

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
        <Card
          title="Filtros"
          right={<Button variant="secondary" onClick={onReload}>Recarregar</Button>}
        >
          {msg ? (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
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

            <Input label="De" type="date" value={dateFrom} onChange={setDateFrom} />
            <Input label="Até" type="date" value={dateTo} onChange={setDateTo} />
          </div>

          <div className="mt-4">
            <Button onClick={onReload}>Aplicar filtros</Button>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Mercadoria" value={money(resumo.totalMercadoria)} />
          <StatCard label="Frete" value={money(resumo.totalFrete)} />
          <StatCard label="Total" value={money(resumo.totalTotal)} />
          <StatCard label="Crédito abatido" value={`- ${money(resumo.totalCredito)}`} />
          <StatCard label="A pagar" value={money(resumo.totalApagar)} />
          <StatCard label="Pago" value={money(resumo.totalPago)} />
          <StatCard label="Em aberto" value={money(resumo.totalAberto)} />
          <StatCard label="Saldo de crédito" value={money(creditBalance)} />
        </div>

        <Card
          title="Pedidos"
          subtitle="Clique em uma linha para abrir o pedido"
          right={<Button variant="secondary" onClick={onReload}>Atualizar</Button>}
        >
          <div
            className="cursor-pointer"
            onClickCapture={(e) => {
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
                      // envolvemos cada célula em <div> simples, e marcamos o row com data-order-id
                      return row.map((cell, cidx) => (
                        <div key={`${r.id}-${cidx}`} data-order-id={r.id}>
                          {cell}
                        </div>
                      ));
                    })
              }
            />
          </div>

          {rows.length === 0 ? (
            <div className="mt-3 text-sm text-slate-500">Nenhum dado encontrado.</div>
          ) : null}
        </Card>
      </div>
    </PortalShell>
  );
}