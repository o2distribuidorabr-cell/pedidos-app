"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import FranchiseeTopbar from "@/app/components/FranchiseeTopbar";

type LedgerRow = {
  id: number;
  store_id: string;
  amount: number | null;
  note: string | null;
  created_at: string | null;
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

export default function ExtratoFranqueadoPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string>("-");
  const [balance, setBalance] = useState<number>(0);

  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const [rows, setRows] = useState<LedgerRow[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        router.push("/login");
        return;
      }

      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("id", auth.user.id)
        .maybeSingle();

      if (pErr) {
        setMsg(pErr.message);
        setLoading(false);
        return;
      }

      const sId = (profile?.store_id as string | null) ?? null;
      setStoreId(sId);

      if (!sId) {
        setMsg("Seu usuário não está vinculado a nenhuma loja.");
        setLoading(false);
        return;
      }

      const { data: store, error: sErr } = await supabase.from("stores").select("id,name").eq("id", sId).maybeSingle();
      if (!sErr && store) setStoreName((store as any)?.name ?? "-");

      await Promise.all([loadBalance(sId), loadLedger(sId)]);

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadBalance(sId: string) {
    const { data, error } = await supabase
      .from("v_store_credit_balance")
      .select("store_id,balance")
      .eq("store_id", sId)
      .maybeSingle();

    if (error) {
      console.warn("balance:", error.message);
      setBalance(0);
      return;
    }

    setBalance(Number((data as any)?.balance ?? 0) || 0);
  }

  async function loadLedger(sId: string) {
    setMsg("");

    let q = supabase
      .from("store_credit_ledger")
      .select("id,store_id,amount,note,created_at")
      .eq("store_id", sId)
      .order("created_at", { ascending: false });

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
    if (!storeId) return;
    setLoading(true);
    await Promise.all([loadBalance(storeId), loadLedger(storeId)]);
    setLoading(false);
  }

  const resumo = useMemo(() => {
    const entradas = rows.reduce((a, r) => a + (Number(r.amount) > 0 ? Number(r.amount) : 0), 0);
    const saidas = rows.reduce((a, r) => a + (Number(r.amount) < 0 ? Math.abs(Number(r.amount)) : 0), 0);
    const net = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
    return { entradas, saidas, net };
  }, [rows]);

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
        <h1 style={{ margin: 0, fontSize: 22 }}>Extrato de crédito</h1>
        <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
          Loja: <b>{storeName}</b> · Saldo atual: <b>{money(balance)}</b>
        </div>

        {msg ? <div style={{ marginTop: 12, ...styles.err }}>{msg}</div> : null}

        <div style={styles.filters}>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={styles.select} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={styles.select} />
          <button style={styles.primaryBtn} onClick={() => storeId && loadLedger(storeId)} disabled={!storeId}>
            Aplicar filtros
          </button>
          <button style={styles.secondaryBtn} onClick={onReload} disabled={!storeId}>
            Recarregar
          </button>
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

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Data</th>
                <th style={styles.th}>Valor</th>
                <th style={styles.th}>Tipo</th>
                <th style={styles.th}>Observação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const amt = Number(r.amount ?? 0) || 0;
                return (
                  <tr key={r.id}>
                    <td style={styles.td}>{fmtBR(r.created_at)}</td>
                    <td style={amt >= 0 ? styles.tdStrong : styles.tdStrongNeg}>
                      {amt >= 0 ? money(amt) : `- ${money(Math.abs(amt))}`}
                    </td>
                    <td style={styles.td}>{amt >= 0 ? "Crédito" : "Débito/Ajuste"}</td>
                    <td style={styles.td}>{r.note ?? "-"}</td>
                  </tr>
                );
              })}

              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 14, color: "#777" }}>
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
    width: "min(1200px, 100%)",
    margin: "0 auto",
  },

  filters: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "180px 180px 220px 200px",
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

  err: {
    padding: 10,
    background: "#fff2f2",
    border: "1px solid #ffd0d0",
    borderRadius: 10,
    color: "#a40000",
    fontSize: 13,
  },
};