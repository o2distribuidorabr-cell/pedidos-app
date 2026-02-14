"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import {
  PageHeader,
  Card,
  Button,
  Input,
  Select,
  Badge,
} from "@/app/components/ui";

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
  store_name: string | null;
  total: number;
  total_with_freight: number;
};

const STATUS_OPTIONS = ["draft", "submitted", "approved", "rejected"] as const;
const LOG_OPTIONS = ["RECEBIDO", "EM_SEPARACAO", "ENTREGUE"] as const;

function fmtBRL(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDT(v: string) {
  return new Date(v).toLocaleString("pt-BR");
}

export default function AdmPedidosPage() {
  const router = useRouter();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  async function loadOrders() {
    setLoading(true);

    const { data } = await supabase
      .from("v_orders_admin_list")
      .select("*")
      .order("created_at", { ascending: false });

    setOrders((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return router.push("/login");
      await loadOrders();
    })();
  }, []);

  const filtered = useMemo(() => {
    const qq = q.toLowerCase();
    return orders.filter(
      (o) =>
        !qq ||
        o.id.toLowerCase().includes(qq) ||
        (o.store_name ?? "").toLowerCase().includes(qq)
    );
  }, [orders, q]);

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

    await supabase.from("order_items").delete().in("order_id", ids);
    await supabase.from("orders").delete().in("id", ids);

    setSelected(new Set());
    await loadOrders();
    setDeleting(false);
  }

  async function updateOrder(id: string, patch: any) {
    await supabase.from("orders").update(patch).eq("id", id);
    await loadOrders();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pedidos"
        subtitle="Gerenciamento administrativo de pedidos"
        right={
          <>
            <Button variant="danger" disabled={selected.size===0 || deleting} onClick={deleteSelected}>
              Excluir ({selected.size})
            </Button>
            <Button variant="secondary" onClick={loadOrders}>Atualizar</Button>
          </>
        }
      />

      <Card>
        <Input
          label="Buscar"
          placeholder="ID ou loja..."
          value={q}
          onChange={setQ}
        />
      </Card>

      {loading && <Card>Carregando...</Card>}

      <div className="space-y-4">
        {filtered.map((o) => (
          <Card
            key={o.id}
            title={
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(o.id)}
                  onChange={() => toggleSelect(o.id)}
                />
                {o.store_name ?? "Loja não vinculada"}
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
            <div className="grid gap-4 md:grid-cols-4">

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

              <Link href={`/adm/pedidos/${o.id}`}>
                <Button>Abrir pedido</Button>
              </Link>

            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}