"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type StoreRow = { id: string; name: string | null };

type LedgerRow = {
  id: number;
  store_id: string;
  store_name: string;
  amount: number | null;
  note: string | null;
  created_at: string | null;
  created_by: string | null;
};

type BalanceRow = { store_id: string; balance: number | null };

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

export default function AdmCreditoExtratoPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storeFilter, setStoreFilter] = useState<string>("all");

  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        router.push("/login");
        return;
      }

      await loadStoresAndBalances();
      await loadLedger();

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadStoresAndBalances() {
    const { data: sData, error: sErr } = await supabase
      .from("stores")
      .select("id,name")
      .order("name", { ascending: true });

    if (sErr) {
      setMsg(sErr.message);
      setStores([]);
      return;
    }

    const list = (sData ?? []) as StoreRow[];
    setStores(list);

    if (list.length === 0) {
      setBalances({});
      return;
    }

    const { data: bData, error: bErr } = await supabase
      .from("v_store_credit_balance")
      .select("store_id,balance")
      .in("store_id", list.map((s) => s.id));

    if (bErr) {
      // não trava a página por isso
      console.warn("balances:", bErr.message);
      setBalances({});
      return;
    }

    const map: Record<string, number> = {};
    (bData ?? []).forEach((r: any) => (map[String(r.store_id)] = Number(r.balance ?? 0)));
    setBalances(map);
  }

  async function loadLedger() {
    setMsg("");

    let q = supabase
      .from("v_store_credit_ledger_admin")
      .select("id,store_id,store_name,amount,note,created_at,created_by")
      .order("created_at", { ascending: false });

    if (storeFilter !== "all") q = q.eq("store_id", storeFilter);
    if (dateFrom) q = q.gte("created_at", toISOStart(dateFrom));
    if (dateTo) q = q.lte("created_at", toISOEnd(dateTo));

    const { data, error } = await q;

    if (error) {
      setMsg(error.message);
      setRows([]);
      return;
    }

    setRows((data ?? []) as LedgerRow[]);
  }

  async function onReload() {
    setLoading(true);
    await loadStoresAndBalances();
    await loadLedger();
    setLoading(false);
  }

  const resumo = useMemo(() => {
    const entradas = rows.reduce((a, r) => a + (Number(r.amount) > 0 ? Number(r.amount) : 0), 0);
    const saidas = rows.reduce((a, r) => a + (Number(r.amount) < 0 ? Math.abs(Number(r.amount)) : 0), 0);
    const net = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
    return { entradas, saidas, net };
  }, [rows]);

  const saldoLojaSelecionada = useMemo(() => {
    if (storeFilter === "all") return null;
    return balances[storeFilter] ?? 0;
  }, [balances, storeFilter]);

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>Extrato de crédito (Admin)</h1>
            <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
              Histórico de lançamentos (crédito pré-pago). Valores negativos = remoção/ajuste.
            </div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={styles.secondaryBtn} onClick={() => router.push("/adm/lojas")}>
              ← Lojas
            </button>
            <button style={styles.secondaryBtn} onClick={onReload} disabled={loading}>
              Recarregar
            </button>
          </div>
        </div>

        {msg ? <div style={{ marginTop: 12, ...styles.err }}>{msg}</div> : null}

        <div style={styles.filters}>
          <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} style={styles.select}>
            <option value="all">Loja: todas</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name ?? s.id}
              </option>
            ))}
          </select>

          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={styles.select} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={styles.select} />

          <button style={styles.primaryBtn} onClick={loadLedger} disabled={loading}>
            Aplicar filtros
          </button>

          {saldoLojaSelecionada != null ? (
            <div style={styles.balancePill}>
              Saldo atual: <b style={{ marginLeft: 6 }}>{money(saldoLojaSelecionada)}</b>
            </div>
          ) : (
            <div style={styles.balancePill}>Selecione uma loja para ver o saldo atual</div>
          )}
        </div>

        <div style={styles.summaryRow}>
          <div style={styles.sumBox}>
            <div style={styles.sumLabel}>Entradas</div>
            <div style={styles.sumValue}>{money(resumo.entradas)}</div>
          </div>
          <div style={styles.sumBox}>
            <div style={styles.sumLabel}>Saídas</div>
            <div style={styles.sumValue}>- {money(resumo.saidas)}</div>
          </div>
          <div style={styles.sumBoxStrong}>
            <div style={styles.sumLabel}>Saldo líquido no período</div>
            <div style={styles.sumValueStrong}>{money(resumo.net)}</div>
          </div>
        </div>

        {loading ? <div style={{ marginTop: 12 }}>Carregando...</div> : null}

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Data</th>
                <th style={styles.th}>Loja</th>
                <th style={styles.th}>Valor</th>
                <th style={styles.th}>Tipo</th>
                <th style={styles.th}>Observação</th>
                <th style={styles.th}>Criado por</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const amt = Number(r.amount ?? 0) || 0;
                const tipo = amt >= 0 ? "Crédito" : "Débito/Ajuste";
                return (
                  <tr key={r.id}>
                    <td style={styles.td}>{fmtBR(r.created_at)}</td>
                    <td style={styles.td}>{r.store_name}</td>
                    <td style={amt >= 0 ? styles.tdStrong : styles.tdStrongNeg}>
                      {amt >= 0 ? money(amt) : `- ${money(Math.abs(amt))}`}
                    </td>
                    <td style={styles.td}>{tipo}</td>
                    <td style={styles.td}>{r.note ?? "-"}</td>
                    <td style={styles.tdMono}>{r.created_by ?? "-"}</td>
                  </tr>
                );
              })}

              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 14, color: "#777" }}>
                    Nenhum lançamento encontrado.
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
    gridTemplateColumns: "1.4fr 180px 180px 180px 1fr",
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
    fontWeight: 900,
  },
  balancePill: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#fafbff",
    fontWeight: 800,
    color: "#111",
    textAlign: "center",
  },

  summaryRow: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
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
  tdStrongNeg: { padding: "10px 10px", borderBottom: "1px solid #f1f1f6", fontWeight: 900, whiteSpace: "nowrap", color: "#a40000" },
  tdMono: {
    padding: "10px 10px",
    borderBottom: "1px solid #f1f1f6",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 13,
    whiteSpace: "nowrap",
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