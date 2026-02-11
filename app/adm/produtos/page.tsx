"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ProductRow = {
  id: string;
  sku: string | null;
  name: string | null;
  unit: string | null;
  unit_price: number | null;
  step_qty: number | null;
  pack_qty: number | null;
  active: boolean | null;
};

function toNumber(v: string) {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function AdmProdutosPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState("");

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [q, setQ] = useState("");

  // form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("un");
  const [unitPrice, setUnitPrice] = useState("0");
  const [stepQty, setStepQty] = useState("1");
  const [packQty, setPackQty] = useState("1");
  const [active, setActive] = useState(true);

  async function requireAuth() {
    const { data } = await supabase.auth.getUser();
    if (!data?.user) {
      router.push("/login");
      return false;
    }
    return true;
  }

  async function loadProducts() {
    setMsg("");
    const ok = await requireAuth();
    if (!ok) return;

    const { data, error } = await supabase
      .from("products")
      .select("id,sku,name,unit,unit_price,step_qty,pack_qty,active")
      .order("name", { ascending: true });

    if (error) {
      setMsg(error.message);
      setProducts([]);
      return;
    }

    setProducts((data ?? []) as ProductRow[]);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadProducts();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return products;
    return products.filter((p) => {
      const blob = `${p.sku ?? ""} ${p.name ?? ""} ${p.unit ?? ""} ${p.id}`.toLowerCase();
      return blob.includes(qq);
    });
  }, [products, q]);

  function resetForm() {
    setEditingId(null);
    setSku("");
    setName("");
    setUnit("un");
    setUnitPrice("0");
    setStepQty("1");
    setPackQty("1");
    setActive(true);
  }

  function startEdit(p: ProductRow) {
    setEditingId(p.id);
    setSku(p.sku ?? "");
    setName(p.name ?? "");
    setUnit(p.unit ?? "un");
    setUnitPrice(String(p.unit_price ?? 0));
    setStepQty(String(p.step_qty ?? 1));
    setPackQty(String(p.pack_qty ?? 1));
    setActive(p.active ?? true);
    setMsg("");
  }

  async function saveProduct() {
    setMsg("");
    setWorking(true);

    const skuVal = sku.trim();
    const nameVal = name.trim();

    if (!skuVal) {
      setWorking(false);
      setMsg("Preencha o SKU.");
      return;
    }
    if (!nameVal) {
      setWorking(false);
      setMsg("Preencha o nome do produto.");
      return;
    }

    const payload = {
      sku: skuVal,
      name: nameVal,
      unit: unit.trim() || "un",
      unit_price: toNumber(unitPrice),
      step_qty: Math.max(1, Math.floor(toNumber(stepQty))),
      pack_qty: Math.max(1, Math.floor(toNumber(packQty))),
      active: !!active,
    };

    if (editingId) {
      const { error } = await supabase.from("products").update(payload).eq("id", editingId);
      if (error) {
        setWorking(false);
        setMsg(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("products").insert(payload);
      if (error) {
        setWorking(false);
        setMsg(error.message);
        return;
      }
    }

    setWorking(false);
    resetForm();
    await loadProducts();
  }

  async function toggleActive(p: ProductRow) {
    setMsg("");
    setWorking(true);

    const { error } = await supabase
      .from("products")
      .update({ active: !(p.active ?? true) })
      .eq("id", p.id);

    if (error) {
      setWorking(false);
      setMsg(error.message);
      return;
    }

    setWorking(false);
    await loadProducts();
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20 }}>Produtos</h1>
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              Cadastre e edite produtos (preço, unidade e regras de passo/lote).
            </div>
          </div>

          <button style={styles.secondaryBtn} onClick={loadProducts} disabled={working}>
            Atualizar
          </button>
        </div>

        {msg ? <div style={styles.msgBox}>{msg}</div> : null}

        <div style={styles.grid2}>
          {/* Form */}
          <section style={styles.panel}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>
              {editingId ? "Editar produto" : "Novo produto"}
            </div>

            <label style={styles.label}>SKU</label>
            <input style={styles.input} value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ex.: AB-001" />

            <label style={styles.label}>Nome</label>
            <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Pão Brioche" />

            <div style={styles.grid2inner}>
              <div>
                <label style={styles.label}>Unidade</label>
                <input style={styles.input} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="un / cx / kg ..." />
              </div>
              <div>
                <label style={styles.label}>Preço unitário</label>
                <input style={styles.input} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0,00" />
              </div>
            </div>

            <div style={styles.grid2inner}>
              <div>
                <label style={styles.label}>Passo (step_qty)</label>
                <input style={styles.input} value={stepQty} onChange={(e) => setStepQty(e.target.value)} placeholder="1" />
              </div>
              <div>
                <label style={styles.label}>Lote/caixa (pack_qty)</label>
                <input style={styles.input} value={packQty} onChange={(e) => setPackQty(e.target.value)} placeholder="1" />
              </div>
            </div>

            <label style={styles.label}>Ativo?</label>
            <select style={styles.select} value={active ? "true" : "false"} onChange={(e) => setActive(e.target.value === "true")}>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>

            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button style={styles.primaryBtn} onClick={saveProduct} disabled={working}>
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

            <input style={styles.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por SKU, nome..." />

            {loading ? <div style={{ marginTop: 10 }}>Carregando...</div> : null}

            {!loading && filtered.length === 0 ? (
              <div style={{ marginTop: 10, color: "#666" }}>Nenhum produto encontrado.</div>
            ) : null}

            {!loading && filtered.length > 0 ? (
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                {filtered.map((p) => (
                  <div key={p.id} style={styles.row}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.name ?? "-"} {p.sku ? `(${p.sku})` : ""}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        {p.unit ?? "un"} · R$ {(p.unit_price ?? 0).toFixed(2)} · passo {p.step_qty ?? 1} · lote {p.pack_qty ?? 1} ·{" "}
                        {p.active ? "Ativo" : "Inativo"}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.55, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.id}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <button style={styles.secondaryBtn} onClick={() => startEdit(p)} disabled={working}>
                        Editar
                      </button>
                      <button style={styles.warnBtn} onClick={() => toggleActive(p)} disabled={working}>
                        {p.active ? "Desativar" : "Ativar"}
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
  grid2inner: { display: "grid", gridTemplateColumns: "1fr 200px", gap: 10, marginTop: 10 },

  label: { fontSize: 12, color: "#666", fontWeight: 900, marginTop: 10, display: "block" },
  input: { width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", outline: "none" },
  select: { width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" },

  primaryBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer", fontWeight: 900 },
  secondaryBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontWeight: 900 },
  warnBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #f0b429", background: "#fff8e1", cursor: "pointer", fontWeight: 900 },

  row: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", border: "1px solid #eee", borderRadius: 12, padding: 10 },

  msgBox: { marginTop: 12, padding: 10, background: "#fff2f2", border: "1px solid #ffd0d0", borderRadius: 10, color: "#a40000", fontSize: 13 },
};