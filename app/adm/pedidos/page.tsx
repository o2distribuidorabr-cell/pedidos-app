"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type OrderRow = {
  id: string;
  created_at: string;
  status: string;
  logistic_status: string | null;

  is_paid: boolean | null;
  paid_at: string | null;
  payment_method: "PIX" | "CARTAO" | "BOLETO" | null;

  delivery_mode: "RETIRADA" | "FRETE" | null;
  freight_fee: number | null;

  store_id: string | null;
  store_name: string | null;

  total: number; // itens (view)
  total_with_freight: number; // itens + frete (view)
};

const STATUS_OPTIONS = ["draft", "submitted", "approved", "rejected"] as const;
const LOG_OPTIONS = ["RECEBIDO", "EM_SEPARACAO", "ENTREGUE"] as const;
const PAY_METHODS = ["PIX", "CARTAO", "BOLETO"] as const;

function fmtDateTimeBR(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function fmtDateBR(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

function fmtBRL(value: number) {
  try {
    return (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${value}`;
  }
}

function toISOStart(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 0, 0, 0);
  return dt.toISOString();
}

function toISOEnd(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 23, 59, 59);
  return dt.toISOString();
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

function deliveryLabel(v: OrderRow["delivery_mode"]) {
  return v === "FRETE" ? "Frete" : "Retirada";
}

export default function AdmPedidosPage() {
  const router = useRouter();

  const [userEmail, setUserEmail] = useState<string>("-");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // seleção
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // filtros
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [logFilter, setLogFilter] = useState<string>("all");
  const [paidFilter, setPaidFilter] = useState<string>("all"); // all | paid | unpaid
  const [q, setQ] = useState<string>("");

  // período
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const [savingId, setSavingId] = useState<string | null>(null);

  async function loadOrders() {
    setLoading(true);
    setErr(null);

    const { data, error } = await supabase
      .from("v_orders_admin_list")
      .select(`
        id,
        created_at,
        status,
        logistic_status,
        is_paid,
        paid_at,
        payment_method,
        delivery_mode,
        freight_fee,
        store_id,
        store_name,
        total,
        total_with_freight
      `)
      .order("created_at", { ascending: false });

    if (error) {
      setErr(error.message);
      setOrders([]);
    } else {
      setOrders((data as any) ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        router.push("/login");
        return;
      }
      setUserEmail(auth.user.email ?? "-");
      await loadOrders();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const fromISO = dateFrom ? toISOStart(dateFrom) : null;
    const toISO = dateTo ? toISOEnd(dateTo) : null;

    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (logFilter !== "all" && (o.logistic_status ?? "") !== logFilter) return false;

      const paid = !!o.is_paid;
      if (paidFilter === "paid" && !paid) return false;
      if (paidFilter === "unpaid" && paid) return false;

      if (qq) {
        const storeName = (o.store_name ?? "").toLowerCase();
        if (!storeName.includes(qq) && !o.id.toLowerCase().includes(qq)) return false;
      }

      if (fromISO && o.created_at < fromISO) return false;
      if (toISO && o.created_at > toISO) return false;

      return true;
    });
  }, [orders, statusFilter, logFilter, paidFilter, q, dateFrom, dateTo]);

  const totalGeral = useMemo(() => {
    return filtered.reduce((acc, o) => acc + (Number(o.total_with_freight) || 0), 0);
  }, [filtered]);

  function isAllFilteredSelected() {
    if (filtered.length === 0) return false;
    return filtered.every((o) => selected.has(o.id));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      const all = isAllFilteredSelected();
      if (all) {
        // desmarca todos do filtro
        filtered.forEach((o) => next.delete(o.id));
      } else {
        // marca todos do filtro
        filtered.forEach((o) => next.add(o.id));
      }
      return next;
    });
  }

  async function updateOrder(id: string, patch: any) {
    setSavingId(id);
    setErr(null);

    const { error } = await supabase.from("orders").update(patch).eq("id", id);

    if (error) {
      setErr(error.message);
      setSavingId(null);
      return;
    }

    await loadOrders();
    setSavingId(null);
  }

  async function togglePaid(o: OrderRow) {
    const isPaid = !!o.is_paid;
    if (isPaid) {
      await updateOrder(o.id, { is_paid: false, paid_at: null, payment_method: null });
    } else {
      await updateOrder(o.id, {
        is_paid: true,
        paid_at: new Date().toISOString(),
        payment_method: o.payment_method ?? "PIX",
      });
    }
  }

  async function setPaidDate(o: OrderRow, dateStr: string) {
    if (!dateStr) {
      await updateOrder(o.id, { paid_at: null });
      return;
    }
    await updateOrder(o.id, { paid_at: dateInputToISO(dateStr), is_paid: true });
  }

  async function setPayMethod(o: OrderRow, method: string) {
    await updateOrder(o.id, { payment_method: method, is_paid: true });
  }

  async function deleteSelected() {
    if (selected.size === 0) return;

    const ids = Array.from(selected);
    const ok = window.confirm(
      `Tem certeza que deseja excluir ${ids.length} pedido(s)?\n\nIsso remove do Admin e do Franqueado.`
    );
    if (!ok) return;

    setDeleting(true);
    setErr(null);

    // 1) Excluir itens (ok se alguns pedidos não tiverem itens)
    const delItems = await supabase
      .from("order_items")
      .delete({ count: "exact" })
      .in("order_id", ids);

    if (delItems.error) {
      setErr(`Erro ao excluir itens: ${delItems.error.message}`);
      setDeleting(false);
      return;
    }

    // 2) Excluir pedidos (aqui precisa apagar >0)
    const delOrders = await supabase
      .from("orders")
      .delete({ count: "exact" })
      .in("id", ids);

    if (delOrders.error) {
      setErr(`Erro ao excluir pedidos: ${delOrders.error.message}`);
      setDeleting(false);
      return;
    }

    const deletedCount = delOrders.count ?? 0;

    // ✅ Se RLS bloquear, vem count 0 sem erro
    if (deletedCount === 0) {
      setErr(
        "Nenhum pedido foi excluído (apagou 0). Isso indica bloqueio de permissão/RLS para DELETE em orders. " +
          "Rode o SQL do is_admin() (security definer) que eu te mandei e confirme que seu profiles.role = 'admin'."
      );
      setDeleting(false);
      return;
    }

    // limpa seleção e recarrega
    setSelected(new Set());
    await loadOrders();
    setDeleting(false);
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        {/* TOPO */}
        <div style={styles.topbar}>
          <div>
            <div style={styles.smallMuted}>Usuário</div>
            <div style={styles.topValue}>{userEmail}</div>
          </div>

          <div>
            <div style={styles.smallMuted}>Portal</div>
            <div style={styles.topValue}>Administrativo</div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button style={styles.secondaryBtn} onClick={loadOrders} disabled={loading || deleting}>
              Atualizar
            </button>

            <button
              style={{
                ...styles.dangerBtn,
                opacity: selected.size === 0 || deleting ? 0.5 : 1,
                cursor: selected.size === 0 || deleting ? "not-allowed" : "pointer",
              }}
              onClick={deleteSelected}
              disabled={selected.size === 0 || deleting}
              title={selected.size === 0 ? "Selecione pedidos para excluir" : "Excluir selecionados"}
            >
              Excluir ({selected.size})
            </button>
          </div>
        </div>

        <hr style={styles.hr} />

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20 }}>Pedidos (Admin)</h1>
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              Total por pedido + total geral. Edição rápida de status/logística/pagamento.
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800 }}>
            <input type="checkbox" checked={isAllFilteredSelected()} onChange={toggleSelectAllFiltered} />
            Selecionar todos (no filtro)
          </label>
        </div>

        {/* Filtros */}
        <div style={styles.filters}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por loja ou ID..."
            style={styles.input}
          />

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={styles.select}>
            <option value="all">Status: todos</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select value={logFilter} onChange={(e) => setLogFilter(e.target.value)} style={styles.select}>
            <option value="all">Logística: todos</option>
            {LOG_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select value={paidFilter} onChange={(e) => setPaidFilter(e.target.value)} style={styles.select}>
            <option value="all">Pago: todos</option>
            <option value="paid">Somente pagos</option>
            <option value="unpaid">Somente não pagos</option>
          </select>

          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={styles.select} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={styles.select} />
        </div>

        {loading ? <p style={{ marginTop: 12 }}>Carregando...</p> : null}

        {err ? (
          <div style={{ marginTop: 12, ...styles.errBox }}>
            <b>Erro:</b> {err}
          </div>
        ) : null}

        {!loading && !err && filtered.length === 0 ? <p style={{ marginTop: 12 }}>Nenhum pedido encontrado.</p> : null}

        {!loading && filtered.length > 0 ? (
          <>
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {filtered.map((o) => {
                const saving = savingId === o.id;
                const delivery = deliveryLabel(o.delivery_mode);
                const freightValue = Number(o.freight_fee ?? 0);
                const freightLabel = o.delivery_mode === "FRETE" ? fmtBRL(freightValue) : "—";

                const totalItens = Number(o.total) || 0;
                const totalComFrete = Number(o.total_with_freight) || 0;

                const paidDateStr = isoToDateInput(o.paid_at);
                const checked = selected.has(o.id);

                return (
                  <div
                    key={o.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "34px 280px 150px 180px 190px 230px 120px",
                      gap: 10,
                      alignItems: "center",
                      padding: 12,
                      border: "1px solid #e5e7eb",
                      borderRadius: 14,
                      background: "white",
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(o.id)}
                        disabled={deleting}
                        title="Selecionar"
                      />
                    </div>

                    {/* Loja + data + totais + entrega */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {o.store_name ?? "Loja não vinculada"}
                        </div>

                        <div style={{ fontWeight: 900 }}>{fmtBRL(totalComFrete)}</div>
                      </div>

                      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                        Itens: <b>{fmtBRL(totalItens)}</b> · Frete: <b>{freightLabel}</b>
                      </div>

                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{fmtDateTimeBR(o.created_at)}</div>

                      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                        <b>Entrega:</b> {delivery}
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          opacity: 0.6,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        ID: {o.id}
                      </div>
                    </div>

                    {/* Status */}
                    <div>
                      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Status</div>
                      <select
                        value={o.status}
                        disabled={saving || deleting}
                        onChange={(e) => updateOrder(o.id, { status: e.target.value })}
                        style={styles.selectFull}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    {/* Logística */}
                    <div>
                      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Logística</div>
                      <select
                        value={(o.logistic_status ?? LOG_OPTIONS[0]) as any}
                        disabled={saving || deleting}
                        onChange={(e) => updateOrder(o.id, { logistic_status: e.target.value })}
                        style={styles.selectFull}
                      >
                        {LOG_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    {/* Pagamento */}
                    <div>
                      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Pagamento</div>

                      <button
                        onClick={() => togglePaid(o)}
                        disabled={saving || deleting}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid #e5e7eb",
                          background: o.is_paid ? "#ecfdf5" : "white",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <b>{o.is_paid ? "Pago" : "Não pago"}</b>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{o.paid_at ? fmtDateBR(o.paid_at) : "—"}</div>
                      </button>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                        <input
                          type="date"
                          value={paidDateStr}
                          disabled={saving || deleting || !o.is_paid}
                          onChange={(e) => setPaidDate(o, e.target.value)}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1px solid #e5e7eb",
                            background: !o.is_paid ? "#f9fafb" : "white",
                          }}
                        />

                        <select
                          value={o.payment_method ?? "PIX"}
                          disabled={saving || deleting || !o.is_paid}
                          onChange={(e) => setPayMethod(o, e.target.value)}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1px solid #e5e7eb",
                            background: !o.is_paid ? "#f9fafb" : "white",
                          }}
                        >
                          {PAY_METHODS.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Ação */}
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <Link
                        href={`/adm/pedidos/${o.id}`}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid #d1d5db",
                          textDecoration: "none",
                          color: "inherit",
                          background: "white",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Abrir
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Rodapé total geral */}
            <div style={styles.footerTotal}>
              <div style={{ fontSize: 13, opacity: 0.75 }}>{filtered.length} pedido(s) no filtro atual</div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Total geral (c/ frete): {fmtBRL(totalGeral)}</div>
            </div>
          </>
        ) : null}
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
    width: "min(1300px, 100%)",
    margin: "0 auto",
  },

  topbar: { display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" },
  smallMuted: { fontSize: 12, color: "#777", fontWeight: 700 },
  topValue: { fontSize: 14, fontWeight: 900, color: "#111" },
  hr: { border: 0, borderTop: "1px solid #eee", margin: "12px 0" },

  secondaryBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 900,
  },

  dangerBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #b91c1c",
    background: "#b91c1c",
    color: "white",
    fontSize: 14,
    fontWeight: 900,
  },

  filters: {
    display: "grid",
    gridTemplateColumns: "1fr 160px 180px 160px 150px 150px",
    gap: 10,
    alignItems: "center",
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    background: "white",
    marginTop: 12,
  },
  input: { padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb", outline: "none" },
  select: { padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" },
  selectFull: { width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #e5e7eb" },

  errBox: { padding: 12, border: "1px solid #fecaca", borderRadius: 12, background: "#fff1f2" },

  footerTotal: {
    marginTop: 12,
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    background: "white",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
};