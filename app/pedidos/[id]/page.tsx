"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type OrderRow = {
  id: string;
  status: string;
  notes: string | null;
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;

  // pagamento (franqueado só lê)
  is_paid: boolean | null;
  paid_at: string | null;
  payment_method: "PIX" | "CARTAO" | "BOLETO" | null;

  // logística (franqueado só lê)
  logistic_status: "RECEBIDO" | "EM_SEPARACAO" | "ENTREGUE" | null;

  // entrega/frete
  delivery_mode: "RETIRADA" | "FRETE" | null;
  freight_fee: number | null;
};

type ItemRow = {
  id: string;
  qty: number;
  unit: string | null;
  unit_cost: number | null;
  product_id: string;
  products: {
    sku: string | null;
    name: string | null;
    unit: string | null;
  } | null;
};

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDT(v: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  return d.toLocaleString("pt-BR");
}

function logisticLabel(v: OrderRow["logistic_status"]) {
  if (v === "RECEBIDO") return "Recebido";
  if (v === "EM_SEPARACAO") return "Em separação";
  if (v === "ENTREGUE") return "Entregue";
  return "—";
}

function deliveryLabel(v: OrderRow["delivery_mode"]) {
  if (v === "FRETE") return "Frete";
  return "Retirada";
}

function payMethodLabel(v: OrderRow["payment_method"]) {
  if (v === "PIX") return "Pix";
  if (v === "CARTAO") return "Cartão";
  if (v === "BOLETO") return "Boleto";
  return "—";
}

