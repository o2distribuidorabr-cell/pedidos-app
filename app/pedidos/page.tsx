"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import FranchiseeTopbar from "@/app/components/FranchiseeTopbar";

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

  // ✅ NOVO: quanto foi abatido do crédito pré-pago neste pedido
  credit_applied: number | null;
};

type TotalsRow = {
  order_id: string;
  store_id: string;
  total_cost: number | null;
};

type StoreRow = { id: string; name: string };

// ✅ view do saldo
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
    return iso;
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
  if (v === "FRETE") return "Frete";
  return "Retirada";
}

export default function HistoricoPedidosPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [userEmail, setUserEmail] = useState<string>("-");
  const [storeName, setStoreName] = useState<string>("-");
  const [storeId, setStoreId] = useState<string | null>(null);

  // ✅ saldo do crédito
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
      if (qq && !o.id.toLowerCase().includes(qq)) return false;
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (logFilter !== "all" && (o.logistic_status ?? "") !== logFilter) return false;

      if (paidFilter === "paid" && !o.is_paid) return false;
      if (paidFilter === "unpaid" && o.is_paid) return false;

      if (fromISO && (o.created_at ?? "") < fromISO) return false;
      if (toISO && (o.created_at ?? "") > toISO) return false;

      return true;
    });
  }, [orders, q, statusFilter, logFilter, paidFilter, dateFrom, dateTo]);

  const totalGeral = useMemo(() => {
    return filtered.reduce((acc, o) => acc + (Number(o.total_cost) || 0), 0);
  }, [filtered]);

  const totalCreditoAplicado = useMemo(() => {
    return filtered.reduce((acc, o) => acc + (Number(o.credit_applied ?? 0) || 0), 0);
  }, [filtered]);

  const totalAPagar = useMemo(() => {
    return filtered.reduce((acc, o) => acc + (Number(o.amount_due ?? 0) || 0), 0);
  }, [filtered]);

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

      const { data: store, error: sErr } = await supabase.from("stores").select("id, name").eq("id", sId).maybeSingle();

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
    const { data, error } = await supabase.from("v_store_credit_balance").select("store_id, balance").eq("store_id", sId).maybeSingle();

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
        "id, store_id, status, notes, created_at, submitted_at, approved_at, is_paid, paid_at, payment_method, logistic_status, delivery_mode, freight_fee, credit_applied"
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

    const { data: tots, error: tErr } = await supabase.from("v_order_totals").select("order_id, store_id, total_cost").in("order_id", ids);

    if (tErr) {
      setMsg(tErr.message);
      setOrders(
        orderList.map((o) => ({
          ...o,
          total_cost: 0,
          amount_due: 0,
        }))
      );
      return;
    }

    const totalsList = (tots ?? []) as TotalsRow[];
    const map = new Map<string, number>();
    for (const r of totalsList) map.set(r.order_id, Number(r.total_cost) || 0);

    const ui: OrderUi[] = orderList.map((o) => {
      const total = map.get(o.id) ?? 0;
      const applied = Number(o.credit_applied ?? 0) || 0;

      // ✅ Aqui mantém exatamente o que você já quer:
      // total = (itens + frete) vindo da view
      // devido = total - crédito
      const due = Math.max(total - applied, 0);

      return {
        ...o,
        total_cost: total,
        amount_due: due,
      };
    });

    setOrders(ui);
  }

  if (loading) {
    return (
      <main style={styles.main}>
        <FranchiseeTopbar />
        <div style={styles.card}>Carregando...</div>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <FranchiseeTopbar />

      <div style={styles.card}>
        {msg ? <div style={{ marginTop: 12, ...styles.err }}>{msg}</div> : null}

        <h1 style={{ margin: 0, fontSize: 22 }}>Histórico de pedidos</h1>
        <p style={{ marginTop: 6, color: "#555" }}>Aqui aparecem os pedidos já enviados. Clique em um pedido para ver os itens.</p>

        {/* ✅ Faixa de saldo (opcional, mas útil) */}
        <div style={styles.balanceBar}>
          <div>
            <div style={styles.smallMuted}>Saldo de crédito</div>
            <div style={styles.balanceValue}>{money(creditBalance)}</div>
          </div>

          <button
            style={styles.secondaryBtn}
            onClick={() => storeId && Promise.all([loadCreditBalance(storeId), loadOrders(storeId)])}
          >
            Recarregar
          </button>
        </div>

        {/* Filtros */}
        <div style={styles.filters}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por ID do pedido..." style={styles.input} />

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={styles.select}>
            <option value="all">Status: todos</option>
            <option value="draft">draft</option>
            <option value="submitted">submitted</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
          </select>

          <select value={logFilter} onChange={(e) => setLogFilter(e.target.value)} style={styles.select}>
            <option value="all">Logística: todos</option>
            <option value="RECEBIDO">RECEBIDO</option>
            <option value="EM_SEPARACAO">EM_SEPARACAO</option>
            <option value="ENTREGUE">ENTREGUE</option>
          </select>

          <select value={paidFilter} onChange={(e) => setPaidFilter(e.target.value)} style={styles.select}>
            <option value="all">Pago: todos</option>
            <option value="paid">Somente pagos</option>
            <option value="unpaid">Somente não pagos</option>
          </select>

          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={styles.select} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={styles.select} />
        </div>

        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Pedido</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Operação</th>
                <th style={styles.th}>Entrega</th>
                <th style={styles.th}>Frete</th>
                <th style={styles.th}>Criado</th>
                <th style={styles.th}>Enviado</th>
                <th style={styles.th}>Aprovado</th>
                <th style={styles.th}>Total</th>
                <th style={styles.th}>Crédito aplicado</th>
                <th style={styles.th}>A pagar</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((o) => (
                <tr key={o.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/pedidos/${o.id}`)} title="Abrir pedido">
                  <td style={styles.tdMono}>{o.id}</td>
                  <td style={styles.td}>{o.status}</td>

                  <td style={styles.td}>
                    <span style={styles.pill}>{logisticLabel(o.logistic_status)}</span>
                  </td>

                  <td style={styles.td}>{deliveryLabel(o.delivery_mode)}</td>
                  <td style={styles.td}>{o.delivery_mode === "FRETE" ? money(Number(o.freight_fee ?? 0)) : "-"}</td>

                  <td style={styles.td}>{fmtBR(o.created_at)}</td>
                  <td style={styles.td}>{fmtBR(o.submitted_at)}</td>
                  <td style={styles.td}>{fmtBR(o.approved_at)}</td>

                  <td style={styles.tdStrong}>{money(Number(o.total_cost) || 0)}</td>
                  <td style={styles.tdStrong}>{money(Number(o.credit_applied ?? 0) || 0)}</td>
                  <td style={styles.tdStrong}>{money(Number(o.amount_due ?? 0) || 0)}</td>
                </tr>
              ))}

              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: 14, color: "#777" }}>
                    Nenhum pedido encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div style={styles.totalBox}>
          <span>Total exibido</span>
          <b>{money(totalGeral)}</b>
        </div>

        <div style={styles.totalBox}>
          <span>Crédito aplicado (exibido)</span>
          <b>{money(totalCreditoAplicado)}</b>
        </div>

        <div style={styles.totalBoxStrong}>
          <span>A pagar (exibido)</span>
          <b>{money(totalAPagar)}</b>
        </div>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight: "100vh", background: "#f6f7fb", padding: 16 },
  card: {
    background: "#fff",
    border: "1px solid #e6e7ee",
    borderRadius: 14,
    padding: 14,
    boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
    width: "min(1200px, 100%)",
    margin: "0 auto",
  },

  smallMuted: { fontSize: 12, color: "#777", fontWeight: 700 },

  balanceBar: {
    marginTop: 12,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    background: "white",
  },
  balanceValue: { marginTop: 6, fontSize: 16, fontWeight: 900, color: "#111" },

  filters: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
    alignItems: "center",
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    background: "white",
    marginTop: 10,
  },

  input: { padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", outline: "none" },
  select: { padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "white", fontWeight: 800 },

  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0 },
  th: {
    textAlign: "left",
    padding: "10px 10px",
    fontSize: 12,
    color: "#555",
    borderBottom: "1px solid #eee",
    background: "#fafbff",
    whiteSpace: "nowrap",
  },
  td: { padding: "10px 10px", borderBottom: "1px solid #f1f1f6", whiteSpace: "nowrap" },
  tdStrong: { padding: "10px 10px", borderBottom: "1px solid #f1f1f6", fontWeight: 900, whiteSpace: "nowrap" },
  tdMono: {
    padding: "10px 10px",
    borderBottom: "1px solid #f1f1f6",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 13,
    whiteSpace: "nowrap",
  },

  pill: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #e6e7ee",
    background: "#fff",
    fontSize: 12,
    fontWeight: 900,
    color: "#111",
  },

  secondaryBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 900,
  },

  totalBox: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #eee",
    background: "#fff",
    fontSize: 14,
  },
  totalBoxStrong: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "#fafbff",
    fontSize: 14,
    fontWeight: 900,
  },

  err: {
    padding: 10,
    background: "#fff2f2",
    border: "1px solid #ffd0d0",
    borderRadius: 10,
    color: "#a40000",
    fontSize: 13,
  },
};