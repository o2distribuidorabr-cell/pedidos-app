"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";
import { PageHeader, Card, Input, Select, Badge, Table, StatCard } from "@/app/components/ui";

type OrderRow = {
  id: string;
  store_id: string | null;
  status: string;
  created_at: string | null;
  approved_at: string | null;
  submitted_at: string | null;
  is_paid: boolean | null;
  payment_method: string | null;
  delivery_mode: string | null;
  freight_fee: number | null;
  credit_applied: number | null;
  notes: string | null;
  stores: {
    id: string;
    name: string | null;
    legal_name: string | null;
    cnpj: string | null;
  } | null;
};

type FocusDocRow = {
  id: string;
  order_id: string;
  status: string | null;
  reference: string | null;
  numero: string | null;
  serie: string | null;
  chave: string | null;
  url_danfe: string | null;
  url_xml: string | null;
  error_message: string | null;
  updated_at: string | null;
};

function fmtDT(v: string | null | undefined) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("pt-BR");
  } catch {
    return v;
  }
}

function toneForOrderStatus(s: string) {
  if (s === "approved") return "green";
  if (s === "submitted") return "blue";
  if (s === "rejected") return "red";
  return "neutral";
}

function toneForNfeStatus(status: string | null | undefined) {
  const s = String(status || "").toLowerCase();
  if (["autorizado", "emitido", "processado", "aprovado"].includes(s)) return "green";
  if (["erro", "rejeitado", "cancelado", "denegado", "erro_autorizacao"].includes(s)) return "red";
  if (["processando", "pendente", "enviado"].includes(s)) return "yellow";
  return "neutral";
}

export default function AdmEmissaoFiscalPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [focusDocs, setFocusDocs] = useState<Record<string, FocusDocRow | null>>({});

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [nfeFilter, setNfeFilter] = useState("all");

  useEffect(() => {
    (async () => {
      const ok = await requireAdminOrRedirect(router);
      if (!ok) return;
      await loadData();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    setMsg("");

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select(`
        id,
        store_id,
        status,
        created_at,
        approved_at,
        submitted_at,
        is_paid,
        payment_method,
        delivery_mode,
        freight_fee,
        credit_applied,
        notes,
        stores:stores (
          id,
          name,
          legal_name,
          cnpj
        )
      `)
      .order("created_at", { ascending: false })
      .limit(200);

    if (orderError) {
      setMsg(orderError.message);
      setOrders([]);
      return;
    }

    const normalizedOrders = (orderData ?? []).map((row: any) => ({
      ...row,
      stores: Array.isArray(row.stores) ? row.stores[0] ?? null : row.stores ?? null,
    })) as OrderRow[];

    setOrders(normalizedOrders);

    const orderIds = normalizedOrders.map((o) => o.id);
    if (!orderIds.length) {
      setFocusDocs({});
      return;
    }

    const { data: focusData, error: focusError } = await supabase
      .from("focus_nfe_documents")
      .select("id,order_id,status,reference,numero,serie,chave,url_danfe,url_xml,error_message,updated_at")
      .in("order_id", orderIds)
      .order("updated_at", { ascending: false });

    if (focusError) {
      setMsg(focusError.message);
      setFocusDocs({});
      return;
    }

    const map: Record<string, FocusDocRow | null> = {};
    for (const doc of (focusData ?? []) as FocusDocRow[]) {
      if (!map[doc.order_id]) map[doc.order_id] = doc;
    }
    setFocusDocs(map);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return orders.filter((order) => {
      const storeName = String(order.stores?.name || "").toLowerCase();
      const legalName = String(order.stores?.legal_name || "").toLowerCase();
      const cnpj = String(order.stores?.cnpj || "");
      const orderId = String(order.id || "").toLowerCase();
      const focus = focusDocs[order.id];
      const nfeStatus = String(focus?.status || "").toLowerCase();

      const matchText =
        !q ||
        storeName.includes(q) ||
        legalName.includes(q) ||
        cnpj.includes(q) ||
        orderId.includes(q);

      const matchStatus = statusFilter === "all" ? true : order.status === statusFilter;

      const matchNfe =
        nfeFilter === "all"
          ? true
          : nfeFilter === "sem_nfe"
          ? !focus
          : nfeStatus === nfeFilter;

      return matchText && matchStatus && matchNfe;
    });
  }, [orders, focusDocs, search, statusFilter, nfeFilter]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const approved = filtered.filter((o) => o.status === "approved").length;
    const semNfe = filtered.filter((o) => !focusDocs[o.id]).length;
    const autorizadas = filtered.filter((o) => String(focusDocs[o.id]?.status || "").toLowerCase() === "autorizado").length;
    return { total, approved, semNfe, autorizadas };
  }, [filtered, focusDocs]);

  const rows = filtered.map((order) => {
    const focus = focusDocs[order.id];

    return [
      <div key="pedido">
        <div className="font-semibold text-slate-900">{order.id}</div>
        <div className="text-xs text-slate-500">{fmtDT(order.created_at)}</div>
      </div>,
      <div key="loja">
        <div className="font-semibold text-slate-900">{order.stores?.name || "-"}</div>
        <div className="text-xs text-slate-500">{order.stores?.legal_name || "-"}</div>
      </div>,
      <Badge key="status_pedido" tone={toneForOrderStatus(order.status) as any}>
        {order.status}
      </Badge>,
      focus ? (
        <Badge key="status_nfe" tone={toneForNfeStatus(focus.status) as any}>
          {focus.status || "sem status"}
        </Badge>
      ) : (
        <Badge key="status_nfe" tone="neutral">
          sem NF-e
        </Badge>
      ),
      <div key="numero">
        <div className="font-semibold text-slate-900">{focus?.numero || "-"}</div>
        <div className="text-xs text-slate-500">Série: {focus?.serie || "-"}</div>
      </div>,
      <div key="acao" className="flex justify-end">
        <button
          type="button"
          onClick={() => router.push(`/adm/emissao-fiscal/${order.id}`)}
          className="inline-flex h-10 items-center justify-center rounded-[16px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50"
        >
          Abrir
        </button>
      </div>,
    ];
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Emissão fiscal"
        subtitle="Selecione o pedido que deseja preparar ou emitir"
        right={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadData}
              className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50"
            >
              Recarregar
            </button>
            <button
              type="button"
              onClick={() => router.push("/adm/pedidos")}
              className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50"
            >
              Pedidos
            </button>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm text-red-600">{msg}</div>
        </Card>
      ) : null}

      <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-5 shadow-sm md:p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Pedidos listados" value={String(stats.total)} />
          <StatCard label="Aprovados" value={String(stats.approved)} />
          <StatCard label="Sem NF-e" value={String(stats.semNfe)} />
          <StatCard label="Autorizadas" value={String(stats.autorizadas)} />
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Input
            label="Buscar"
            placeholder="Pedido, loja, razão social, CNPJ..."
            value={search}
            onChange={setSearch}
          />
          <Select
            label="Status do pedido"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "Todos" },
              { value: "draft", label: "Draft" },
              { value: "submitted", label: "Submitted" },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected" },
            ]}
          />
          <Select
            label="Status da NF-e"
            value={nfeFilter}
            onChange={setNfeFilter}
            options={[
              { value: "all", label: "Todos" },
              { value: "sem_nfe", label: "Sem NF-e" },
              { value: "processando", label: "Processando" },
              { value: "autorizado", label: "Autorizado" },
              { value: "erro", label: "Erro" },
              { value: "erro_autorizacao", label: "Erro autorização" },
              { value: "rejeitado", label: "Rejeitado" },
            ]}
          />
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="text-sm font-semibold text-slate-900">Pedidos para emissão</div>
        <div className="mt-6">
          <Table
            headers={["Pedido", "Loja", "Status pedido", "Status NF-e", "Número", "Ação"]}
            rows={rows}
          />
        </div>
      </div>

      {loading ? (
        <Card>
          <div className="text-sm text-slate-600">Carregando...</div>
        </Card>
      ) : null}
    </div>
  );
}