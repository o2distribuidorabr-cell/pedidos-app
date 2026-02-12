"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ProfileRow = {
  id: string;
  store_id: string | null;
};

type StoreRow = { id: string; name: string | null };

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
};

type TotalsRow = {
  order_id: string;
  store_id: string;
  total_cost: number | null; // itens
};

type RowUi = {
  id: string;
  status: string;
  logistic_status: OrderRow["logistic_status"];
  delivery_mode: OrderRow["delivery_mode"];
  freight_fee: number;

  created_at: string | null;
  submitted_at: string | null;

  itens: number;
  bruto: number;
  credit_applied: number;
  liquido: number;

  is_paid: boolean;
  paid_at: string | null;
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

function toISOStart(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0).toISOString();
}
function toISOEnd(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).toISOString();
}

export default function FinanceiroFranqueadoPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [userEmail, setUserEmail] = useState<string>("-");
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string>("-");

  const [rows, setRows] = useState<RowUi[]>([]);

  // filtros simples
  const [paidFilter, setPaidFilter] = useState<string>("all"); // all | paid | unpaid
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

      setUserEmail(user.email ?? "-");

      // 1) pega store_id do profile
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

      const sId = (profile as ProfileRow | null)?.store_id ?? null;
      setStoreId(sId);

      if (!sId) {
        setStoreName("Sem loja vinculada");
        setRows([]);
        setLoading(false);
        return;
      }

      // 2) nome da loja
      const { data: store, error: sErr } = await supabase.from("stores").select("id,name").eq("id", sId).maybeSingle();
      if (sErr) {
        setMsg(sErr.message);
        setStoreName("-");
      } else {
        const st = store as StoreRow | null;
        setStoreName(st?.name ?? "-");
      }

      // 3) carrega financeiro
      await loadFinance(sId);

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFinance(sId: string) {
    setMsg("");

    let q = supabase
      .from("orders")
      .select(
        "id,store_id,status,notes,created_at,submitted_at,approved_at,is_paid,paid_at,payment_method,logistic_status,delivery_mode,freight_fee,credit_applied"
      )
      .eq("store_id", sId)
      .order("created_at", { ascending: false });

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

    const ids = orders.map((o) => o.id);

    const { data: tots, error: tErr } = await supabase
      .from("v_order_totals")
      .select("order_id,store_id,total_cost")
      .in("order_id", ids);

    if (tErr) {
      setMsg(tErr.message);
    }

    const totalsMap = new Map<string, number>();
    for (const r of (tots ?? []) as TotalsRow[]) totalsMap.set(r.order_id, Number(r.total_cost) || 0);

    const ui: RowUi[] = orders.map((o) => {
      const itens = totalsMap.get(o.id) ?? 0;
      const frete = o.delivery_mode === "FRETE" ? Number(o.freight_fee ?? 0) : 0;
      const bruto = itens + frete;

      const credit = Number(o.credit_applied ?? 0);
      const liquido = Math.max(bruto - credit, 0);

      return {
        id: o.id,
        status: o.status,
        logistic_status: o.logistic_status,
        delivery_mode: o.delivery_mode,
        freight_fee: frete,

        created_at: o.created_at,
        submitted_at: o.submitted_at,

        itens,
        bruto,
        credit_applied: credit,
        liquido,

        is_paid: !!o.is_paid,
        paid_at: o.paid_at,
      };
    });

    setRows(ui);
  }

  async function onReload() {
    if (!storeId) return;
    setLoading(true);
    await loadFinance(storeId);
    setLoading(false);
  }

  const resumo = useMemo(() => {
    const totalBruto = rows.reduce((a, r) => a + r.bruto, 0);
    const totalCredito = rows.reduce((a, r) => a + r.credit_applied, 0);
    const totalLiquido = rows.reduce((a, r) => a + r.liquido, 0);
    const totalPago = rows.reduce((a, r) => a + (r.is_paid ? r.liquido : 0), 0);
    const totalAberto = totalLiquido - totalPago;
    return { totalBruto, totalCredito, totalLiquido, totalPago, totalAberto };
  }, [rows]);

  async function onLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <main style={styles.main}>
        <div style={styles.card}>Carregando...</div>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.topbar}>
          <div>
            <div style={styles.smallMuted}>Usuário</div>
            <div style={styles.topValue}>{userEmail}</div>
          </div>

          <div>
            <div style={styles.smallMuted}>Loja</div>
            <div style={styles.topValue}>{storeName}</div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={styles.secondaryBtn} onClick={() => router.push("/pedidos")}>
              ← Pedidos
            </button>
            <button style={styles.secondaryBtn} onClick={onReload}>
              Recarregar
            </button>
            <button style={styles.logoutBtn} onClick={onLogout}>
              Sair
            </button>
          </div>
        </div>

        <hr style={styles.hr} />

        <h1 style={{ margin: 0, fontSize: 22 }}>Financeiro</h1>
        <p style={{ marginTop: 6, color: "#555" }}>
          Visão de valores do seu período: total bruto, crédito aplicado e total líquido (a pagar).
        </p>

        {msg ? <div style={{ marginTop: 12, ...styles.err }}>{msg}</div> : null}

        {/* filtros */}
        <div style={styles.filters}>
          <select value={paidFilter} onChange={(e) => setPaidFilter(e.target.value)} style={styles.select}>
            <option value="all">Pagamento: todos</option>
            <option value="paid">Somente pagos</option>
            <option value="unpaid">Somente não pagos</option>
          </select>

          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={styles.select} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={styles.select} />

          <button style={styles.primaryBtn} onClick={onReload}>
            Aplicar filtros
          </button>
        </div>

        {/* resumo */}
        <div style={styles.summaryRow}>
          <div style={styles.sumBox}>
            <div style={styles.sumLabel}>Total bruto</div>
            <div style={styles.sumValue}>{money(resumo.totalBruto)}</div>
          </div>
          <div style={styles.sumBox}>
            <div style={styles.sumLabel}>Crédito aplicado</div>
            <div style={styles.sumValue}>- {money(resumo.totalCredito)}</div>
          </div>
          <div style={styles.sumBoxStrong}>
            <div style={styles.sumLabel}>Total líquido</div>
            <div style={styles.sumValueStrong}>{money(resumo.totalLiquido)}</div>
          </div>
          <div style={styles.sumBox}>
            <div style={styles.sumLabel}>Pago</div>
            <div style={styles.sumValue}>{money(resumo.totalPago)}</div>
          </div>
          <div style={styles.sumBox}>
            <div style={styles.sumLabel}>Em aberto</div>
            <div style={styles.sumValue}>{money(resumo.totalAberto)}</div>
          </div>
        </div>

        {/* tabela */}
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Pedido</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Operação</th>
                <th style={styles.th}>Entrega</th>
                <th style={styles.th}>Bruto</th>
                <th style={styles.th}>Crédito</th>
                <th style={styles.th}>Líquido</th>
                <th style={styles.th}>Pago?</th>
                <th style={styles.th}>Data pgto</th>
                <th style={styles.th}>Criado</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/pedidos/${r.id}`)} title="Abrir pedido">
                  <td style={styles.tdMono}>{r.id}</td>
                  <td style={styles.td}>{r.status}</td>
                  <td style={styles.td}>
                    <span style={styles.pill}>{logisticLabel(r.logistic_status)}</span>
                  </td>
                  <td style={styles.td}>{deliveryLabel(r.delivery_mode)}</td>
                  <td style={styles.tdStrong}>{money(r.bruto)}</td>
                  <td style={styles.td}>- {money(r.credit_applied)}</td>
                  <td style={styles.tdStrong}>{money(r.liquido)}</td>
                  <td style={styles.td}>{r.is_paid ? "Sim" : "Não"}</td>
                  <td style={styles.td}>{fmtBR(r.paid_at)}</td>
                  <td style={styles.td}>{fmtBR(r.created_at)}</td>
                </tr>
              ))}

              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: 14, color: "#777" }}>
                    Nenhum dado encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
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

  topbar: { display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" },
  smallMuted: { fontSize: 12, color: "#777", fontWeight: 700 },
  topValue: { fontSize: 14, fontWeight: 800, color: "#111" },
  logoutBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
  },
  hr: { border: 0, borderTop: "1px solid #eee", margin: "12px 0" },

  filters: {
    marginTop: 10,
    display: "grid",
    gridTemplateColumns: "180px 180px 180px 180px",
    gap: 10,
    alignItems: "center",
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    background: "white",
  },

  select: { padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", background: "white", fontWeight: 800 },

  primaryBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 900,
  },

  secondaryBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
  },

  summaryRow: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
  },
  sumBox: { border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" },
  sumBoxStrong: { border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "#fff" },
  sumLabel: { fontSize: 12, color: "#666", fontWeight: 900 },
  sumValue: { marginTop: 6, fontSize: 16, fontWeight: 900 },
  sumValueStrong: { marginTop: 6, fontSize: 18, fontWeight: 1000 as any },

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

  err: {
    padding: 10,
    background: "#fff2f2",
    border: "1px solid #ffd0d0",
    borderRadius: 10,
    color: "#a40000",
    fontSize: 13,
  },
};