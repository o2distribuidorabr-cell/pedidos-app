"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type OrderRow = {
  id: string;
  store_id: string | null;
  status: string;
  notes: string | null;

  created_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;

  logistic_status: "RECEBIDO" | "EM_SEPARACAO" | "ENTREGUE" | null;

  is_paid: boolean | null;
  paid_at: string | null;
  payment_method: "PIX" | "CARTAO" | "BOLETO" | null;

  delivery_mode: "RETIRADA" | "FRETE" | null;
  freight_fee: number | null;
};

type ProductRow = { sku: string | null; name: string | null; unit: string | null };

// ✅ Aqui está o ponto: em alguns casos o Supabase devolve `products` como ARRAY.
// Então aceitamos: ProductRow | ProductRow[] | null
type ItemRow = {
  id: string;
  qty: number;
  unit: string | null;
  unit_cost: number | null;
  product_id: string;
  products: ProductRow | ProductRow[] | null;
};

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDT(v: string | null | undefined) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("pt-BR");
  } catch {
    return v;
  }
}

// ✅ Normaliza products para SEMPRE virar 1 objeto (ou null)
function getProduct(p: ItemRow["products"]): ProductRow | null {
  if (!p) return null;
  if (Array.isArray(p)) return p[0] ?? null;
  return p;
}

