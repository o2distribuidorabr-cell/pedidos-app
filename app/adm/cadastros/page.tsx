"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";

type StoreRow = { id: string; name: string };

type SignupRow = {
  id: string;
  user_id: string;
  email: string;

  franchisee_name: string;
  phone: string | null;

  store_name: string;
  cnpj: string | null;
  city: string | null;
  state: string | null;

  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
};

function fmtDT(iso: string | null | undefined) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

export default function AdmCadastrosPage() {
  const router = useRouter();

  const [userEmail, setUserEmail] = useState("-");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [requests, setRequests] = useState<SignupRow[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");

  // seleção de loja por request
  const [storePick, setStorePick] = useState<Record<string, string>>({}); // requestId -> storeId

  async function loadRequests() {
    setMsg("");

    const { data, error } = await supabase
      .from("signup_requests")
      .select(
        "id,user_id,email,franchisee_name,phone,store_name,cnpj,city,state,status,created_at,decided_at,decided_by"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setMsg(error.message);
      setRequests([]);
      return;
    }

    const rows = (data ?? []) as SignupRow[];
    setRequests(rows);

    // preenche storePick com vazio (se não existir)
    setStorePick((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        if (!(r.id in next)) next[r.id] = "";
      }
      return next;
    });
  }

  async function bootstrap() {
    setMsg("");
    setLoading(true);

    // ✅ bloqueia não-admin
    const ok = await requireAdminOrRedirect(router);
    if (!ok) return;

    // email do usuário (apenas para exibir)
    const { data: auth } = await supabase.auth.getUser();
    setUserEmail(auth?.user?.email ?? "-");

    // carrega stores pro dropdown
    const { data: st, error: stErr } = await supabase
      .from("stores")
      .select("id,name")
      .order("name", { ascending: true });

    if (stErr) {
      setMsg(stErr.message);
      setStores([]);
    } else {
      setStores((st ?? []) as StoreRow[]);
    }

    await loadRequests();
    setLoading(false);
  }

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;

      if (qq) {
        const blob = [
          r.email,
          r.franchisee_name,
          r.store_name,
          r.cnpj ?? "",
          r.city ?? "",
          r.state ?? "",
          r.user_id,
        ]
          .join(" ")
          .toLowerCase();

        if (!blob.includes(qq)) return false;
      }
      return true;
    });
  }, [requests, q, statusFilter]);

  async function approveRequest(r: SignupRow) {
    setMsg("");

    const chosenStoreId = storePick[r.id];
    if (!chosenStoreId) {
      setMsg("Selecione uma loja para aprovar.");
      return;
    }

    const { data: auth } = await supabase.auth.getUser();
    const adminId = auth?.user?.id;
    if (!adminId) {
      router.push("/login");
      return;
    }

    // 1) aprova no profiles
    const { error: pErr } = await supabase
      .from("profiles")
      .update({
        approved: true,
        role: "franchisee",
        store_id: chosenStoreId,
      })
      .eq("id", r.user_id);

    if (pErr) {
      setMsg(pErr.message);
      return;
    }

    // 2) marca request como approved
    const { error: rErr } = await supabase
      .from("signup_requests")
      .update({
        status: "approved",
        decided_at: new Date().toISOString(),
        decided_by: adminId,
      })
      .eq("id", r.id);

    if (rErr) {
      setMsg(rErr.message);
      return;
    }

    await loadRequests();
  }

  async function rejectRequest(r: SignupRow) {
    setMsg("");

    const { data: auth } = await supabase.auth.getUser();
    const adminId = auth?.user?.id;
    if (!adminId) {
      router.push("/login");
      return;
    }

    // rejeita request
    const { error: rErr } = await supabase
      .from("signup_requests")
      .update({
        status: "rejected",
        decided_at: new Date().toISOString(),
        decided_by: adminId,
      })
      .eq("id", r.id);

    if (rErr) {
      setMsg(rErr.message);
      return;
    }

    // opcional: manter approved=false no profile
    await supabase
      .from("profiles")
      .update({ approved: false, role: "pending", store_id: null })
      .eq("id", r.user_id);

    await loadRequests();
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        {/* TOPBAR (sem menu) */}
        <div style={styles.topbar}>
          <div>
            <div style={styles.smallMuted}>Usuário</div>
            <div style={styles.topValue}>{userEmail}</div>
          </div>

          <div>
            <div style={styles.smallMuted}>Portal</div>
            <div style={styles.topValue}>Administrativo</div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button style={styles.secondaryBtn} onClick={loadRequests}>
              Atualizar
            </button>
          </div>
        </div>

        <hr style={styles.hr} />

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20 }}>Cadastros</h1>
            <div style={{ fontSize: 13, opacity: 0.7 }}>Aprovar/rejeitar solicitações e vincular loja ao franqueado.</div>
          </div>
        </div>

        {/* filtros */}
        <div style={styles.filters}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por email, nome, loja, CNPJ..."
            style={styles.input}
          />

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} style={styles.select}>
            <option value="pending">Pendentes</option>
            <option value="approved">Aprovados</option>
            <option value="rejected">Rejeitados</option>
            <option value="all">Todos</option>
          </select>
        </div>

        {loading ? <div style={{ marginTop: 12 }}>Carregando...</div> : null}
        {msg ? <div style={{ marginTop: 12, ...styles.msgBox }}>{msg}</div> : null}

        {!loading && filtered.length === 0 ? <div style={{ marginTop: 12, color: "#666" }}>Nada encontrado.</div> : null}

        {!loading && filtered.length > 0 ? (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {filtered.map((r) => {
              const isPending = r.status === "pending";
              return (
                <div key={r.id} style={styles.rowCard}>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 900,
                        fontSize: 14,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.franchisee_name} — {r.email}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                      <b>Solicitou loja:</b> {r.store_name}
                      {r.city || r.state ? (
                        <>
                          {" "}
                          · {r.city ?? ""} {r.state ? `/${r.state}` : ""}
                        </>
                      ) : null}
                      {r.cnpj ? (
                        <>
                          {" "}
                          · <b>CNPJ:</b> {r.cnpj}
                        </>
                      ) : null}
                      {r.phone ? (
                        <>
                          {" "}
                          · <b>Tel:</b> {r.phone}
                        </>
                      ) : null}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                      <b>Status:</b> {r.status} · <b>Criado:</b> {fmtDT(r.created_at)}
                      {r.decided_at ? (
                        <>
                          {" "}
                          · <b>Decidido:</b> {fmtDT(r.decided_at)}
                        </>
                      ) : null}
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.6,
                        marginTop: 6,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      user_id: {r.user_id}
                    </div>
                  </div>

                  {/* ações */}
                  <div style={styles.actionsCol}>
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Vincular loja (stores)</div>

                    <select
                      value={storePick[r.id] ?? ""}
                      disabled={!isPending}
                      onChange={(e) => setStorePick((p) => ({ ...p, [r.id]: e.target.value }))}
                      style={{
                        ...styles.selectFull,
                        background: !isPending ? "#f9fafb" : "white",
                      }}
                    >
                      <option value="">Selecione...</option>
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>

                    <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <button
                        style={{ ...styles.btnDanger, opacity: isPending ? 1 : 0.5 }}
                        disabled={!isPending}
                        onClick={() => rejectRequest(r)}
                      >
                        Rejeitar
                      </button>

                      <button
                        style={{ ...styles.btnOk, opacity: isPending ? 1 : 0.5 }}
                        disabled={!isPending}
                        onClick={() => approveRequest(r)}
                      >
                        Aprovar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
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

  topbar: { display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" },
  smallMuted: { fontSize: 12, color: "#777", fontWeight: 700 },
  topValue: { fontSize: 14, fontWeight: 900, color: "#111" },
  hr: { border: 0, borderTop: "1px solid #eee", margin: "12px 0" },

  secondaryBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 900,
  },

  filters: {
    display: "grid",
    gridTemplateColumns: "1fr 220px",
    gap: 10,
    alignItems: "center",
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    background: "white",
    marginTop: 12,
  },

  input: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    outline: "none",
  },
  select: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
  },
  selectFull: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
  },

  msgBox: {
    padding: 10,
    background: "#fff2f2",
    border: "1px solid #ffd0d0",
    borderRadius: 10,
    color: "#a40000",
    fontSize: 13,
  },

  rowCard: {
    display: "grid",
    gridTemplateColumns: "1fr 380px",
    gap: 12,
    alignItems: "start",
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    background: "white",
  },

  actionsCol: {
    borderLeft: "1px solid #f0f0f0",
    paddingLeft: 12,
  },

  btnOk: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #0f6b2e",
    background: "#eafff1",
    cursor: "pointer",
    fontWeight: 900,
  },
  btnDanger: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ffd0d0",
    background: "#fff2f2",
    cursor: "pointer",
    fontWeight: 900,
    color: "#a40000",
  },
};