"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type StoreRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  active: boolean | null;

  code?: string | null;
  freight_fee?: number | null;
};

export default function AdmLojasPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState("");

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [balancesByStore, setBalancesByStore] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");

  // formulário loja
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [stateUf, setStateUf] = useState("");
  const [active, setActive] = useState(true);

  const [freightFee, setFreightFee] = useState<string>("");

  // crédito
  const [creditStoreId, setCreditStoreId] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState<string>("");
  const [creditNote, setCreditNote] = useState<string>("");
  const [creditMode, setCreditMode] = useState<"ADD" | "REMOVE">("ADD"); // ✅ NOVO

  async function requireAuth() {
    const { data } = await supabase.auth.getUser();
    if (!data?.user) {
      router.push("/login");
      return false;
    }
    return true;
  }

  async function loadBalances(storeIds: string[]) {
    if (storeIds.length === 0) {
      setBalancesByStore({});
      return;
    }

    const { data, error } = await supabase
      .from("v_store_credit_balance")
      .select("store_id,balance")
      .in("store_id", storeIds);

    if (error) {
      console.warn("loadBalances error:", error.message);
      return;
    }

    const map: Record<string, number> = {};
    (data ?? []).forEach((r: any) => {
      map[String(r.store_id)] = Number(r.balance ?? 0);
    });
    setBalancesByStore(map);
  }

  async function loadStores() {
    setMsg("");
    const ok = await requireAuth();
    if (!ok) return;

    const { data, error } = await supabase
      .from("stores")
      .select("id,name,city,state,active,freight_fee,code")
      .order("name", { ascending: true });

    if (error) {
      setMsg(error.message);
      setStores([]);
      return;
    }

    const rows = (data ?? []) as StoreRow[];
    setStores(rows);

    await loadBalances(rows.map((s) => s.id));
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadStores();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return stores;
    return stores.filter((s) => {
      const blob = `${s.name} ${s.city ?? ""} ${s.state ?? ""} ${s.code ?? ""} ${s.id}`.toLowerCase();
      return blob.includes(qq);
    });
  }, [stores, q]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setCity("");
    setStateUf("");
    setActive(true);
    setFreightFee("");
  }

  function startEdit(s: StoreRow) {
    setEditingId(s.id);
    setName(s.name ?? "");
    setCity(s.city ?? "");
    setStateUf((s.state ?? "").toUpperCase());
    setActive(s.active ?? true);
    setFreightFee(s.freight_fee != null ? String(s.freight_fee) : "");
    setMsg("");
  }

  async function saveStore() {
    setMsg("");
    setWorking(true);

    const nm = name.trim();
    if (!nm) {
      setWorking(false);
      setMsg("Preencha o nome da loja.");
      return;
    }

    let ff: number | null = null;
    if (freightFee.trim() !== "") {
      const parsed = Number(String(freightFee).replace(",", "."));
      if (Number.isNaN(parsed) || parsed < 0) {
        setWorking(false);
        setMsg("Frete inválido. Use número (ex.: 65 ou 65.00).");
        return;
      }
      ff = parsed;
    }

    const payload: any = {
      name: nm,
      city: city.trim() || null,
      state: stateUf.trim().toUpperCase() || null,
      active: !!active,
      freight_fee: ff,
    };

    if (editingId) {
      const { error } = await supabase.from("stores").update(payload).eq("id", editingId);
      if (error) {
        setWorking(false);
        setMsg(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("stores").insert(payload);
      if (error) {
        setWorking(false);
        setMsg(error.message);
        return;
      }
    }

    setWorking(false);
    resetForm();
    await loadStores();
  }

  async function toggleActive(s: StoreRow) {
    setMsg("");
    setWorking(true);

    const { error } = await supabase
      .from("stores")
      .update({ active: !(s.active ?? true) })
      .eq("id", s.id);

    if (error) {
      setWorking(false);
      setMsg(error.message);
      return;
    }

    setWorking(false);
    await loadStores();
  }

  function openCredit(s: StoreRow) {
    setCreditStoreId(s.id);
    setCreditAmount("");
    setCreditNote("");
    setCreditMode("ADD");
    setMsg("");
  }

  function closeCredit() {
    setCreditStoreId(null);
    setCreditAmount("");
    setCreditNote("");
    setCreditMode("ADD");
  }

  function parseAmountBR(v: string) {
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  }

  async function applyCredit() {
    if (!creditStoreId) return;

    setMsg("");
    setWorking(true);

    const amt = parseAmountBR(creditAmount);
    if (Number.isNaN(amt) || amt <= 0) {
      setWorking(false);
      setMsg("Informe um valor válido (maior que zero).");
      return;
    }

    // Opcional: impedir remover mais do que o saldo exibido
    const currentBal = balancesByStore[creditStoreId] ?? 0;
    if (creditMode === "REMOVE" && amt > currentBal) {
      setWorking(false);
      setMsg(`Saldo insuficiente. Saldo atual: R$ ${currentBal.toFixed(2)}`);
      return;
    }

    if (creditMode === "ADD") {
      const { error } = await supabase.rpc("add_store_credit", {
        p_store_id: creditStoreId,
        p_amount: amt,
        p_note: creditNote.trim() || null,
      });
      if (error) {
        setWorking(false);
        setMsg(error.message);
        return;
      }
    } else {
      // ✅ NOVO: débito via RPC
      const { error } = await supabase.rpc("remove_store_credit", {
        p_store_id: creditStoreId,
        p_amount: amt,
        p_note: creditNote.trim() || null,
      });
      if (error) {
        setWorking(false);
        setMsg(error.message);
        return;
      }
    }

    setWorking(false);
    closeCredit();
    await loadStores();
  }

  const creditStore = creditStoreId ? stores.find((s) => s.id === creditStoreId) : null;
  const creditBalance = creditStoreId ? (balancesByStore[creditStoreId] ?? 0) : 0;

  const previewAfter = useMemo(() => {
    const amt = parseAmountBR(creditAmount);
    if (!creditStoreId || Number.isNaN(amt) || amt <= 0) return creditBalance;
    return creditMode === "ADD" ? creditBalance + amt : Math.max(creditBalance - amt, 0);
  }, [creditStoreId, creditAmount, creditMode, creditBalance]);

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20 }}>Lojas</h1>
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              Cadastre e edite lojas. Gerencie crédito pré-pago (adicionar/remover) por loja.
            </div>
          </div>

          <button style={styles.secondaryBtn} onClick={loadStores} disabled={working}>
            Atualizar
          </button>
        </div>

        {msg ? <div style={styles.msgBox}>{msg}</div> : null}

        <div style={styles.grid2}>
          {/* Form */}
          <section style={styles.panel}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>
              {editingId ? "Editar loja" : "Nova loja"}
            </div>

            <label style={styles.label}>Nome</label>
            <input
              style={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Loja Shopping Cidade"
            />

            <div style={styles.grid2inner}>
              <div>
                <label style={styles.label}>Cidade</label>
                <input
                  style={styles.input}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Belo Horizonte"
                />
              </div>
              <div>
                <label style={styles.label}>UF</label>
                <input
                  style={styles.input}
                  value={stateUf}
                  onChange={(e) => setStateUf(e.target.value)}
                  placeholder="MG"
                  maxLength={2}
                />
              </div>
            </div>

            <label style={styles.label}>Frete padrão (opcional)</label>
            <input
              style={styles.input}
              value={freightFee}
              onChange={(e) => setFreightFee(e.target.value)}
              placeholder="Ex.: 65.00"
            />

            <label style={styles.label}>Ativa?</label>
            <select
              style={styles.select}
              value={active ? "true" : "false"}
              onChange={(e) => setActive(e.target.value === "true")}
            >
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>

            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button style={styles.primaryBtn} onClick={saveStore} disabled={working}>
                {working ? "Salvando..." : "Salvar"}
              </button>
              <button style={styles.secondaryBtn} onClick={resetForm} disabled={working}>
                Limpar
              </button>
            </div>

            {editingId ? (
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
                ID: {editingId}
              </div>
            ) : null}
          </section>

          {/* List */}
          <section style={styles.panel}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Lista</div>

            <input
              style={styles.input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome, cidade, UF..."
            />

            {loading ? <div style={{ marginTop: 10 }}>Carregando...</div> : null}

            {!loading && filtered.length === 0 ? (
              <div style={{ marginTop: 10, color: "#666" }}>Nenhuma loja encontrada.</div>
            ) : null}

            {!loading && filtered.length > 0 ? (
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                {filtered.map((s) => {
                  const bal = balancesByStore[s.id] ?? 0;
                  return (
                    <div key={s.id} style={styles.row}>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 900,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {s.name}
                        </div>

                        <div style={{ fontSize: 12, opacity: 0.75 }}>
                          {(s.city ?? "-")}
                          {s.state ? `/${s.state}` : ""} · {s.active ? "Ativa" : "Inativa"}
                          {s.freight_fee != null ? ` · Frete: R$ ${Number(s.freight_fee).toFixed(2)}` : ""}
                        </div>

                        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                          <b>Crédito:</b> R$ {Number(bal).toFixed(2)}
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            opacity: 0.55,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {s.id}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <button style={styles.secondaryBtn} onClick={() => startEdit(s)} disabled={working}>
                          Editar
                        </button>
                        <button style={styles.secondaryBtn} onClick={() => openCredit(s)} disabled={working}>
                          Crédito
                        </button>
                        <button style={styles.warnBtn} onClick={() => toggleActive(s)} disabled={working}>
                          {s.active ? "Desativar" : "Ativar"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        </div>

        {/* Modal crédito */}
        {creditStoreId ? (
          <div style={styles.modalBackdrop} onClick={closeCredit}>
            <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>Crédito pré-pago</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    Loja: <b>{creditStore?.name ?? creditStoreId}</b>
                    {" · "}
                    Saldo atual: <b>R$ {Number(creditBalance).toFixed(2)}</b>
                    {" · "}
                    Após: <b>R$ {Number(previewAfter).toFixed(2)}</b>
                  </div>
                </div>
                <button style={styles.secondaryBtn} onClick={closeCredit} disabled={working}>
                  Fechar
                </button>
              </div>

              {/* ✅ Modo */}
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button
                  style={creditMode === "ADD" ? styles.modeBtnActive : styles.modeBtn}
                  onClick={() => setCreditMode("ADD")}
                  disabled={working}
                >
                  Adicionar
                </button>
                <button
                  style={creditMode === "REMOVE" ? styles.modeBtnActive : styles.modeBtn}
                  onClick={() => setCreditMode("REMOVE")}
                  disabled={working}
                >
                  Remover
                </button>
              </div>

              <label style={styles.label}>Valor (R$)</label>
              <input
                style={styles.input}
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                placeholder="Ex.: 1000.00"
              />

              <label style={styles.label}>Observação (opcional)</label>
              <input
                style={styles.input}
                value={creditNote}
                onChange={(e) => setCreditNote(e.target.value)}
                placeholder={creditMode === "ADD" ? "Ex.: Crédito antecipado do mês" : "Ex.: Ajuste / Estorno"}
              />

              <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
                <button style={styles.primaryBtn} onClick={applyCredit} disabled={working}>
                  {working ? "Salvando..." : creditMode === "ADD" ? "Adicionar" : "Remover"}
                </button>
              </div>

              {creditMode === "REMOVE" ? (
                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                  Observação: a remoção só funciona se você rodou o SQL da função <b>remove_store_credit</b>.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight: "100vh", background: "#f6f7fb", padding: 0 },
  card: {
    background: "#fff",
    border: "1px solid #e6e7ee",
    borderRadius: 14,
    padding: 14,
    boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
    width: "min(1300px, 100%)",
    margin: "0 auto",
  },
  header: { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 12, marginTop: 12 },
  panel: { border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "white" },
  grid2inner: { display: "grid", gridTemplateColumns: "1fr 120px", gap: 10, marginTop: 10 },

  label: { fontSize: 12, color: "#666", fontWeight: 900, marginTop: 10, display: "block" },
  input: { width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", outline: "none" },
  select: { width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" },

  primaryBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer", fontWeight: 900 },
  secondaryBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontWeight: 900 },
  warnBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #f0b429", background: "#fff8e1", cursor: "pointer", fontWeight: 900 },

  row: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", border: "1px solid #eee", borderRadius: 12, padding: 10 },

  msgBox: { marginTop: 12, padding: 10, background: "#fff2f2", border: "1px solid #ffd0d0", borderRadius: 10, color: "#a40000", fontSize: 13 },

  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    display: "grid",
    placeItems: "center",
    padding: 12,
    zIndex: 50,
  },
  modalCard: {
    width: "min(520px, 100%)",
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #e6e7ee",
    boxShadow: "0 20px 50px rgba(0,0,0,0.20)",
    padding: 14,
  },

  // ✅ botões modo
  modeBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 900,
  },
  modeBtnActive: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 900,
  },
};