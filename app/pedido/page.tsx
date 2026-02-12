"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import FranchiseeTopbar from "@/app/components/FranchiseeTopbar";

type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string | null; // ex: "cx", "kg", "un"

  // vamos usar unit_cost como "preço efetivo" para não quebrar seu carrinho
  unit_cost: number | null;

  // extra (opcional) só pra debug/UI, se quiser
  base_price?: number | null;
  override_price?: number | null;
};

type CartItem = {
  product_id: string;
  sku: string;
  name: string;
  unit: string;
  unit_cost: number; // preço efetivo
  qty: number;
};

type StoreRow = { id: string; name: string; freight_fee: number };
type PriceOverrideRow = { product_id: string; unit_price: number | null };

const STEP_BY_SKU: Record<string, number> = {
  "110129": 120,
  "110132": 216,
  "110133": 20,
  "190": 1,
  "110243": 50,
  "110399": 800,
  "110152": 2250,
  "110147": 150,
  "110278": 25,
  "110255": 1000,
  "110280": 3.5,
  "110225": 0.397,
  "110276": 48,
  "110150": 1000,
  "194": 60,
  "193": 60,
};

function getStep(sku: string) {
  return STEP_BY_SKU[sku] ?? 1;
}

function roundToStep(value: number, step: number) {
  if (step <= 0) return value;
  const k = Math.round(value / step);
  return k * step;
}