export default function PedidoDetalhePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params?.id;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);

  const itemsTotal = useMemo(() => {
    return items.reduce((acc, it) => {
      const unitCost = Number(it.unit_cost ?? 0);
      return acc + (it.qty ?? 0) * unitCost;
    }, 0);
  }, [items]);

  const freightApplied = useMemo(() => {
    if (!order) return 0;
    return order.delivery_mode === "FRETE" ? Number(order.freight_fee ?? 0) : 0;
  }, [order]);

  const grandTotal = useMemo(() => itemsTotal + freightApplied, [itemsTotal, freightApplied]);

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

      // 1) pedido
      const { data: o, error: oErr } = await supabase
        .from("orders")
        .select(
          "id,status,notes,created_at,submitted_at,approved_at,is_paid,paid_at,payment_method,logistic_status,delivery_mode,freight_fee"
        )
        .eq("id", orderId)
        .maybeSingle();

      if (oErr || !o) {
        setMsg(oErr?.message || "Pedido não encontrado.");
        setLoading(false);
        return;
      }

      setOrder(o as OrderRow);

      // 2) itens + produto
      const { data: it, error: itErr } = await supabase
        .from("order_items")
        .select("id,qty,unit,unit_cost,product_id, products:products (sku,name,unit)")
        .eq("order_id", orderId);

      if (itErr) {
        setMsg(itErr.message);
        setLoading(false);
        return;
      }

      setItems((it ?? []) as ItemRow[]);
      setLoading(false);
    })();
  }, [orderId, router]);

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
            <h1 style={{ margin: 0, fontSize: 22 }}>Detalhe do pedido</h1>
            <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
              ID: <span style={{ fontFamily: styles.mono }}>{order?.id}</span>
            </div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={styles.secondaryBtn} onClick={() => router.push("/pedidos")}>
              ← Voltar
            </button>
            <button style={styles.primaryBtn} onClick={() => router.push("/pedido")}>
              + Novo pedido
            </button>
          </div>
        </div>

        {msg ? <div style={{ marginTop: 12, ...styles.err }}>{msg}</div> : null}

        {order ? (
          <>
            <div style={styles.metaGrid}>
              <div style={styles.metaBox}>
                <div style={styles.metaLabel}>Status</div>
                <div style={styles.metaValue}>{order.status}</div>
              </div>

              <div style={styles.metaBox}>
                <div style={styles.metaLabel}>Criado</div>
                <div style={styles.metaValue}>{fmtDT(order.created_at)}</div>
              </div>

              <div style={styles.metaBox}>
                <div style={styles.metaLabel}>Enviado</div>
                <div style={styles.metaValue}>{fmtDT(order.submitted_at)}</div>
              </div>

              <div style={styles.metaBox}>
                <div style={styles.metaLabel}>Aprovado</div>
                <div style={styles.metaValue}>{fmtDT(order.approved_at)}</div>
              </div>

              <div style={styles.metaBox}>
                <div style={styles.metaLabel}>Logística</div>
                <div style={styles.metaValue}>
                  <span style={styles.pill}>{logisticLabel(order.logistic_status)}</span>
                </div>
              </div>

              <div style={styles.metaBox}>
                <div style={styles.metaLabel}>Entrega</div>
                <div style={styles.metaValue}>{deliveryLabel(order.delivery_mode)}</div>
                <div style={{ marginTop: 6, color: "#777", fontSize: 12 }}>
                  Frete: {order.delivery_mode === "FRETE" ? fmtBRL(Number(order.freight_fee ?? 0)) : "—"}
                </div>
              </div>

              <div style={styles.metaBox}>
                <div style={styles.metaLabel}>Pagamento</div>
                <div style={styles.metaValue}>
                  {order.is_paid ? <span style={styles.badgeOk}>Pago</span> : <span style={styles.badgeNo}>Não pago</span>}
                </div>
                <div style={{ marginTop: 6, color: "#777", fontSize: 12 }}>
                  Data: {order.is_paid ? fmtDT(order.paid_at) : "—"}
                </div>
                <div style={{ marginTop: 4, color: "#777", fontSize: 12 }}>
                  Forma: {order.is_paid ? payMethodLabel(order.payment_method) : "—"}
                </div>
              </div>

              <div style={styles.metaBoxWide}>
                <div style={styles.metaLabel}>Observações</div>
                <div style={styles.metaValue}>{order.notes || "-"}</div>
              </div>
            </div>

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
                    const sku = it.products?.sku ?? "-";
                    const name = it.products?.name ?? "-";
                    const unit = it.products?.unit ?? it.unit ?? "-";
                    const unitCost = Number(it.unit_cost ?? 0);
                    const line = (it.qty ?? 0) * unitCost;

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
                <tfoot>
                  <tr>
                    <td style={styles.td} colSpan={5}>
                      <b>Itens</b>
                    </td>
                    <td style={styles.tdStrong}>{fmtBRL(itemsTotal)}</td>
                  </tr>
                  <tr>
                    <td style={styles.td} colSpan={5}>
                      <b>Frete</b>
                    </td>
                    <td style={styles.tdStrong}>{fmtBRL(freightApplied)}</td>
                  </tr>
                  <tr>
                    <td style={styles.td} colSpan={5}>
                      <b>Total</b>
                    </td>
                    <td style={styles.tdStrong}>{fmtBRL(grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> & { mono: string } = {
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  main: { minHeight: "100vh", background: "#f6f7fb", padding: 16 },
  card: {
    background: "#fff",
    border: "1px solid #e6e7ee",
    borderRadius: 14,
    padding: 14,
    boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
    width: "min(1100px, 100%)",
    margin: "0 auto",
  },

  headerRow: { display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },

  metaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(160px, 1fr))",
    gap: 10,
    marginTop: 12,
  },
  metaBox: {
    border: "1px solid #eee",
    borderRadius: 12,
    padding: 10,
    background: "#fafbff",
  },
  metaBoxWide: {
    gridColumn: "1 / -1",
    border: "1px solid #eee",
    borderRadius: 12,
    padding: 10,
    background: "#fafbff",
  },
  metaLabel: { fontSize: 12, color: "#666", fontWeight: 800 },
  metaValue: { marginTop: 6, fontSize: 14, fontWeight: 800, color: "#111" },

  pill: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #e6e7ee",
    background: "#fff",
    fontSize: 12,
    fontWeight: 900,
    color: "#111",
  },

  badgeOk: {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid #c8f1d6",
    background: "#eafff1",
    color: "#0f6b2e",
    fontWeight: 900,
    fontSize: 12,
  },
  badgeNo: {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid #ffd4d4",
    background: "#fff2f2",
    color: "#a40000",
    fontWeight: 900,
    fontSize: 12,
  },

  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0, marginTop: 6 },
  th: {
    textAlign: "left",
    padding: "10px 10px",
    fontSize: 12,
    color: "#555",
    borderBottom: "1px solid #eee",
    background: "#fafbff",
  },
  td: { padding: "10px 10px", borderBottom: "1px solid #f1f1f6" },
  tdStrong: { padding: "10px 10px", borderBottom: "1px solid #f1f1f6", fontWeight: 900 },
  tdMono: {
    padding: "10px 10px",
    borderBottom: "1px solid #f1f1f6",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 13,
  },

  primaryBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
  },
  secondaryBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
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