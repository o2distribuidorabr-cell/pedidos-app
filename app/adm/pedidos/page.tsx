"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { PageHeader, Card, Button, Input, Select, Badge } from "@/app/components/ui";

type PaymentMethod = "PIX" | "CARTAO" | "BOLETO";
type DeliveryMode = "RETIRADA" | "FRETE";

type OrderRow = {
  id: string;
  created_at: string;
  status: string;
  logistic_status: string | null;
  is_paid: boolean | null;
  paid_at: string | null;
  payment_method: PaymentMethod | null;
  delivery_mode: DeliveryMode | null;
  freight_fee: number | null;
  store_name: string | null;
  total: number;
  total_with_freight: number;

  // ✅ vencimento (precisa existir em orders e na view v_orders_admin_list)
  due_date: string | null; // DATE => "YYYY-MM-DD"

  // ✅ NOVO (Opção A): vínculo de desmembramento (precisa existir na view v_orders_admin_list)
  parent_order_id?: string | null;
  split_group_id?: string | null;
  is_split_child?: boolean | null;
};

const STATUS_OPTIONS = ["draft", "submitted", "approved", "rejected"] as const;
const LOG_OPTIONS = ["RECEBIDO", "EM_SEPARACAO", "ENTREGUE"] as const;

type TabKey = "OPEN" | "DELIVERED";

