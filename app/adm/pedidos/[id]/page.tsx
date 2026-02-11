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

type ProductEmbed = { sku: string | null; name: string | null; unit: string | null };

type ItemRow = {
  id: string;
  qty: number;
  unit: string | null;
  unit_cost: number | null;
  product_id: string;
  products: ProductEmbed | null;
};

const STATUS_OPTIONS = ["draft", "submitted", "approved", "rejected"] as const;
const LOG_OPTIONS = ["RECEBIDO", "EM_SEPARACAO", "ENTREGUE"] as const;
const PAY_METHODS = ["PIX", "CARTAO", "BOLETO"] as const;
const DELIVERY_OPTIONS = ["RETIRADA", "FRETE"] as const;

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
function isoToDateInput(iso: string | null) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}
function dateInputToISO(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  return dt.toISOString();
}

export default function AdmPedidoDetalhePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

    const { data: it, error: itErr } = await supabase
      .from("order_items")
      // IMPORTANTE: o PostgREST pode retornar products como ARRAY; vamos normalizar abaixo
      .select("id,qty,unit,unit_cost,product_id, products:products (sku,name,unit)")
      .eq("order_id", id);

    if (itErr) {
      setMsg(itErr.message);
      setItems([]);
      return;
    }

    // ✅ Normaliza products: se vier array, pega o primeiro; se vier objeto, mantém; se vier null, null.
    const normalized: ItemRow[] = (it ?? []).map((row: any) => {
      const raw = row?.products;
      const prod: ProductEmbed | null = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);

      return {
        id: row.id,
        qty: row.qty,
        unit: row.unit ?? null,
        unit_cost: row.unit_cost ?? null,
        product_id: row.product_id,
        products: prod,
      };
    });

    setItems(normalized);
  }

  async function updateOrder(patch: Partial<OrderRow>) {
    if (!order) return;
    setSaving(true);
    setMsg("");

    const { data, error } = await supabase
      .from("orders")
      .update(patch)
      .eq("id", order.id)
      .select(
        "id,store_id,status,notes,created_at,submitted_at,approved_at,logistic_status,is_paid,paid_at,payment_method,delivery_mode,freight_fee"
      )
      .single();

    if (error) {
      setMsg(error.message);
      setSaving(false);
      return;
    }

    setOrder(data as OrderRow);
    setSaving(false);
  }

  async function onTogglePaid() {
    if (!order) return;
    const paid = !!order.is_paid;

    if (paid) {
      await updateOrder({ is_paid: false, paid_at: null, payment_method: null });
    } else {
      await updateOrder({
        is_paid: true,
        paid_at: new Date().toISOString(),
        payment_method: order.payment_method ?? "PIX",
      });
    }
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
          <button style={styles.secondaryBtn} onClick={() => router.push("/adm/pedidos")}>
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
            <h1 style={{ margin: 0, fontSize: 22 }}>Detalhe do pedido (Admin)</h1>
            <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
              ID: <span style={styles.mono}>{order.id}</span>
            </div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={styles.secondaryBtn} onClick={() => router.push("/adm/pedidos")}>
              ← Voltar
            </button>
            <button style={styles.secondaryBtn} onClick={() => loadAll(order.id)} disabled={saving}>
              Recarregar
            </button>
          </div>
        </div>

        {msg ? <div style={{ marginTop: 12, ...styles.err }}>{msg}</div> : null}

        {/* Controles */}
        <div style={styles.grid6}>
          <div style={styles.box}>
            <div style={styles.label}>Status</div>
            <select
              value={order.status}
              disabled={saving}
              onChange={(e) => updateOrder({ status: e.target.value })}
              style={styles.select}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.box}>
            <div style={styles.label}>Logística</div>
            <select
              value={(order.logistic_status ?? "RECEBIDO") as any}
              disabled={saving}
              onChange={(e) => updateOrder({ logistic_status: e.target.value as any })}
              style={styles.select}
            >
              {LOG_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.box}>
            <div style={styles.label}>Entrega</div>
            <select
              value={(order.delivery_mode ?? "RETIRADA") as any}
              disabled={saving}
              onChange={(e) => updateOrder({ delivery_mode: e.target.value as any })}
              style={styles.select}
            >
              {DELIVERY_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div style={styles.help}>
              {order.delivery_mode === "FRETE" ? "Frete será somado ao total." : "Frete não conta."}
            </div>
          </div>

          <div style={styles.box}>
            <div style={styles.label}>Frete (R$)</div>
            <input
              type="number"
              step="0.01"
              value={Number(order.freight_fee ?? 0)}
              disabled={saving || order.delivery_mode !== "FRETE"}
              onChange={(e) => updateOrder({ freight_fee: Number(e.target.value) })}
              style={{
                ...styles.input,
                background: order.delivery_mode !== "FRETE" ? "#f3f4f6" : "white",
              }}
            />
            <div style={styles.help}>
              {order.delivery_mode !== "FRETE" ? "Somente para Frete." : "Ex.: 65,00"}
            </div>
          </div>

          <div style={styles.box}>
            <div style={styles.label}>Pagamento</div>
            <button
              onClick={onTogglePaid}
              disabled={saving}
              style={{
                ...styles.payBtn,
                background: order.is_paid ? "#ecfdf5" : "white",
              }}
            >
              <b>{order.is_paid ? "Pago" : "Não pago"}</b>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{order.paid_at ? fmtDT(order.paid_at) : "—"}</div>
            </button>
          </div>

          <div style={styles.box}>
            <div style={styles.label}>Data pagamento / forma</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input
                type="date"
                value={isoToDateInput(order.paid_at)}
                disabled={saving || !order.is_paid}
                onChange={(e) =>
                  updateOrder({
                    paid_at: e.target.value ? dateInputToISO(e.target.value) : null,
                    is_paid: true,
                  })
                }
                style={{
                  ...styles.input,
                  background: !order.is_paid ? "#f3f4f6" : "white",
                }}
              />

              <select
                value={order.payment_method ?? "PIX"}
                disabled={saving || !order.is_paid}
                onChange={(e) => updateOrder({ payment_method: e.target.value as any, is_paid: true })}
                style={{
                  ...styles.select,
                  background: !order.is_paid ? "#f3f4f6" : "white",
                }}
              >
                {PAY_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
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

        {/* Observações */}
        <div style={{ marginTop: 12 }}>
          <div style={styles.label}>Observações</div>
          <textarea
            value={order.notes ?? ""}
            disabled={saving}
            onChange={(e) => updateOrder({ notes: e.target.value })}
            placeholder="Observações do pedido..."
            style={styles.textarea}
          />
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
                const sku = it.products?.sku ?? "-";
                const name = it.products?.name ?? "-";
                const unit = it.products?.unit ?? it.unit ?? "-";
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

        <div style={{ marginTop: 12, color: "#666", fontSize: 12 }}>
          Criado: {fmtDT(order.created_at)} · Enviado: {fmtDT(order.submitted_at)} · Aprovado: {fmtDT(order.approved_at)}
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

  // ✅ RESPONSIVO: não estoura no mobile
  grid6: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
  },

  box: { border: "1px solid #eee", borderRadius: 12, padding: 10, background: "#fafbff" },
  label: { fontSize: 12, color: "#666", fontWeight: 900, marginBottom: 6 },

  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "white",
    fontWeight: 800,
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "white",
    fontWeight: 800,
    outline: "none",
  },
  help: { marginTop: 6, fontSize: 12, color: "#777" },

  payBtn: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    cursor: "pointer",
    textAlign: "left",
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

  textarea: {
    width: "100%",
    minHeight: 90,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    outline: "none",
    fontSize: 14,
    resize: "vertical",
    background: "white",
  },

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