export default function PedidoDetalhePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params?.id;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);

  const totalItens = useMemo(() => {
    return items.reduce((acc, it) => {
      const unitCost = Number(it.unit_cost ?? 0);
      return acc + Number(it.qty ?? 0) * unitCost;
    }, 0);
  }, [items]);

  const frete = useMemo(() => {
    if (!order) return 0;
    if (order.delivery_mode !== "FRETE") return 0;
    return Number(order.freight_fee ?? 0);
  }, [order]);

  const totalComFrete = useMemo(() => totalItens + frete, [totalItens, frete]);

  useEffect(() => {
    (async () => {
      setMsg("");
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        router.push("/login");
        return;
      }

      if (!orderId) {
        setMsg("Pedido inválido.");
        setLoading(false);
        return;
      }

      await loadAll(orderId);

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function loadAll(id: string) {
    // Pedido
    const { data: o, error: oErr } = await supabase
      .from("orders")
      .select(
        "id,store_id,status,notes,created_at,submitted_at,approved_at,logistic_status,is_paid,paid_at,payment_method,delivery_mode,freight_fee"
      )
      .eq("id", id)
      .maybeSingle();

    if (oErr || !o) {
      setMsg(oErr?.message || "Pedido não encontrado.");
      setOrder(null);
      setItems([]);
      return;
    }
    setOrder(o as OrderRow);

    // Itens (✅ usando alias products:products para relação)
    const { data: it, error: itErr } = await supabase
      .from("order_items")
      .select("id,qty,unit,unit_cost,product_id, products:products (sku,name,unit)")
      .eq("order_id", id);

    if (itErr) {
      setMsg(itErr.message);
      setItems([]);
      return;
    }

    // ✅ Não faz cast direto “as ItemRow[]” do jeito antigo.
    // Faz cast para unknown e depois para ItemRow[] (evita o erro do build)
    const safe = (it ?? []) as unknown as ItemRow[];
    setItems(safe);
  }

  if (loading) {
    return (
      <main style={styles.main}>
        <div style={styles.card}>Carregando...</div>
      </main>
    );
  }

  if (!order) {
    return (
      <main style={styles.main}>
        <div style={styles.card}>
          <button style={styles.secondaryBtn} onClick={() => router.push("/pedidos")}>
            ← Voltar
          </button>
          <div style={{ marginTop: 12, ...styles.err }}>{msg || "Pedido não encontrado."}</div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>Detalhe do pedido</h1>
            <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
              ID: <span style={styles.mono}>{order.id}</span>
            </div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={styles.secondaryBtn} onClick={() => router.push("/pedidos")}>
              ← Voltar
            </button>
            <button style={styles.secondaryBtn} onClick={() => loadAll(order.id)}>
              Recarregar
            </button>
          </div>
        </div>

        {msg ? <div style={{ marginTop: 12, ...styles.err }}>{msg}</div> : null}

        {/* Info (somente leitura) */}
        <div style={styles.grid6}>
          <div style={styles.box}>
            <div style={styles.label}>Status</div>
            <div style={styles.value}>{order.status}</div>
          </div>

          <div style={styles.box}>
            <div style={styles.label}>Logística</div>
            <div style={styles.value}>{order.logistic_status ?? "—"}</div>
          </div>

          <div style={styles.box}>
            <div style={styles.label}>Entrega</div>
            <div style={styles.value}>{order.delivery_mode ?? "—"}</div>
          </div>

          <div style={styles.box}>
            <div style={styles.label}>Frete</div>
            <div style={styles.value}>{fmtBRL(frete)}</div>
          </div>

          <div style={styles.box}>
            <div style={styles.label}>Pagamento</div>
            <div style={styles.value}>
              {order.is_paid ? "Pago" : "Não pago"}{" "}
              <span style={{ fontSize: 12, color: "#666" }}>{order.paid_at ? `(${fmtDT(order.paid_at)})` : ""}</span>
            </div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
              Forma: {order.payment_method ?? "—"}
            </div>
          </div>

          <div style={styles.box}>
            <div style={styles.label}>Datas</div>
            <div style={{ fontSize: 12, color: "#666", lineHeight: 1.6 }}>
              Criado: {fmtDT(order.created_at)}
              <br />
              Enviado: {fmtDT(order.submitted_at)}
              <br />
              Aprovado: {fmtDT(order.approved_at)}
            </div>
          </div>
        </div>

        {/* Observações */}
        <div style={{ marginTop: 12 }}>
          <div style={styles.label}>Observações</div>
          <div style={styles.notesBox}>{order.notes ?? "—"}</div>
        </div>

        {/* Resumo */}
        <div style={styles.summaryRow}>
          <div style={styles.sumBox}>
            <div style={styles.sumLabel}>Itens</div>
            <div style={styles.sumValue}>{fmtBRL(totalItens)}</div>
          </div>
          <div style={styles.sumBox}>
            <div style={styles.sumLabel}>Frete</div>
            <div style={styles.sumValue}>{fmtBRL(frete)}</div>
          </div>
          <div style={styles.sumBoxStrong}>
            <div style={styles.sumLabel}>Total (c/ frete)</div>
            <div style={styles.sumValueStrong}>{fmtBRL(totalComFrete)}</div>
          </div>
        </div>

        {/* Itens */}
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>SKU</th>
                <th style={styles.th}>Produto</th>
                <th style={styles.th}>Unid.</th>
                <th style={styles.th}>Preço</th>
                <th style={styles.th}>Qtd</th>
                <th style={styles.th}>Total</th>
              </tr>
            </thead>

            <tbody>
              {items.map((it) => {
                const prod = getProduct(it.products);
                const sku = prod?.sku ?? "-";
                const name = prod?.name ?? "-";
                const unit = prod?.unit ?? it.unit ?? "-";
                const unitCost = Number(it.unit_cost ?? 0);
                const line = Number(it.qty ?? 0) * unitCost;

                return (
                  <tr key={it.id}>
                    <td style={styles.tdMono}>{sku}</td>
                    <td style={styles.td}>{name}</td>
                    <td style={styles.td}>{unit}</td>
                    <td style={styles.td}>{fmtBRL(unitCost)}</td>
                    <td style={styles.tdStrong}>{it.qty}</td>
                    <td style={styles.tdStrong}>{fmtBRL(line)}</td>
                  </tr>
                );
              })}
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

  headerRow: { display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },
  mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },

  grid6: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
  },

  box: { border: "1px solid #eee", borderRadius: 12, padding: 10, background: "#fafbff" },
  label: { fontSize: 12, color: "#666", fontWeight: 900, marginBottom: 6 },
  value: { fontSize: 14, fontWeight: 900 },

  notesBox: {
    border: "1px solid #ddd",
    borderRadius: 12,
    padding: "10px 12px",
    background: "white",
    fontSize: 14,
    minHeight: 52,
    whiteSpace: "pre-wrap",
  },

  summaryRow: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1.2fr",
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
    padding: 10,
    background: "#fff2f2",
    border: "1px solid #ffd0d0",
    borderRadius: 10,
    color: "#a40000",
    fontSize: 13,
  },
};