function fmtBRL(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtDT(v: string) {
  return new Date(v).toLocaleString("pt-BR");
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isPastDateYMD(ymd: string) {
  const t = todayYMD();
  return ymd < t;
}

type OrdersAdminListRow = OrderRow;

function isOrdersAdminListRowArray(v: unknown): v is OrdersAdminListRow[] {
  return Array.isArray(v);
}

export default function AdmPedidosPage() {
  const router = useRouter();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const [tab, setTab] = useState<TabKey>("OPEN");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  async function loadOrders() {
    setLoading(true);

    const { data, error } = await supabase
      .from("v_orders_admin_list")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("loadOrders error:", error);
      setOrders([]);
      setLoading(false);
      return;
    }

    const safe = isOrdersAdminListRowArray(data) ? data : [];
    setOrders(safe);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        router.push("/login");
        return;
      }
      await loadOrders();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ separa por aba (ENTREGUE vai pra aba "Entregues")
  const ordersByTab = useMemo(() => {
    const delivered = orders.filter((o) => (o.logistic_status ?? "") === "ENTREGUE");
    const open = orders.filter((o) => (o.logistic_status ?? "") !== "ENTREGUE");
    return { open, delivered };
  }, [orders]);

  const counts = useMemo(() => {
    return {
      open: ordersByTab.open.length,
      delivered: ordersByTab.delivered.length,
    };
  }, [ordersByTab]);

  // ✅ aplica busca dentro da aba atual
  const filtered = useMemo(() => {
    const base = tab === "DELIVERED" ? ordersByTab.delivered : ordersByTab.open;

    const qq = q.trim().toLowerCase();
    if (!qq) return base;

    return base.filter(
      (o) =>
        o.id.toLowerCase().includes(qq) ||
        (o.store_name ?? "").toLowerCase().includes(qq)
    );
  }, [ordersByTab, tab, q]);

  // ✅ limpa seleção quando troca aba (evita excluir coisas “invisíveis”)
  useEffect(() => {
    setSelected(new Set());
  }, [tab]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function deleteSelected() {
    if (selected.size === 0) return;

    const ok = confirm(`Excluir ${selected.size} pedido(s)?`);
    if (!ok) return;

    setDeleting(true);
    const ids = Array.from(selected);

    const delItems = await supabase.from("order_items").delete().in("order_id", ids);
    if (delItems.error) console.error("delete order_items error:", delItems.error);

    const delOrders = await supabase.from("orders").delete().in("id", ids);
    if (delOrders.error) console.error("delete orders error:", delOrders.error);

    setSelected(new Set());
    await loadOrders();
    setDeleting(false);
  }

  async function updateOrder(id: string, patch: Partial<OrderRow>) {
    const { error } = await supabase.from("orders").update(patch).eq("id", id);
    if (error) console.error("updateOrder error:", error);

    // ✅ melhor UX: atualiza localmente antes e depois sincroniza
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? ({ ...o, ...patch } as OrderRow) : o))
    );

    // garante que view/refetch reflita tudo (totais, store_name, etc.)
    await loadOrders();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pedidos"
        subtitle="Gerenciamento administrativo de pedidos"
        right={
          <>
            <Button
              variant="danger"
              disabled={selected.size === 0 || deleting}
              onClick={deleteSelected}
            >
              Excluir ({selected.size})
            </Button>
            <Button variant="secondary" onClick={loadOrders}>
              Atualizar
            </Button>
          </>
        }
      />

      {/* ✅ Abas */}
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={tab === "OPEN" ? "primary" : "secondary"}
            onClick={() => setTab("OPEN")}
          >
            Em aberto <span className="ml-2 opacity-80">({counts.open})</span>
          </Button>

          <Button
            variant={tab === "DELIVERED" ? "primary" : "secondary"}
            onClick={() => setTab("DELIVERED")}
          >
            Entregues <span className="ml-2 opacity-80">({counts.delivered})</span>
          </Button>

          <div className="ml-auto w-full md:w-[360px]">
            <Input label="Buscar" placeholder="ID ou loja..." value={q} onChange={setQ} />
          </div>
        </div>

        <div className="mt-2 text-xs text-slate-500">
          Regra: ao marcar <b>Logística = ENTREGUE</b>, o pedido vai para a aba <b>Entregues</b>.
        </div>
      </Card>

      {loading && <Card>Carregando...</Card>}

      {!loading && filtered.length === 0 ? (
        <Card>
          <div className="text-sm text-slate-600">
            Nenhum pedido encontrado nesta aba.
          </div>
        </Card>
      ) : null}

      <div className="space-y-4">
        {filtered.map((o) => {
          const due = o.due_date ?? "";
          const isOverdue = !!due && isPastDateYMD(due);

          // ✅ NOVO (Opção A): identifica pedido parcial (filho)
          const isSplitChild = !!(o.is_split_child ?? false) || !!o.parent_order_id;

          return (
            <Card
              key={o.id}
              title={
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(o.id)}
                    onChange={() => toggleSelect(o.id)}
                  />
                  <div className="flex items-center gap-2">
                    <span>{o.store_name ?? "Loja não vinculada"}</span>

                    {/* ✅ NOVO: badge de pedido parcial */}
                    {isSplitChild ? <Badge tone="blue">Parcial</Badge> : null}

                    {isOverdue ? <Badge tone="red">Vencido</Badge> : null}
                    {!!due && !isOverdue ? <Badge tone="neutral">Com vencimento</Badge> : null}
                    {(o.logistic_status ?? "") === "ENTREGUE" ? (
                      <Badge tone="green">Entregue</Badge>
                    ) : null}
                  </div>
                </div>
              }
              subtitle={`Criado em ${fmtDT(o.created_at)}`}
              right={
                <div className="text-right">
                  <div className="text-lg font-semibold">{fmtBRL(o.total_with_freight)}</div>
                  <div className="text-xs text-slate-500">Itens {fmtBRL(o.total)}</div>
                </div>
              }
            >
              <div className="grid gap-4 md:grid-cols-5">
                <Select
                  label="Status"
                  value={o.status}
                  onChange={(v) => updateOrder(o.id, { status: v })}
                  options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
                />

                <Select
                  label="Logística"
                  value={o.logistic_status ?? LOG_OPTIONS[0]}
                  onChange={(v) => updateOrder(o.id, { logistic_status: v })}
                  options={LOG_OPTIONS.map((s) => ({ value: s, label: s }))}
                />

                <Button
                  variant={o.is_paid ? "secondary" : "primary"}
                  onClick={() =>
                    updateOrder(o.id, {
                      is_paid: !o.is_paid,
                      paid_at: !o.is_paid ? new Date().toISOString() : null,
                    })
                  }
                >
                  {o.is_paid ? "Pago" : "Marcar pago"}
                </Button>

                <div>
                  <label className="mb-1 block text-xs text-slate-500">Vencimento</label>
                  <input
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                    type="date"
                    value={due}
                    onChange={(e) => updateOrder(o.id, { due_date: e.target.value || null })}
                  />
                  {due ? (
                    <div className="mt-1 text-xs text-slate-500">{isOverdue ? "Vencido" : "OK"}</div>
                  ) : (
                    <div className="mt-1 text-xs text-slate-500">—</div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Link href={`/adm/pedidos/${o.id}?edit=1`}>
                    <Button variant="primary">Editar</Button>
                  </Link>

                  <Link href={`/adm/pedidos/${o.id}`}>
                    <Button variant="secondary">Abrir pedido</Button>
                  </Link>

                  {/* ✅ NOVO: se for parcial, dá acesso rápido ao pedido original */}
                  {o.parent_order_id ? (
                    <Link href={`/adm/pedidos/${o.parent_order_id}`}>
                      <Button variant="secondary">Abrir original</Button>
                    </Link>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}