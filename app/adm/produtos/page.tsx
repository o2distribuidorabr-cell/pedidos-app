"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ProductRow = {
  id: string;
  sku: string | null;
  name: string | null;
  unit: string | null;
  unit_price: number | null; // preço padrão
  step_qty: number | null;
  pack_qty: number | null;
  active: boolean | null;
};

type StoreRow = {
  id: string;
  name: string | null;
};

type StorePriceRow = {
  store_id: string;
  product_id: string;
  unit_price: number | null;
};

function toNumber(v: string) {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function moneyBR(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function AdmProdutosPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState("");

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [q, setQ] = useState("");

  // form produto
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("un");
  const [unitPrice, setUnitPrice] = useState("0");
  const [stepQty, setStepQty] = useState("1");
  const [packQty, setPackQty] = useState("1");
  const [active, setActive] = useState(true);

  // ======= PREÇO POR LOJA (override) =======
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storeFilterId, setStoreFilterId] = useState<string>(""); // loja selecionada
  const [storePricesMap, setStorePricesMap] = useState<Record<string, number>>({}); // product_id -> price
  const [dirtyMap, setDirtyMap] = useState<Record<string, string>>({}); // product_id -> input string
  const [priceQ, setPriceQ] = useState<string>(""); // busca dentro da tabela de preços
  const [priceWorking, setPriceWorking] = useState<boolean>(false);

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

  async function loadStores() {
    const { data, error } = await supabase
      .from("stores")
      .select("id,name")
      .order("name", { ascending: true });

    if (error) {
      console.warn("loadStores:", error.message);
      setStores([]);
      return;
    }

    const list = (data ?? []) as StoreRow[];
    setStores(list);

    // se não tem loja selecionada ainda, seleciona a primeira
    if (!storeFilterId && list.length > 0) {
      setStoreFilterId(list[0].id);
    }
  }

  async function loadStorePrices(storeId: string) {
    if (!storeId) {
      setStorePricesMap({});
      setDirtyMap({});
      return;
    }

    setPriceWorking(true);
    setMsg("");

    const { data, error } = await supabase
      .from("store_product_prices")
      .select("store_id,product_id,unit_price")
      .eq("store_id", storeId);

    if (error) {
      setPriceWorking(false);
      setMsg(error.message);
      setStorePricesMap({});
      setDirtyMap({});
      return;
    }

    const map: Record<string, number> = {};
    (data ?? []).forEach((r: any) => {
      map[String(r.product_id)] = Number(r.unit_price ?? 0) || 0;
    });

    setStorePricesMap(map);
    setDirtyMap({});
    setPriceWorking(false);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadProducts();
      await loadStores();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // quando trocar a loja, recarrega preços dela
  useEffect(() => {
    (async () => {
      if (!storeFilterId) return;
      await loadStorePrices(storeFilterId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeFilterId]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return products;
    return products.filter((p) => {
      const blob = `${p.sku ?? ""} ${p.name ?? ""} ${p.unit ?? ""} ${p.id}`.toLowerCase();
      return blob.includes(qq);
    });
  }, [products, q]);

  const filteredForPrices = useMemo(() => {
    const qq = priceQ.trim().toLowerCase();
    if (!qq) return products;
    return products.filter((p) => {
      const blob = `${p.sku ?? ""} ${p.name ?? ""} ${p.unit ?? ""}`.toLowerCase();
      return blob.includes(qq);
    });
  }, [products, priceQ]);

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

  // ======= PREÇOS POR LOJA actions =======
  function getOverridePrice(pid: string): number | null {
    const v = storePricesMap[pid];
    return v == null ? null : Number(v);
  }

  function getDirtyInput(pid: string): string {
    return dirtyMap[pid] ?? "";
  }

  function setDirty(pid: string, value: string) {
    setDirtyMap((prev) => ({ ...prev, [pid]: value }));
  }

  async function saveStorePrice(productId: string) {
    if (!storeFilterId) {
      setMsg("Selecione uma loja.");
      return;
    }

    setMsg("");
    setPriceWorking(true);

    const raw = getDirtyInput(productId).trim();
    if (!raw) {
      setPriceWorking(false);
      setMsg("Informe um preço para salvar (ou use Remover override).");
      return;
    }

    const price = toNumber(raw);
    if (!(price > 0)) {
      setPriceWorking(false);
      setMsg("Preço inválido. Use um número maior que zero.");
      return;
    }

    const { error } = await supabase
      .from("store_product_prices")
      .upsert(
        [{ store_id: storeFilterId, product_id: productId, unit_price: price }],
        { onConflict: "store_id,product_id" }
      );

    if (error) {
      setPriceWorking(false);
      setMsg(error.message);
      return;
    }

    // atualiza mapa local e limpa dirty daquele produto
    setStorePricesMap((prev) => ({ ...prev, [productId]: price }));
    setDirtyMap((prev) => {
      const n = { ...prev };
      delete n[productId];
      return n;
    });

    setPriceWorking(false);
  }

  async function removeOverride(productId: string) {
    if (!storeFilterId) {
      setMsg("Selecione uma loja.");
      return;
    }

    setMsg("");
    setPriceWorking(true);

    const { error } = await supabase
      .from("store_product_prices")
      .delete()
      .eq("store_id", storeFilterId)
      .eq("product_id", productId);

    if (error) {
      setPriceWorking(false);
      setMsg(error.message);
      return;
    }

    setStorePricesMap((prev) => {
      const n = { ...prev };
      delete n[productId];
      return n;
    });

    setDirtyMap((prev) => {
      const n = { ...prev };
      delete n[productId];
      return n;
    });

    setPriceWorking(false);
  }

  async function saveAllDirty() {
    if (!storeFilterId) {
      setMsg("Selecione uma loja.");
      return;
    }

    setMsg("");
    setPriceWorking(true);

    const entries = Object.entries(dirtyMap)
      .map(([product_id, val]) => ({ product_id, val: val.trim() }))
      .filter((x) => x.val !== "");

    if (entries.length === 0) {
      setPriceWorking(false);
      setMsg("Nenhuma alteração para salvar.");
      return;
    }

    const payload = [];
    for (const e of entries) {
      const p = toNumber(e.val);
      if (!(p > 0)) {
        setPriceWorking(false);
        setMsg("Existe preço inválido (<=0). Corrija antes de salvar.");
        return;
      }
      payload.push({ store_id: storeFilterId, product_id: e.product_id, unit_price: p });
    }

    const { error } = await supabase
      .from("store_product_prices")
      .upsert(payload, { onConflict: "store_id,product_id" });

    if (error) {
      setPriceWorking(false);
      setMsg(error.message);
      return;
    }

    // aplica localmente
    const nextMap = { ...storePricesMap };
    for (const row of payload) nextMap[row.product_id] = Number(row.unit_price);
    setStorePricesMap(nextMap);
    setDirtyMap({});

    setPriceWorking(false);
  }

  const selectedStoreName = useMemo(() => {
    const s = stores.find((x) => x.id === storeFilterId);
    return s?.name ?? (storeFilterId ? storeFilterId : "-");
  }, [stores, storeFilterId]);

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20 }}>Produtos</h1>
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              Cadastro de produtos + preço padrão + preço por loja (override).
            </div>
          </div>

          <button style={styles.secondaryBtn} onClick={async () => {
            setLoading(true);
            await loadProducts();
            await loadStores();
            if (storeFilterId) await loadStorePrices(storeFilterId);
            setLoading(false);
          }} disabled={working || priceWorking}>
            Atualizar
          </button>
        </div>

        {msg ? <div style={styles.msgBox}>{msg}</div> : null}

        {/* ======= BLOCO 1: PRODUTOS (seu original) ======= */}
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
                <label style={styles.label}>Preço padrão</label>
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
                        {p.unit ?? "un"} · {moneyBR(Number(p.unit_price ?? 0))} · passo {p.step_qty ?? 1} · lote {p.pack_qty ?? 1} ·{" "}
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

        {/* ======= BLOCO 2: PREÇOS POR LOJA ======= */}
        <div style={{ marginTop: 12, ...styles.panel }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 1000 as any, fontSize: 16 }}>Preços por loja</div>
              <div style={{ fontSize: 13, opacity: 0.75 }}>
                Defina um preço específico para uma loja. Se não existir override, vale o preço padrão do produto.
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select
                style={{ ...styles.select, minWidth: 260 }}
                value={storeFilterId}
                onChange={(e) => setStoreFilterId(e.target.value)}
                disabled={priceWorking || loading}
              >
                {stores.length === 0 ? <option value="">(Sem lojas)</option> : null}
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name ?? s.id}
                  </option>
                ))}
              </select>

              <button
                style={styles.secondaryBtn}
                onClick={() => storeFilterId && loadStorePrices(storeFilterId)}
                disabled={!storeFilterId || priceWorking || loading}
              >
                Recarregar preços
              </button>

              <button
                style={styles.primaryBtn}
                onClick={saveAllDirty}
                disabled={!storeFilterId || priceWorking || Object.keys(dirtyMap).length === 0}
                title={Object.keys(dirtyMap).length === 0 ? "Nenhuma alteração pendente" : "Salvar alterações"}
              >
                {priceWorking ? "Salvando..." : `Salvar alterações (${Object.keys(dirtyMap).length})`}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              style={{ ...styles.input, maxWidth: 420 }}
              value={priceQ}
              onChange={(e) => setPriceQ(e.target.value)}
              placeholder="Buscar produto por SKU/nome..."
              disabled={loading}
            />
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Loja selecionada: <b>{selectedStoreName}</b>
            </div>
          </div>

          {loading ? <div style={{ marginTop: 10 }}>Carregando...</div> : null}

          {!loading && (
            <div style={{ marginTop: 10, overflowX: "auto" }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>SKU</th>
                    <th style={styles.th}>Produto</th>
                    <th style={styles.th}>Un</th>
                    <th style={styles.th}>Preço padrão</th>
                    <th style={styles.th}>Override loja</th>
                    <th style={styles.th}>Preço efetivo</th>
                    <th style={styles.th}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredForPrices.map((p) => {
                    const pid = p.id;
                    const base = Number(p.unit_price ?? 0) || 0;
                    const ov = getOverridePrice(pid);
                    const effective = ov != null ? ov : base;

                    const dirty = getDirtyInput(pid);
                    const hasOverride = ov != null;

                    return (
                      <tr key={pid}>
                        <td style={styles.tdMono}>{p.sku ?? "-"}</td>
                        <td style={styles.td}>
                          <div style={{ fontWeight: 900 }}>{p.name ?? "-"}</div>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>{pid}</div>
                        </td>
                        <td style={styles.td}>{p.unit ?? "un"}</td>
                        <td style={styles.tdStrong}>{moneyBR(base)}</td>

                        <td style={styles.td}>
                          <input
                            style={styles.priceInput}
                            value={dirty !== "" ? dirty : (hasOverride ? String(ov) : "")}
                            onChange={(e) => setDirty(pid, e.target.value)}
                            placeholder="Ex.: 12.50"
                            disabled={!storeFilterId || priceWorking}
                          />
                          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                            {hasOverride ? "override cadastrado" : "sem override"}
                          </div>
                        </td>

                        <td style={styles.tdStrong}>{moneyBR(effective)}</td>

                        <td style={styles.td}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              style={styles.secondaryBtn}
                              onClick={() => saveStorePrice(pid)}
                              disabled={!storeFilterId || priceWorking}
                            >
                              Salvar
                            </button>

                            <button
                              style={styles.warnBtn}
                              onClick={() => removeOverride(pid)}
                              disabled={!storeFilterId || priceWorking || !hasOverride}
                              title={!hasOverride ? "Não existe override para remover" : "Remover override"}
                            >
                              Remover override
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredForPrices.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: 12, color: "#666" }}>
                        Nenhum produto encontrado.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>

              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                * Override: preço específico da loja. Se remover, volta a valer o “Preço padrão”.
              </div>
            </div>
          )}
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

  primaryBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 900,
  },
  secondaryBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontWeight: 900 },
  warnBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #f0b429", background: "#fff8e1", cursor: "pointer", fontWeight: 900 },

  row: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", border: "1px solid #eee", borderRadius: 12, padding: 10 },

  msgBox: { marginTop: 12, padding: 10, background: "#fff2f2", border: "1px solid #ffd0d0", borderRadius: 10, color: "#a40000", fontSize: 13 },

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
  td: { padding: "10px 10px", borderBottom: "1px solid #f1f1f6", verticalAlign: "top", whiteSpace: "nowrap" },
  tdStrong: { padding: "10px 10px", borderBottom: "1px solid #f1f1f6", fontWeight: 900, whiteSpace: "nowrap" },
  tdMono: {
    padding: "10px 10px",
    borderBottom: "1px solid #f1f1f6",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 13,
    color: "#111",
    whiteSpace: "nowrap",
  },
  priceInput: {
    width: 140,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    outline: "none",
    fontWeight: 900,
  },
};