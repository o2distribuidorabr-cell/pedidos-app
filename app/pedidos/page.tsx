"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import PortalShell from "@/app/components/PortalShell";
import { PageHeader, Card, Button, Input, Select, Badge } from "@/app/components/ui";

type OrderRow = {
  id: string;
  store_id: string;
  status: string;
  notes: string | null;
  created_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;

  is_paid: boolean | null;
  paid_at: string | null;
  payment_method: "PIX" | "CARTAO" | "BOLETO" | null;

  logistic_status: "RECEBIDO" | "EM_SEPARACAO" | "ENTREGUE" | null;

  delivery_mode: "RETIRADA" | "FRETE" | null;
  freight_fee: number | null;

  credit_applied: number | null;

  // ✅ novos campos refletidos
  due_date: string | null; // DATE => "YYYY-MM-DD"
  edited_by_admin: boolean | null;
  edited_at: string | null;
};

type TotalsRow = {
  order_id: string;
  store_id: string;
  total_cost: number | null;
};

type StoreRow = { id: string; name: string };

type CreditBalanceRow = {
  store_id: string;
  balance: number | null;
};

type OrderUi = OrderRow & { total_cost: number; amount_due: number };

function fmtBR(iso: string | null | undefined) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return String(iso);
  }
}

function money(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

function statusTone(status: string): "green" | "red" | "yellow" | "neutral" {
  const s = (status || "").toLowerCase();
  if (s === "approved") return "green";
  if (s === "rejected") return "red";
  if (s === "submitted") return "yellow";
  return "neutral";
}

function logisticTone(v: OrderRow["logistic_status"]): "green" | "yellow" | "neutral" {
  if (v === "ENTREGUE") return "green";
  if (v === "EM_SEPARACAO") return "yellow";
  return "neutral";
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dueTone(due: string | null): "green" | "red" | "neutral" {
  if (!due) return "neutral";
  return due < todayYMD() ? "red" : "green";
}

function dueLabel(due: string | null) {
  if (!due) return "Sem venc.";
  return due;
}

export default function HistoricoPedidosPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState("");

  const [userEmail, setUserEmail] = useState<string>("-");
  const [storeName, setStoreName] = useState<string>("-");
  const [storeId, setStoreId] = useState<string | null>(null);

  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [orders, setOrders] = useState<OrderUi[]>([]);

  // filtros
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [logFilter, setLogFilter] = useState<string>("all");
  const [paidFilter, setPaidFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  function toISOStart(dateStr: string) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d, 0, 0, 0).toISOString();
  }
  function toISOEnd(dateStr: string) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d, 23, 59, 59).toISOString();
  }

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const fromISO = dateFrom ? toISOStart(dateFrom) : null;
    const toISO = dateTo ? toISOEnd(dateTo) : null;

    return orders.filter((o) => {
      if (qq && !String(o.id).toLowerCase().includes(qq)) return false;
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (logFilter !== "all" && (o.logistic_status ?? "") !== logFilter) return false;

      if (paidFilter === "paid" && !o.is_paid) return false;
      if (paidFilter === "unpaid" && o.is_paid) return false;

      if (fromISO && (o.created_at ?? "") < fromISO) return false;
      if (toISO && (o.created_at ?? "") > toISO) return false;

      return true;
    });
  }, [orders, q, statusFilter, logFilter, paidFilter, dateFrom, dateTo]);

  const totalGeral = useMemo(() => filtered.reduce((acc, o) => acc + (Number(o.total_cost) || 0), 0), [filtered]);
  const totalCreditoAplicado = useMemo(
    () => filtered.reduce((acc, o) => acc + (Number(o.credit_applied ?? 0) || 0), 0),
    [filtered]
  );
  const totalAPagar = useMemo(() => filtered.reduce((acc, o) => acc + (Number(o.amount_due ?? 0) || 0), 0), [filtered]);

  useEffect(() => {
    (async () => {
      setMsg("");
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;

      if (!user) {
        router.push("/login");
        return;
      }

      setUserEmail(user.email ?? "-");

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
        setStoreName("Sem loja vinculada");
        setLoading(false);
        return;
      }

      const { data: store, error: sErr } = await supabase
        .from("stores")
        .select("id, name")
        .eq("id", sId)
        .maybeSingle();

      if (sErr) {
        setMsg(sErr.message);
        setLoading(false);
        return;
      }

      const st = (store ?? null) as StoreRow | null;
      setStoreName(st?.name ?? "-");

      await Promise.all([loadCreditBalance(sId), loadOrders(sId)]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCreditBalance(sId: string) {
    const { data, error } = await supabase
      .from("v_store_credit_balance")
      .select("store_id, balance")
      .eq("store_id", sId)
      .maybeSingle();

    if (error) {
      setMsg((m) => (m ? m : error.message));
      setCreditBalance(0);
      return;
    }

    const row = (data ?? null) as CreditBalanceRow | null;
    setCreditBalance(Number(row?.balance ?? 0) || 0);
  }

  async function loadOrders(sId: string) {
    setMsg("");

    const { data: ords, error: oErr } = await supabase
      .from("orders")
      .select(
        "id, store_id, status, notes, created_at, submitted_at, approved_at, is_paid, paid_at, payment_method, logistic_status, delivery_mode, freight_fee, credit_applied, due_date, edited_by_admin, edited_at"
      )
      .eq("store_id", sId)
      .order("created_at", { ascending: false });

    if (oErr) {
      setMsg(oErr.message);
      setOrders([]);
      return;
    }

    const orderList = (ords ?? []) as OrderRow[];
    if (orderList.length === 0) {
      setOrders([]);
      return;
    }

    const ids = orderList.map((o) => o.id);

    const { data: tots, error: tErr } = await supabase
      .from("v_order_totals")
      .select("order_id, store_id, total_cost")
      .in("order_id", ids);

    // Se der erro na view, ainda mostra pedidos (sem total)
    if (tErr) {
      setMsg(tErr.message);
      setOrders(orderList.map((o) => ({ ...o, total_cost: 0, amount_due: 0 })));
      return;
    }

    const totalsList = (tots ?? []) as TotalsRow[];
    const map = new Map<string, number>();
    for (const r of totalsList) map.set(r.order_id, Number(r.total_cost) || 0);

    const ui: OrderUi[] = orderList.map((o) => {
      const total = map.get(o.id) ?? 0;
      const applied = Number(o.credit_applied ?? 0) || 0;
      const due = Math.max(total - applied, 0);
      return { ...o, total_cost: total, amount_due: due };
    });

    setOrders(ui);
  }

  async function refresh() {
    if (!storeId) return;
    setWorking(true);
    await Promise.all([loadCreditBalance(storeId), loadOrders(storeId)]);
    setWorking(false);
  }

  return (
    <PortalShell title="Pedidos" subtitle="Histórico de pedidos">
      <div className="space-y-4">
        <PageHeader
          title="Histórico de pedidos"
          subtitle="Clique em um pedido para ver os itens."
          right={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={refresh} disabled={working || loading || !storeId}>
                {working ? "Atualizando..." : "Atualizar"}
              </Button>
              <Button onClick={() => router.push("/pedido")}>Novo pedido</Button>
            </div>
          }
        />

        {msg ? (
          <Card title="Aviso">
            <div className="text-sm text-red-600 whitespace-pre-wrap">{msg}</div>
          </Card>
        ) : null}

        {/* Contexto */}
        <Card title="Resumo" subtitle="Loja / usuário / crédito">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <div className="text-xs font-semibold text-slate-500">Loja</div>
              <div className="mt-1 text-sm font-semibold text-slate-900 truncate">{storeName}</div>
              {storeId ? <div className="mt-1 font-mono text-xs text-slate-500 truncate">{storeId}</div> : null}
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-500">Usuário</div>
              <div className="mt-1 text-sm font-semibold text-slate-900 truncate">{userEmail}</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-600">Saldo de crédito</div>
              <div className="mt-1 text-base font-semibold text-slate-900">{money(creditBalance)}</div>
            </div>
          </div>
        </Card>

        {/* Filtros */}
        <Card title="Filtros">
          <div className="grid gap-3 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <Input value={q} onChange={setQ} placeholder="Buscar por ID do pedido..." />
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
              label="Logística"
              value={logFilter}
              onChange={setLogFilter}
              options={[
                { value: "all", label: "Todos" },
                { value: "RECEBIDO", label: "RECEBIDO" },
                { value: "EM_SEPARACAO", label: "EM_SEPARACAO" },
                { value: "ENTREGUE", label: "ENTREGUE" },
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

            <div className="grid gap-1">
              <div className="text-xs font-semibold text-slate-600">De</div>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="grid gap-1">
              <div className="text-xs font-semibold text-slate-600">Até</div>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="lg:col-span-6 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setQ("");
                  setStatusFilter("all");
                  setLogFilter("all");
                  setPaidFilter("all");
                  setDateFrom("");
                  setDateTo("");
                }}
              >
                Limpar filtros
              </Button>
              <Button variant="secondary" onClick={refresh} disabled={working || loading || !storeId}>
                Recarregar
              </Button>
            </div>
          </div>
        </Card>

        {/* Lista */}
        <Card title="Pedidos" subtitle={loading ? "Carregando..." : `${filtered.length} pedido(s) no filtro`}>
          {loading ? (
            <div className="text-sm text-slate-600">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-slate-600">Nenhum pedido encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0">
                <thead>
                  <tr className="text-left text-xs text-slate-600">
                    <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">Pedido</th>
                    <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">Status</th>
                    <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">Operação</th>
                    <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">Entrega</th>
                    <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">Frete</th>
                    <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">Vencimento</th>
                    <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">Criado</th>
                    <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">Enviado</th>
                    <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">Aprovado</th>
                    <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-right">Total</th>
                    <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-right">Crédito</th>
                    <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-right">A pagar</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((o) => {
                    const freteTxt = o.delivery_mode === "FRETE" ? money(Number(o.freight_fee ?? 0)) : "-";
                    const isEdited = !!o.edited_by_admin;

                    return (
                      <tr
                        key={o.id}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => router.push(`/pedidos/${o.id}`)}
                        title="Abrir pedido"
                      >
                        <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="font-mono text-xs text-slate-600">{o.id}</div>
                            {isEdited ? <Badge tone="blue">EDITADO</Badge> : null}
                          </div>
                          {isEdited && o.edited_at ? (
                            <div className="mt-1 text-[11px] text-slate-500">em {fmtBR(o.edited_at)}</div>
                          ) : null}
                        </td>

                        <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3">
                          <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                        </td>

                        <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3">
                          <Badge tone={logisticTone(o.logistic_status)}>{logisticLabel(o.logistic_status)}</Badge>
                        </td>

                        <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-sm text-slate-700">
                          {deliveryLabel(o.delivery_mode)}
                        </td>

                        <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-sm text-slate-700">
                          {freteTxt}
                        </td>

                        <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3">
                          <div className="flex items-center gap-2">
                            <Badge tone={dueTone(o.due_date)}>{dueLabel(o.due_date)}</Badge>
                            {o.due_date ? (o.due_date < todayYMD() ? <Badge tone="red">Vencido</Badge> : <Badge tone="green">OK</Badge>) : null}
                          </div>
                        </td>

                        <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-sm text-slate-700">
                          {fmtBR(o.created_at)}
                        </td>

                        <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-sm text-slate-700">
                          {fmtBR(o.submitted_at)}
                        </td>

                        <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-sm text-slate-700">
                          {fmtBR(o.approved_at)}
                        </td>

                        <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-right font-semibold text-slate-900">
                          {money(Number(o.total_cost) || 0)}
                        </td>

                        <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-right font-semibold text-slate-900">
                          {money(Number(o.credit_applied ?? 0) || 0)}
                        </td>

                        <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-right font-semibold text-slate-900">
                          {money(Number(o.amount_due ?? 0) || 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mt-3 text-xs text-slate-500">Clique em um pedido para abrir os itens.</div>
            </div>
          )}
        </Card>

        {/* Totais */}
        <div className="grid gap-3 md:grid-cols-3">
          <Card title="Total exibido">
            <div className="text-lg font-semibold text-slate-900">{money(totalGeral)}</div>
          </Card>

          <Card title="Crédito aplicado (exibido)">
            <div className="text-lg font-semibold text-slate-900">{money(totalCreditoAplicado)}</div>
          </Card>

          <Card title="A pagar (exibido)">
            <div className="text-lg font-semibold text-slate-900">{money(totalAPagar)}</div>
          </Card>
        </div>
      </div>
    </PortalShell>
  );
}