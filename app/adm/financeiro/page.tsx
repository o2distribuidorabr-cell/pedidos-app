"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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

  // valores
  mercadoria: number; // somente itens (sem frete)
  frete: number;
  total: number; // mercadoria + frete
  credit_applied: number;
  a_pagar: number; // total - crédito (>=0)

  // saldo crédito (da loja)
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

    // 1) Carrega pedidos
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

    // 2) Totais (view)
    const { data: tots, error: tErr } = await supabase
      .from("v_order_totals")
      .select("order_id,store_id,total_cost")
      .in("order_id", orderIds);

    if (tErr) {
      setMsg(tErr.message);
    }

    const totalsMap = new Map<string, number>();
    for (const r of (tots ?? []) as TotalsRow[]) totalsMap.set(r.order_id, Number(r.total_cost) || 0);

    // 3) Soma REAL dos itens (para detectar view incluindo frete)
    const { data: itemsRaw, error: iErr } = await supabase
      .from("order_items")
      .select("order_id,qty,unit_cost")
      .in("order_id", orderIds);

    if (iErr) {
      // se der erro aqui, a tela ainda funciona, só perde a “detecção anti-frete-duplicado”
      console.warn("order_items calc:", iErr.message);
    }

    const itemsCalcMap = new Map<string, number>();
    for (const r of (itemsRaw ?? []) as OrderItemRow[]) {
      const cur = itemsCalcMap.get(r.order_id) ?? 0;
      const line = (Number(r.qty) || 0) * (Number(r.unit_cost) || 0);
      itemsCalcMap.set(r.order_id, cur + line);
    }

    // 4) Saldo de crédito por loja
    const { data: bals, error: bErr } = await supabase
      .from("v_store_credit_balance")
      .select("store_id,balance")
      .in("store_id", storeIdsUnique);

    if (bErr) {
      console.warn("credit balance:", bErr.message);
    }

    const balMap = new Map<string, number>();
    for (const r of (bals ?? []) as CreditBalRow[]) balMap.set(r.store_id, Number(r.balance) || 0);

    // 5) store_id -> name (usar storeList, não state)
    const storeMap = new Map<string, string>();
    for (const s of storeList) storeMap.set(s.id, s.name ?? s.id);

    // 6) Monta UI (com anti-frete-duplicado)
    const ui: RowUi[] = orders.map((o) => {
      const frete = o.delivery_mode === "FRETE" ? Number(o.freight_fee ?? 0) : 0;

      const viewTotal = totalsMap.get(o.id) ?? 0; // pode ser: itens OU itens+frete
      const itemsCalc = itemsCalcMap.get(o.id) ?? 0;

      // Detecta se a view já inclui frete:
      // - se view ≈ itensCalc -> view é itens
      // - se view ≈ itensCalc + frete -> view inclui frete
      // Caso não consiga decidir (sem dados), assume view = itens.
      let mercadoria = viewTotal;

      if (frete > 0 && itemsRaw) {
        if (near(viewTotal, itemsCalc + frete)) {
          mercadoria = Math.max(viewTotal - frete, 0); // remove frete da base
        } else if (near(viewTotal, itemsCalc)) {
          mercadoria = viewTotal; // ok, já é itens
        } else {
          // fallback: se não bate, preferir o cálculo real dos itens (mais confiável)
          if (!near(itemsCalc, 0)) mercadoria = itemsCalc;
        }
      } else {
        // sem frete: mercadoria = viewTotal (ou itemsCalc se houver divergência grande)
        if (itemsRaw && !near(viewTotal, itemsCalc)) {
          mercadoria = itemsCalc;
        }
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

  async function onReload() {
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
        <div style={styles.headerRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>Financeiro (Admin)</h1>
            <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>Resumo de pedidos, crédito e pagamentos.</div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={styles.secondaryBtn} onClick={() => router.push("/adm/pedidos")}>
              ← Pedidos
            </button>
            <button style={styles.secondaryBtn} onClick={onReload}>
              Recarregar
            </button>
          </div>
        </div>

        {msg ? <div style={{ marginTop: 12, ...styles.err }}>{msg}</div> : null}

        {/* Filtros */}
        <div style={styles.filters}>
          <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} style={styles.select}>
            <option value="all">Loja: todas</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name ?? s.id}
              </option>
            ))}
          </select>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={styles.select}>
            <option value="all">Status: todos</option>
            <option value="draft">draft</option>
            <option value="submitted">submitted</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
          </select>

          <select value={paidFilter} onChange={(e) => setPaidFilter(e.target.value)} style={styles.select}>
            <option value="all">Pagamento: todos</option>
            <option value="paid">Somente pagos</option>
            <option value="unpaid">Somente não pagos</option>
          </select>

          <select value={deliveryFilter} onChange={(e) => setDeliveryFilter(e.target.value)} style={styles.select}>
            <option value="all">Entrega: todas</option>
            <option value="RETIRADA">Retirada</option>
            <option value="FRETE">Frete</option>
          </select>

          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={styles.select} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={styles.select} />

          <button style={styles.primaryBtn} onClick={onReload}>
            Aplicar filtros
          </button>
        </div>

        {/* Resumo */}
        <div style={styles.summaryRow}>
          <div style={styles.sumBox}>
            <div style={styles.sumLabel}>Mercadoria</div>
            <div style={styles.sumValue}>{money(resumo.totalMercadoria)}</div>
          </div>
          <div style={styles.sumBox}>
            <div style={styles.sumLabel}>Frete</div>
            <div style={styles.sumValue}>{money(resumo.totalFrete)}</div>
          </div>
          <div style={styles.sumBox}>
            <div style={styles.sumLabel}>Total</div>
            <div style={styles.sumValue}>{money(resumo.totalTotal)}</div>
          </div>
          <div style={styles.sumBox}>
            <div style={styles.sumLabel}>Crédito abatido</div>
            <div style={styles.sumValue}>- {money(resumo.totalCredito)}</div>
          </div>
          <div style={styles.sumBoxStrong}>
            <div style={styles.sumLabel}>A pagar</div>
            <div style={styles.sumValueStrong}>{money(resumo.totalApagar)}</div>
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

        {/* Tabela */}
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Pedido</th>
                <th style={styles.th}>Loja</th>
                <th style={styles.th}>Operação</th>

                <th style={styles.th}>Entrega</th>
                <th style={styles.th}>Líquido (mercadoria)</th>
                <th style={styles.th}>Frete</th>
                <th style={styles.th}>Total</th>

                <th style={styles.th}>Crédito abatido</th>
                <th style={styles.th}>A pagar</th>

                <th style={styles.th}>Pago?</th>
                <th style={styles.th}>Data pagamento</th>

                <th style={styles.th}>Saldo crédito</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => router.push(`/adm/pedidos/${r.id}`)}
                  title="Abrir pedido"
                >
                  <td style={styles.tdMono}>{r.id}</td>
                  <td style={styles.td}>{r.store_name}</td>

                  <td style={styles.td}>
                    <span style={styles.pill}>{logisticLabel(r.logistic_status)}</span>
                  </td>

                  <td style={styles.td}>{deliveryLabel(r.delivery_mode)}</td>
                  <td style={styles.tdStrong}>{money(r.mercadoria)}</td>
                  <td style={styles.td}>{r.delivery_mode === "FRETE" ? money(r.frete) : "-"}</td>
                  <td style={styles.tdStrong}>{money(r.total)}</td>

                  <td style={styles.td}>- {money(r.credit_applied)}</td>
                  <td style={styles.tdStrong}>{money(r.a_pagar)}</td>

                  <td style={styles.td}>{r.is_paid ? "Sim" : "Não"}</td>
                  <td style={styles.td}>{fmtBR(r.paid_at)}</td>

                  <td style={styles.tdStrong}>{money(r.credit_balance)}</td>
                </tr>
              ))}

              {rows.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ padding: 14, color: "#777" }}>
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
    width: "min(1300px, 100%)",
    margin: "0 auto",
  },
  headerRow: { display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },

  filters: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
    alignItems: "center",
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    background: "white",
  },

  select: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "white",
    fontWeight: 800,
  },

  summaryRow: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
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
    fontWeight: 900,
  },
  err: {
    marginTop: 12,
    padding: 10,
    background: "#fff2f2",
    border: "1px solid #ffd0d0",
    borderRadius: 10,
    color: "#a40000",
    fontSize: 13,
  },
};