function money(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PedidoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string>("");

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, CartItem>>({});

  // entrega + frete padrão da loja
  const [deliveryMode, setDeliveryMode] = useState<"RETIRADA" | "FRETE">("RETIRADA");
  const [freightFee, setFreightFee] = useState<number>(0);
  const [storeName, setStoreName] = useState<string>("-");

  const itemsTotal = useMemo(() => {
    return Object.values(cart).reduce((acc, it) => acc + it.qty * it.unit_cost, 0);
  }, [cart]);

  const freightApplied = useMemo(() => (deliveryMode === "FRETE" ? freightFee : 0), [deliveryMode, freightFee]);

  const grandTotal = useMemo(() => itemsTotal + freightApplied, [itemsTotal, freightApplied]);

  const hasItems = useMemo(() => Object.keys(cart).length > 0, [cart]);

  useEffect(() => {
    (async () => {
      setMsg("");
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        router.push("/login");
        return;
      }

      // 1) store_id do profile
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("id", auth.user.id)
        .maybeSingle();

      if (pErr) {
        setLoading(false);
        setMsg(pErr.message);
        return;
      }

      const storeId = (profile?.store_id as string | null) ?? null;
      if (!storeId) {
        setLoading(false);
        setMsg("Seu usuário não está vinculado a nenhuma loja (profiles.store_id).");
        return;
      }

      // 2) frete padrão da loja
      const { data: store, error: sErr } = await supabase
        .from("stores")
        .select("id,name,freight_fee")
        .eq("id", storeId)
        .maybeSingle();

      if (sErr || !store) {
        setLoading(false);
        setMsg(sErr?.message || "Loja não encontrada.");
        return;
      }

      const st = store as StoreRow;
      setStoreName(st.name ?? "-");
      setFreightFee(Number(st.freight_fee ?? 0));

      // 3) buscar produtos (preço padrão)
      const { data: prodData, error: prodErr } = await supabase
        .from("products")
        .select("id, sku, name, unit, unit_price, active")
        .eq("active", true)
        .order("name", { ascending: true });

      if (prodErr) {
        setLoading(false);
        setMsg(prodErr.message);
        return;
      }

      // 4) buscar overrides da loja (preço por loja)
      const { data: ovData, error: ovErr } = await supabase
        .from("store_product_prices")
        .select("product_id, unit_price")
        .eq("store_id", storeId);

      if (ovErr) {
        setLoading(false);
        setMsg(ovErr.message);
        return;
      }

      const ovMap: Record<string, number> = {};
      (ovData as PriceOverrideRow[] | null)?.forEach((r) => {
        if (!r?.product_id) return;
        const v = Number(r.unit_price ?? 0);
        if (Number.isFinite(v) && v > 0) ovMap[String(r.product_id)] = v;
      });

      // 5) montar lista final com preço efetivo:
      // effective = override (se existir) senão unit_price do produto
      const merged: Product[] = (prodData ?? []).map((p: any) => {
        const base = Number(p.unit_price ?? 0) || 0;
        const ov = ovMap[p.id];
        const effective = ov != null ? ov : base;

        return {
          id: String(p.id),
          sku: String(p.sku ?? ""),
          name: String(p.name ?? ""),
          unit: (p.unit ?? "un") as string,
          unit_cost: Number(effective) || 0,
          base_price: base,
          override_price: ov ?? null,
        };
      });

      setProducts(merged);
      setLoading(false);
    })();
  }, [router]);

  function setQty(prod: Product, qtyRaw: number) {
    const unit = (prod.unit ?? "un").toString();
    const unit_cost = Number(prod.unit_cost ?? 0);
    const step = getStep(prod.sku);
    const qty = Math.max(0, roundToStep(qtyRaw, step));

    setCart((prev) => {
      const next = { ...prev };
      if (qty === 0) {
        delete next[prod.id];
        return next;
      }
      next[prod.id] = {
        product_id: prod.id,
        sku: prod.sku,
        name: prod.name,
        unit,
        unit_cost,
        qty,
      };
      return next;
    });
  }

  function inc(prod: Product) {
    const step = getStep(prod.sku);
    const current = cart[prod.id]?.qty ?? 0;
    setQty(prod, current + step);
  }

  function dec(prod: Product) {
    const step = getStep(prod.sku);
    const current = cart[prod.id]?.qty ?? 0;
    setQty(prod, current - step);
  }

  function onContinue() {
    const items = Object.values(cart);
    localStorage.setItem("cart_items", JSON.stringify(items));

    localStorage.setItem(
      "delivery_info",
      JSON.stringify({
        delivery_mode: deliveryMode,
        freight_fee: deliveryMode === "FRETE" ? freightFee : 0,
        store_name: storeName,
      })
    );

    router.push("/pedido/confirmar");
  }

  return (
    <main style={styles.main}>
      <FranchiseeTopbar />

      {/* Cabeçalho */}
      <div style={styles.card}>
        <div style={styles.pageHeader}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>Novo pedido</h1>
            <div style={{ marginTop: 6, color: "#555" }}>
              Selecione as quantidades. Algumas quantidades são travadas por caixa/lote.
            </div>
            <div style={{ marginTop: 6, color: "#777", fontSize: 12 }}>
              Loja: <b>{storeName}</b>
            </div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/pedidos" style={styles.linkBtn}>
              Histórico
            </Link>

            <button
              style={{ ...styles.primaryBtn, opacity: hasItems ? 1 : 0.5, cursor: hasItems ? "pointer" : "not-allowed" }}
              onClick={onContinue}
              disabled={!hasItems}
              title={!hasItems ? "Selecione algum item" : "Continuar"}
            >
              Continuar → Confirmar ({money(grandTotal)})
            </button>
          </div>
        </div>
      </div>

      {loading ? <div style={styles.card}>Carregando...</div> : null}
      {msg ? <div style={{ ...styles.card, ...styles.err }}>{msg}</div> : null}

      {/* Entrega */}
      {!loading && !msg ? (
        <div style={styles.card}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontWeight: 900, color: "#111" }}>Entrega</div>

            <label style={styles.radio}>
              <input type="radio" name="delivery" checked={deliveryMode === "RETIRADA"} onChange={() => setDeliveryMode("RETIRADA")} />
              Retirada
            </label>

            <label style={styles.radio}>
              <input type="radio" name="delivery" checked={deliveryMode === "FRETE"} onChange={() => setDeliveryMode("FRETE")} />
              Frete
            </label>

            <div style={{ marginLeft: "auto", fontWeight: 900 }}>
              Frete: {money(freightApplied)}
            </div>
          </div>

          <div style={{ marginTop: 8, fontSize: 12, color: "#777" }}>
            Se escolher Frete, o valor é o frete padrão cadastrado para esta loja.
          </div>
        </div>
      ) : null}

      {/* Produtos */}
      {!loading && !msg ? (
        <div style={styles.card}>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>SKU</th>
                  <th style={styles.th}>Nome</th>
                  <th style={styles.th}>Unid.</th>
                  <th style={styles.th}>Preço</th>
                  <th style={styles.th}>Quantidade</th>
                  <th style={styles.th}>Total</th>
                </tr>
              </thead>

              <tbody>
                {products.map((p) => {
                  const unit = (p.unit ?? "un").toString();
                  const unit_cost = Number(p.unit_cost ?? 0);
                  const qty = cart[p.id]?.qty ?? 0;
                  const step = getStep(p.sku);
                  const lineTotal = qty * unit_cost;

                  return (
                    <tr key={p.id}>
                      <td style={styles.tdMono}>{p.sku}</td>
                      <td style={styles.td}>{p.name}</td>
                      <td style={styles.td}>{unit}</td>
                      <td style={styles.td}>{money(unit_cost)}</td>

                      <td style={styles.td}>
                        <div style={styles.qtyWrap}>
                          <button style={styles.qtyBtn} onClick={() => dec(p)} type="button">-</button>
                          <input
                            style={styles.qtyInput}
                            type="number"
                            value={qty}
                            step={step}
                            min={0}
                            onChange={(e) => setQty(p, Number(e.target.value))}
                          />
                          <button style={styles.qtyBtn} onClick={() => inc(p)} type="button">+</button>
                        </div>
                        <div style={styles.small}>
                          passo: {step} {unit}
                        </div>
                      </td>

                      <td style={styles.tdStrong}>{money(lineTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={styles.footer}>
            <div style={styles.totalBox}>
              <div style={styles.small}>Itens</div>
              <div style={{ fontSize: 16, fontWeight: 900 }}>{money(itemsTotal)}</div>

              <div style={{ ...styles.small, marginTop: 6 }}>
                Frete ({deliveryMode === "FRETE" ? "Frete" : "Retirada"})
              </div>
              <div style={{ fontSize: 16, fontWeight: 900 }}>{money(freightApplied)}</div>

              <hr style={{ border: 0, borderTop: "1px solid #eee", margin: "10px 0" }} />

              <div style={styles.small}>Total do pedido</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{money(grandTotal)}</div>
            </div>
          </div>
        </div>
      ) : null}
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
    margin: "0 auto 12px",
  },

  pageHeader: { display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" },

  err: {
    background: "#fff2f2",
    borderColor: "#ffd0d0",
    color: "#a40000",
  },

  linkBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    textDecoration: "none",
    color: "#111",
    fontWeight: 900,
  },

  primaryBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    fontSize: 14,
    fontWeight: 900,
  },

  tableWrap: { overflowX: "auto" },
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

  td: {
    padding: "10px 10px",
    borderBottom: "1px solid #f1f1f6",
    verticalAlign: "top",
    whiteSpace: "nowrap",
  },

  tdStrong: {
    padding: "10px 10px",
    borderBottom: "1px solid #f1f1f6",
    fontWeight: 900,
    whiteSpace: "nowrap",
  },

  tdMono: {
    padding: "10px 10px",
    borderBottom: "1px solid #f1f1f6",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 13,
    color: "#111",
    whiteSpace: "nowrap",
  },

  qtyWrap: { display: "flex", alignItems: "center", gap: 6 },
  qtyBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 900,
  },
  qtyInput: {
    width: 110,
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    outline: "none",
    fontSize: 14,
    textAlign: "right",
  },

  small: { marginTop: 4, fontSize: 12, color: "#777", fontWeight: 700 },

  footer: { display: "flex", justifyContent: "flex-end", marginTop: 12 },
  totalBox: {
    padding: 12,
    borderRadius: 12,
    border: "1px solid #eee",
    background: "#fbfbff",
    minWidth: 260,
    textAlign: "right",
  },

  radio: { display: "flex", gap: 8, alignItems: "center", fontWeight: 900, color: "#111" },
};