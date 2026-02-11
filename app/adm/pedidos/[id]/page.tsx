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

  credit_applied: number | null;
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
  return (Number(v ?? 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

  const [creditBalance, setCreditBalance] = useState<number>(0);

  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState<string>("");
  const [creditNote, setCreditNote] = useState<string>("");

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

  const creditApplied = useMemo(() => Number(order?.credit_applied ?? 0), [order?.credit_applied]);

  const totalLiquido = useMemo(() => {
    return Math.max(totalComFrete - creditApplied, 0);
  }, [totalComFrete, creditApplied]);

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

  async function loadCreditBalance(storeId: string) {
    const { data, error } = await supabase
      .from("v_store_credit_balance")
      .select("balance")
      .eq("store_id", storeId)
      .maybeSingle();

    if (error) {
      console.warn("loadCreditBalance error:", error.message);
      setCreditBalance(0);
      return;
    }

    setCreditBalance(Number((data as any)?.balance ?? 0));
  }

  async function loadAll(id: string) {
    const { data: o, error: oErr } = await supabase
      .from("orders")
      .select(
        "id,store_id,status,notes,created_at,submitted_at,approved_at,logistic_status,is_paid,paid_at,payment_method,delivery_mode,freight_fee,credit_applied"
      )
      .eq("id", id)
      .maybeSingle();

    if (oErr || !o) {
      setMsg(oErr?.message || "Pedido não encontrado.");
      setOrder(null);
      setItems([]);
      setCreditBalance(0);
      return;
    }

    const ord = o as OrderRow;
    setOrder(ord);

    if (ord.store_id) {
      await loadCreditBalance(ord.store_id);
    } else {
      setCreditBalance(0);
    }

    const { data: it, error: itErr } = await supabase
      .from("order_items")
      .select("id,qty,unit,unit_cost,product_id, products:products (sku,name,unit)")
      .eq("order_id", id);

    if (itErr) {
      setMsg(itErr.message);
      setItems([]);
      return;
    }

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
        "id,store_id,status,notes,created_at,submitted_at,approved_at,logistic_status,is_paid,paid_at,payment_method,delivery_mode,freight_fee,credit_applied"
      )
      .single();

    if (error) {
      setMsg(error.message);
      setSaving(false);
      return;
    }

    const ord = data as OrderRow;
    setOrder(ord);

    if (ord.store_id) {
      await loadCreditBalance(ord.store_id);
    }

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

  function openCreditModal() {
    setCreditAmount("");
    setCreditNote("");
    setCreditModalOpen(true);
    setMsg("");
  }
  function closeCreditModal() {
    setCreditModalOpen(false);
  }

  async function applyCredit() {
    if (!order?.id || !order.store_id) return;

    setSaving(true);
    setMsg("");

    let amt: number | null = null;
    if (creditAmount.trim() !== "") {
      const parsed = Number(creditAmount.replace(",", "."));
      if (Number.isNaN(parsed) || parsed <= 0) {
        setSaving(false);
        setMsg("Valor inválido. Use número maior que zero (ex.: 200 ou 200.00).");
        return;
      }
      amt = parsed;
    }

    const { data, error } = await supabase.rpc("apply_store_credit_to_order", {
      p_order_id: order.id,
      p_amount: amt,
      p_note: creditNote.trim() || null,
    });

    if (error) {
      setSaving(false);
      setMsg(`Erro ao aplicar crédito: ${error.message}`);
      return;
    }

    const applied = Number(data ?? 0);

    closeCreditModal();

    await loadAll(order.id);

    setSaving(false);
    setMsg(applied > 0 ? `Crédito abatido: ${fmtBRL(applied)}.` : "Nenhum crédito abatido (sem saldo ou pedido já quitado).");
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

        <div style={styles.creditBar}>
          <div>
            <div style={{ fontSize: 12, color: "#666", fontWeight: 900 }}>Crédito da loja</div>
            <div style={{ fontSize: 18, fontWeight: 1000 as any }}>{fmtBRL(creditBalance)}</div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "#666", fontWeight: 900 }}>Crédito abatido neste pedido</div>
              <div style={{ fontSize: 16, fontWeight: 900 }}>{fmtBRL(creditApplied)}</div>
            </div>

            <button
              style={{
                ...styles.primaryBtn,
                opacity: creditBalance <= 0 ? 0.5 : 1,
                cursor: creditBalance <= 0 ? "not-allowed" : "pointer",
              }}
              disabled={saving || creditBalance <= 0}
              onClick={openCreditModal}
            >
              Abater do crédito
            </button>
          </div>
        </div>

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
            <div style={styles.help}>{order.delivery_mode === "FRETE" ? "Frete será somado ao total." : "Frete não conta."}</div>
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
            <div style={styles.help}>{order.delivery_mode !== "FRETE" ? "Somente para Frete." : "Ex.: 65,00"}</div>
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

        <div style={styles.summaryRow}>
          <div style={styles.sumBox}>
            <div style={styles.sumLabel}>Itens</div>
            <div style={styles.sumValue}>{fmtBRL(totalItens)}</div>
          </div>
          <div style={styles.sumBox}>
            <div style={styles.sumLabel}>Frete</div>
            <div style={styles.sumValue}>{fmtBRL(frete)}</div>
          </div>

          <div style={styles.sumBox}>
            <div style={styles.sumLabel}>Crédito abatido</div>
            <div style={styles.sumValue}>- {fmtBRL(creditApplied)}</div>
          </div>

          <div style={styles.sumBoxStrong}>
            <div style={styles.sumLabel}>Total líquido</div>
            <div style={styles.sumValueStrong}>{fmtBRL(totalLiquido)}</div>
          </div>
        </div>

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

      {creditModalOpen ? (
        <div style={styles.modalBackdrop} onClick={closeCreditModal}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Abater crédito</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  Saldo: <b>{fmtBRL(creditBalance)}</b> · Já abatido no pedido: <b>{fmtBRL(creditApplied)}</b>
                </div>
              </div>
              <button style={styles.secondaryBtn} onClick={closeCreditModal} disabled={saving}>
                Fechar
              </button>
            </div>

            <label style={styles.label}>Valor (opcional)</label>
            <input
              style={styles.input}
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              placeholder="Vazio = abater o máximo possível"
              disabled={saving}
            />

            <label style={styles.label}>Observação (opcional)</label>
            <input
              style={styles.input}
              value={creditNote}
              onChange={(e) => setCreditNote(e.target.value)}
              placeholder="Ex.: abatimento parcial"
              disabled={saving}
            />

            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button style={styles.primaryBtn} onClick={applyCredit} disabled={saving}>
                {saving ? "Aplicando..." : "Aplicar crédito"}
              </button>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
              Regra: abate até o limite do saldo e até o limite do total do pedido.
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
    width: "min(1200px, 100%)",
    margin: "0 auto",
  },

  headerRow: { display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },
  mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },

  creditBar: {
    marginTop: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 12,
    background: "#ffffff",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
  },

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
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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

  err: {
    padding: 10,
    background: "#fff2f2",
    border: "1px solid #ffd0d0",
    borderRadius: 10,
    color: "#a40000",
    fontSize: 13,
  },

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
    width: "min(560px, 100%)",
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #e6e7ee",
    boxShadow: "0 20px 50px rgba(0,0,0,0.20)",
    padding: 14,
  },
};