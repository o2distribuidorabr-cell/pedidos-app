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
};

export default function AdmLojasPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState("");

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [q, setQ] = useState("");

  // formulário
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [stateUf, setStateUf] = useState("");
  const [active, setActive] = useState(true);

  async function requireAuth() {
    const { data } = await supabase.auth.getUser();
    if (!data?.user) {
      router.push("/login");
      return false;
    }
    return true;
  }

  async function loadStores() {
    setMsg("");
    const ok = await requireAuth();
    if (!ok) return;

    const { data, error } = await supabase
      .from("stores")
      .select("id,name,city,state,active")
      .order("name", { ascending: true });

    if (error) {
      setMsg(error.message);
      setStores([]);
      return;
    }

    setStores((data ?? []) as StoreRow[]);
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
      const blob = `${s.name} ${s.city ?? ""} ${s.state ?? ""} ${s.id}`.toLowerCase();
      return blob.includes(qq);
    });
  }, [stores, q]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setCity("");
    setStateUf("");
    setActive(true);
  }

  function startEdit(s: StoreRow) {
    setEditingId(s.id);
    setName(s.name ?? "");
    setCity(s.city ?? "");
    setStateUf((s.state ?? "").toUpperCase());
    setActive(s.active ?? true);
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

    const payload = {
      name: nm,
      city: city.trim() || null,
      state: stateUf.trim().toUpperCase() || null,
      active: !!active,
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

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20 }}>Lojas</h1>
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              Cadastre e edite lojas direto pelo painel.
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
            <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Loja Shopping Cidade" />

            <div style={styles.grid2inner}>
              <div>
                <label style={styles.label}>Cidade</label>
                <input style={styles.input} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Belo Horizonte" />
              </div>
              <div>
                <label style={styles.label}>UF</label>
                <input style={styles.input} value={stateUf} onChange={(e) => setStateUf(e.target.value)} placeholder="MG" maxLength={2} />
              </div>
            </div>

            <label style={styles.label}>Ativa?</label>
            <select style={styles.select} value={active ? "true" : "false"} onChange={(e) => setActive(e.target.value === "true")}>
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
                {filtered.map((s) => (
                  <div key={s.id} style={styles.row}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {s.name}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        {(s.city ?? "-")}{s.state ? `/${s.state}` : ""} · {s.active ? "Ativa" : "Inativa"}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.55, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {s.id}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <button style={styles.secondaryBtn} onClick={() => startEdit(s)} disabled={working}>
                        Editar
                      </button>
                      <button style={styles.warnBtn} onClick={() => toggleActive(s)} disabled={working}>
                        {s.active ? "Desativar" : "Ativar"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
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
};