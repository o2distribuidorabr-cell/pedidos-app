"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type CartItem = {
  product_id: string;
  sku: string;
  name: string;
  unit: string;
  unit_cost: number;
  qty: number;
};

type StoreRow = {
  id: string;
  name: string;
};

type DeliveryInfo = {
  delivery_mode: "RETIRADA" | "FRETE";
  freight_fee: number;
  store_name?: string;
};

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ConfirmarPedidoPage() {
  const router = useRouter();

  const [items, setItems] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  const [userEmail, setUserEmail] = useState<string>("-");
  const [storeName, setStoreName] = useState<string>("-");
  const [storeId, setStoreId] = useState<string | null>(null);

  // NOVO: entrega/frete
  const [deliveryMode, setDeliveryMode] = useState<"RETIRADA" | "FRETE">("RETIRADA");
  const [freightFee, setFreightFee] = useState<number>(0);

  const itemsTotal = useMemo(() => {
    return items.reduce((acc, it) => acc + it.qty * it.unit_cost, 0);
  }, [items]);

  const freightApplied = useMemo(() => (deliveryMode === "FRETE" ? freightFee : 0), [deliveryMode, freightFee]);

  const grandTotal = useMemo(() => itemsTotal + freightApplied, [itemsTotal, freightApplied]);

  useEffect(() => {
    (async () => {
      setMsg("");
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;

      if (!user) {
        router.push("/login");
        return;
      }

      setUserEmail(user.email ?? "-");

      // carrinho
      const raw = localStorage.getItem("cart_items");
      const parsed = raw ? (JSON.parse(raw) as CartItem[]) : [];
      setItems(parsed);

      // NOVO: delivery_info
      const rawDelivery = localStorage.getItem("delivery_info");
      const dParsed = rawDelivery ? (JSON.parse(rawDelivery) as Partial<DeliveryInfo>) : null;

      const dMode =
        dParsed?.delivery_mode === "FRETE" || dParsed?.delivery_mode === "RETIRADA"
          ? dParsed.delivery_mode
          : "RETIRADA";

      const dFreight = Number(dParsed?.freight_fee ?? 0);

      setDeliveryMode(dMode);
      setFreightFee(dFreight);

      // buscar store_id do profile e nome da loja na tabela stores
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("id", user.id)
        .maybeSingle();

      if (pErr) {
        setMsg(pErr.message);
        setLoading(false);
        return;
      }

      const sId = (profile?.store_id as string | null) ?? null;
      setStoreId(sId);

      if (!sId) {
        setStoreName("Sem loja vinculada");
        setLoading(false);
        return;
      }

      const { data: store, error: sErr } = await supabase
        .from("stores")
        .select("id, name")
        .eq("id", sId)
        .maybeSingle();

      if (sErr) {
        setMsg(sErr.message);
        setLoading(false);
        return;
      }

      const st = (store ?? null) as StoreRow | null;
      setStoreName(st?.name ?? "Loja não encontrada");
      setLoading(false);
    })();
  }, [router]);

  async function onLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function onSubmit() {
    setMsg("");

    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;

    if (!user) {
      router.push("/login");
      return;
    }

    if (!storeId) {
      setMsg("Seu usuário não tem loja vinculada (profiles.store_id).");
      return;
    }

    if (items.length === 0) {
      setMsg("Carrinho vazio.");
      return;
    }

    setSending(true);

    const now = new Date().toISOString();
    const status = "submitted";

    const delivery_mode: "RETIRADA" | "FRETE" = deliveryMode;
    const freight_fee = delivery_mode === "FRETE" ? Number(freightFee || 0) : 0;

    // 1) cria pedido (AGORA COM delivery_mode e freight_fee)
    const { data: orderInserted, error: orderError } = await supabase
      .from("orders")
      .insert({
        store_id: storeId,
        status,
        notes: notes || null,
        created_by: user.id,
        created_at: now,
        submitted_at: now,
        approved_at: null,

        delivery_mode,
        freight_fee,
      })
      .select("id")
      .single();

    if (orderError || !orderInserted?.id) {
      setSending(false);
      setMsg(orderError?.message || "Erro ao criar pedido.");
      return;
    }

    const order_id = orderInserted.id as string;

    // 2) cria itens
    const rows = items.map((it) => ({
      order_id,
      product_id: it.product_id,
      qty: it.qty,
      unit: it.unit,
      unit_cost: it.unit_cost,
      created_at: now,
    }));

    const { error: itemsError } = await supabase.from("order_items").insert(rows);

    if (itemsError) {
      setSending(false);
      setMsg(itemsError.message);
      return;
    }

    localStorage.removeItem("cart_items");
    localStorage.removeItem("delivery_info");

    setSending(false);
    router.push("/pedidos");
  }

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
        {/* Top bar */}
        <div style={styles.topbar}>
          <div>
            <div style={styles.smallMuted}>Usuário</div>
            <div style={styles.topValue}>{userEmail}</div>
          </div>

          <div>
            <div style={styles.smallMuted}>Loja</div>
            <div style={styles.topValue}>{storeName}</div>
          </div>

          <div style={{ marginLeft: "auto" }}>
            <button style={styles.logoutBtn} onClick={onLogout}>
              Sair
            </button>
          </div>
        </div>

        <hr style={styles.hr} />

        <h1 style={{ margin: 0, fontSize: 22 }}>Confirmar pedido</h1>
        <p style={{ marginTop: 6, color: "#555" }}>Confira os itens antes de enviar.</p>

        {items.length === 0 ? (
          <div style={styles.box}>
            Seu carrinho está vazio.{" "}
            <button style={styles.linkLike} onClick={() => router.push("/pedido")}>
              Voltar para pedido
            </button>
          </div>
        ) : (
          <>
            {/* NOVO: resumo entrega/frete */}
            <div style={{ ...styles.box, marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={styles.smallMuted}>Entrega</div>
                  <div style={{ fontWeight: 900, color: "#111" }}>
                    {deliveryMode === "FRETE" ? "Frete" : "Retirada"}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={styles.smallMuted}>Frete</div>
                  <div style={{ fontWeight: 900, color: "#111" }}>{money(freightApplied)}</div>
                </div>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>
                O total do pedido inclui o frete somente quando “Frete” estiver selecionado.
              </div>
            </div>

            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>SKU</th>
                    <th style={styles.th}>Nome</th>
                    <th style={styles.th}>Unid.</th>
                    <th style={styles.th}>Preço</th>
                    <th style={styles.th}>Qtd</th>
                    <th style={styles.th}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const line = it.qty * it.unit_cost;
                    return (
                      <tr key={it.product_id}>
                        <td style={styles.tdMono}>{it.sku}</td>
                        <td style={styles.td}>{it.name}</td>
                        <td style={styles.td}>{it.unit}</td>
                        <td style={styles.td}>R$ {it.unit_cost.toFixed(2)}</td>
                        <td style={styles.tdStrong}>{it.qty}</td>
                        <td style={styles.tdStrong}>R$ {line.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* NOVO: totais */}
            <div style={{ ...styles.box, marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ color: "#555" }}>
                  Itens: <b>{money(itemsTotal)}</b> · Frete: <b>{money(freightApplied)}</b>
                </div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Total: {money(grandTotal)}</div>
              </div>
            </div>

            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              <label style={{ fontSize: 13, color: "#444", fontWeight: 700 }}>
                Observações (opcional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={styles.textarea}
                placeholder="Ex.: entregar até sexta-feira; substituir item X se faltar..."
              />
            </div>

            <div style={styles.actions}>
              <button style={styles.secondaryBtn} onClick={() => router.push("/pedido")}>
                ← Voltar
              </button>

              <button style={styles.primaryBtn} onClick={onSubmit} disabled={sending}>
                {sending ? "Enviando..." : `Enviar pedido (${money(grandTotal)})`}
              </button>
            </div>

            {msg ? <div style={{ marginTop: 12, ...styles.err }}>{msg}</div> : null}
          </>
        )}
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
    width: "min(1100px, 100%)",
    margin: "0 auto",
  },

  topbar: {
    display: "flex",
    gap: 14,
    alignItems: "flex-end",
    flexWrap: "wrap",
  },
  smallMuted: { fontSize: 12, color: "#777", fontWeight: 700 },
  topValue: { fontSize: 14, fontWeight: 800, color: "#111" },
  logoutBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
  },
  hr: { border: 0, borderTop: "1px solid #eee", margin: "12px 0" },

  box: { marginTop: 10, padding: 12, border: "1px solid #eee", borderRadius: 12, background: "#fff" },

  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0 },
  th: {
    textAlign: "left",
    padding: "10px 10px",
    fontSize: 12,
    color: "#555",
    borderBottom: "1px solid #eee",
    background: "#fafbff",
  },
  td: { padding: "10px 10px", borderBottom: "1px solid #f1f1f6" },
  tdStrong: { padding: "10px 10px", borderBottom: "1px solid #f1f1f6", fontWeight: 800 },
  tdMono: {
    padding: "10px 10px",
    borderBottom: "1px solid #f1f1f6",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 13,
  },

  textarea: {
    width: "100%",
    minHeight: 90,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    outline: "none",
    fontSize: 14,
    resize: "vertical",
  },

  actions: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 12,
    flexWrap: "wrap",
  },
  primaryBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 700,
  },
  secondaryBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 700,
  },
  linkLike: {
    border: "none",
    background: "transparent",
    color: "#111",
    fontWeight: 800,
    cursor: "pointer",
    textDecoration: "underline",
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