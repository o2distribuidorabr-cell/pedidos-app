"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import {
  PageHeader,
  Card,
  Button,
  Input,
  Select,
  Badge,
  Table,
} from "@/app/components/ui";

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

  due_date: string | null; // DATE => "YYYY-MM-DD"

  // ✅ Auditoria
  edited_by_admin: boolean | null;
  edited_at: string | null;
  original_items: any[] | null;
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

type ItemEdit = {
  qty: string;
  removed: boolean;
};

type OriginalItem = {
  id: string;
  product_id: string;
  qty: number;
  unit: string | null;
  unit_cost: number | null;
  sku: string | null;
  name: string | null;
  product_unit: string | null;
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
function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function AdmPedidoDetalhePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const orderId = params?.id;

  const editMode = searchParams.get("edit") === "1";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [creditBalance, setCreditBalance] = useState<number>(0);

  // ✅ auditoria visível
  const [originalItems, setOriginalItems] = useState<OriginalItem[] | null>(null);

  // ✅ edição
  const [itemEdits, setItemEdits] = useState<Record<string, ItemEdit>>({});

  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState<string>("");
  const [creditNote, setCreditNote] = useState<string>("");

  const lockedByLogistics = useMemo(() => {
    return (order?.logistic_status ?? null) === "ENTREGUE";
  }, [order?.logistic_status]);

  const totalItens = useMemo(() => {
    return items.reduce((acc, it) => {
      const edit = itemEdits[it.id];
      const removed = editMode ? (edit?.removed ?? false) : false;
      if (removed) return acc;

      const qtyStr = editMode ? (edit?.qty ?? String(it.qty ?? 0)) : String(it.qty ?? 0);
      const qty = Number(qtyStr.replace(",", ".")) || 0;

      const unitCost = Number(it.unit_cost ?? 0);
      return acc + qty * unitCost;
    }, 0);
  }, [items, itemEdits, editMode]);

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

  const overdue = useMemo(() => {
    if (!order?.due_date) return false;
    return order.due_date < todayYMD();
  }, [order?.due_date]);

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

  // inicializa rascunho ao entrar no modo edição
  useEffect(() => {
    if (!editMode) return;

    const draft: Record<string, ItemEdit> = {};
    for (const it of items) {
      draft[it.id] = { qty: String(it.qty ?? 0), removed: false };
    }
    setItemEdits(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, order?.id]);

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
        "id,store_id,status,notes,created_at,submitted_at,approved_at,logistic_status,is_paid,paid_at,payment_method,delivery_mode,freight_fee,credit_applied,due_date,edited_by_admin,edited_at,original_items"
      )
      .eq("id", id)
      .maybeSingle();

    if (oErr || !o) {
      setMsg(oErr?.message || "Pedido não encontrado.");
      setOrder(null);
      setItems([]);
      setCreditBalance(0);
      setOriginalItems(null);
      return;
    }

    const ord = o as OrderRow;
    setOrder(ord);

    // ✅ snapshot original
    const snap = (ord.original_items ?? null) as OriginalItem[] | null;
    setOriginalItems(snap);

    if (ord.store_id) await loadCreditBalance(ord.store_id);
    else setCreditBalance(0);

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
        "id,store_id,status,notes,created_at,submitted_at,approved_at,logistic_status,is_paid,paid_at,payment_method,delivery_mode,freight_fee,credit_applied,due_date,edited_by_admin,edited_at,original_items"
      )
      .single();

    if (error) {
      setMsg(error.message);
      setSaving(false);
      return;
    }

    const ord = data as OrderRow;
    setOrder(ord);
    setOriginalItems((ord.original_items ?? null) as any);

    if (ord.store_id) await loadCreditBalance(ord.store_id);

    setSaving(false);
  }

  // ✅ AJUSTE AQUI:
  // - Ao desmarcar pago, NÃO apagar payment_method.
  // - Ao marcar pago, mantém a forma atual (ou PIX como padrão).
  async function onTogglePaid() {
    if (!order) return;
    const paid = !!order.is_paid;

    if (paid) {
      await updateOrder({ is_paid: false, paid_at: null });
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

  async function deleteThisOrder() {
    if (!order) return;
    const ok = window.confirm("Tem certeza que deseja excluir este pedido? Isso remove do Admin e do Franqueado.");
    if (!ok) return;

    setSaving(true);
    setMsg("");

    const delItems = await supabase.from("order_items").delete().eq("order_id", order.id);
    if (delItems.error) {
      setSaving(false);
      setMsg(`Erro ao excluir itens: ${delItems.error.message}`);
      return;
    }

    const delOrder = await supabase.from("orders").delete().eq("id", order.id);
    if (delOrder.error) {
      setSaving(false);
      setMsg(`Erro ao excluir pedido: ${delOrder.error.message}`);
      return;
    }

    setSaving(false);
    router.push("/adm/pedidos");
  }

  function statusBadgeTone(s: string) {
    if (s === "approved") return "green";
    if (s === "rejected") return "red";
    if (s === "submitted") return "blue";
    return "neutral";
  }

  function setItemQty(id: string, v: string) {
    setItemEdits((prev) => ({
      ...prev,
      [id]: { qty: v, removed: prev[id]?.removed ?? false },
    }));
  }

  function toggleRemoveItem(id: string) {
    setItemEdits((prev) => ({
      ...prev,
      [id]: { qty: prev[id]?.qty ?? "0", removed: !(prev[id]?.removed ?? false) },
    }));
  }

  function cancelEdits() {
    router.push(`/adm/pedidos/${order?.id ?? ""}`);
  }

  // ✅ Salvar via RPC (já está funcionando no seu ambiente)
  async function saveEdits() {
    if (!order) return;
    if (lockedByLogistics) {
      setMsg("Pedido já ENTREGUE. Edição de itens bloqueada.");
      return;
    }

    setSaving(true);
    setMsg("");

    try {
      const payload = items.map((it) => {
        const e = itemEdits[it.id];
        const removed = e?.removed ?? false;

        const qtyNum = Number((e?.qty ?? String(it.qty ?? 0)).replace(",", "."));
        if (!removed && (Number.isNaN(qtyNum) || qtyNum < 0)) {
          throw new Error("Quantidade inválida em um ou mais itens.");
        }

        return { id: it.id, qty: removed ? 0 : qtyNum, removed };
      });

      const { error } = await supabase.rpc("admin_edit_order_items", {
        p_order_id: order.id,
        p_items: payload,
      });

      if (error) {
        setSaving(false);
        setMsg(`Erro ao salvar edição: ${error.message}`);
        return;
      }

      await loadAll(order.id);
      setSaving(false);
      router.push(`/adm/pedidos/${order.id}`);
    } catch (e: any) {
      setSaving(false);
      setMsg(e?.message || "Erro ao salvar edição.");
    }
  }

  if (loading) return <Card>Carregando...</Card>;

  if (!order) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Pedido"
          subtitle="Não foi possível carregar"
          right={<Button variant="secondary" onClick={() => router.push("/adm/pedidos")}>Voltar</Button>}
        />
        <Card>
          <div className="text-sm text-red-600">{msg || "Pedido não encontrado."}</div>
        </Card>
      </div>
    );
  }

  const edited = !!order.edited_by_admin;

  const itemsRows = items.map((it) => {
    const sku = it.products?.sku ?? "-";
    const name = it.products?.name ?? "-";
    const unit = it.products?.unit ?? it.unit ?? "-";
    const unitCost = Number(it.unit_cost ?? 0);

    const edit = itemEdits[it.id];
    const removed = editMode ? (edit?.removed ?? false) : false;
    const qtyStr = editMode ? (edit?.qty ?? String(it.qty ?? 0)) : String(it.qty ?? 0);
    const qtyNum = Number(qtyStr.replace(",", ".")) || 0;

    const line = removed ? 0 : qtyNum * unitCost;

    if (!editMode) {
      return [
        <span key="sku" className="font-mono text-xs">{sku}</span>,
        <span key="name" className="text-slate-900">{name}</span>,
        <span key="unit" className="text-slate-700">{unit}</span>,
        <span key="price" className="font-semibold">{fmtBRL(unitCost)}</span>,
        <span key="qty" className="font-semibold">{it.qty}</span>,
        <span key="total" className="font-semibold">{fmtBRL(line)}</span>,
      ];
    }

    return [
      <span key="sku" className="font-mono text-xs">{sku}</span>,
      <span key="name" className="text-slate-900">
        <div className="flex items-center gap-2">
          <span>{name}</span>
          {removed ? <Badge tone="red">Removido</Badge> : null}
        </div>
      </span>,
      <span key="unit" className="text-slate-700">{unit}</span>,
      <span key="price" className="font-semibold">{fmtBRL(unitCost)}</span>,
      <div key="qty" className="flex items-center gap-2">
        <input
          className="w-24 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-slate-300 disabled:bg-slate-50"
          type="number"
          value={qtyStr}
          disabled={saving || lockedByLogistics || removed}
          onChange={(e) => setItemQty(it.id, e.target.value)}
          min={0}
          step={1}
        />
        <Button
          variant={removed ? "secondary" : "danger"}
          disabled={saving || lockedByLogistics}
          onClick={() => toggleRemoveItem(it.id)}
        >
          {removed ? "Desfazer" : "Remover"}
        </Button>
      </div>,
      <span key="total" className="font-semibold">{fmtBRL(line)}</span>,
    ];
  });

  const originalRows =
    originalItems?.map((it) => {
      const unitCost = Number(it.unit_cost ?? 0);
      const line = Number(it.qty ?? 0) * unitCost;
      return [
        <span key="sku" className="font-mono text-xs">{it.sku ?? "-"}</span>,
        <span key="name" className="text-slate-900">{it.name ?? "-"}</span>,
        <span key="unit" className="text-slate-700">{it.product_unit ?? it.unit ?? "-"}</span>,
        <span key="price" className="font-semibold">{fmtBRL(unitCost)}</span>,
        <span key="qty" className="font-semibold">{it.qty}</span>,
        <span key="total" className="font-semibold">{fmtBRL(line)}</span>,
      ];
    }) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Detalhe do pedido"
        subtitle={`ID: ${order.id}`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            {edited ? (
              <Badge tone="blue">EDITADO {order.edited_at ? `• ${fmtDT(order.edited_at)}` : ""}</Badge>
            ) : (
              <Badge tone="neutral">ORIGINAL</Badge>
            )}

            <Button variant="secondary" onClick={() => router.push("/adm/pedidos")}>Voltar</Button>
            <Button variant="secondary" onClick={() => loadAll(order.id)} disabled={saving}>Recarregar</Button>
            <Button variant="secondary" onClick={() => window.print()}>Imprimir</Button>

            {!editMode ? (
              <Button
                variant="primary"
                onClick={() => router.push(`/adm/pedidos/${order.id}?edit=1`)}
                disabled={saving || lockedByLogistics}
              >
                Editar itens
              </Button>
            ) : (
              <>
                <Button variant="secondary" onClick={cancelEdits} disabled={saving}>
                  Cancelar
                </Button>
                <Button onClick={saveEdits} disabled={saving || lockedByLogistics}>
                  {saving ? "Salvando..." : "Salvar alterações"}
                </Button>
              </>
            )}

            <Button variant="danger" onClick={deleteThisOrder} disabled={saving}>Excluir</Button>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm text-red-600">{msg}</div>
        </Card>
      ) : null}

      <Card
        title="Vencimento"
        right={
          <div className="flex items-center gap-2">
            {order.due_date ? (
              overdue ? <Badge tone="red">Vencido</Badge> : <Badge tone="green">OK</Badge>
            ) : (
              <Badge tone="neutral">Sem vencimento</Badge>
            )}
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Data de vencimento</label>
            <input
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300 disabled:bg-slate-50"
              type="date"
              value={order.due_date ?? ""}
              disabled={saving}
              onChange={(e) => updateOrder({ due_date: e.target.value || null })}
            />
          </div>
        </div>
      </Card>

      <Card
        title="Crédito da loja"
        right={
          <div className="flex items-center gap-3">
            <Badge tone="blue">Saldo: {fmtBRL(creditBalance)}</Badge>
            <Badge tone="neutral">Abatido: {fmtBRL(Number(order.credit_applied ?? 0))}</Badge>
            <Button onClick={openCreditModal} disabled={saving || creditBalance <= 0}>
              Abater crédito
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">Itens</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{fmtBRL(totalItens)}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">Frete</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{fmtBRL(frete)}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">Crédito abatido</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">- {fmtBRL(creditApplied)}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold text-slate-500">Total líquido</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{fmtBRL(totalLiquido)}</div>
          </div>
        </div>
      </Card>

      <Card
        title="Status, logística, entrega e pagamento"
        right={<Badge tone={statusBadgeTone(order.status) as any}>{order.status}</Badge>}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Select
            label="Status"
            value={order.status}
            onChange={(v) => updateOrder({ status: v })}
            options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
          />

          <Select
            label="Logística"
            value={(order.logistic_status ?? "RECEBIDO") as any}
            onChange={(v) => updateOrder({ logistic_status: v as any })}
            options={LOG_OPTIONS.map((s) => ({ value: s, label: s }))}
          />

          <Select
            label="Entrega"
            value={(order.delivery_mode ?? "RETIRADA") as any}
            onChange={(v) => updateOrder({ delivery_mode: v as any })}
            options={DELIVERY_OPTIONS.map((s) => ({ value: s, label: s }))}
          />

          <Input
            label="Frete (R$)"
            value={String(Number(order.freight_fee ?? 0))}
            onChange={(v) => updateOrder({ freight_fee: Number(v) })}
            type="number"
          />

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-600">Pagamento</div>
            <Button
              variant={order.is_paid ? "secondary" : "primary"}
              onClick={onTogglePaid}
              disabled={saving}
            >
              {order.is_paid ? "Pago" : "Marcar como pago"}
            </Button>
            <div className="text-xs text-slate-500">
              {order.paid_at ? `Pago em: ${fmtDT(order.paid_at)}` : "Não pago"}
            </div>
          </div>

          <div className="grid gap-2">
            <Input
              label="Data pagamento"
              type="date"
              value={isoToDateInput(order.paid_at)}
              onChange={(v) =>
                updateOrder({
                  paid_at: v ? dateInputToISO(v) : null,
                  // se você escolhe data, faz sentido marcar como pago
                  is_paid: v ? true : false,
                })
              }
            />

            {/* ✅ AJUSTE AQUI:
                - NÃO setar is_paid: true só por trocar a forma.
                - Isso evita marcar pago e evita “zerar” forma em outros fluxos.
            */}
            <Select
              label="Forma"
              value={order.payment_method ?? "PIX"}
              onChange={(v) => updateOrder({ payment_method: v as any })}
              options={PAY_METHODS.map((m) => ({ value: m, label: m }))}
            />
          </div>
        </div>
      </Card>

      <Card title="Observações">
        <textarea
          className="w-full min-h-[110px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          value={order.notes ?? ""}
          disabled={saving}
          onChange={(e) => updateOrder({ notes: e.target.value })}
          placeholder="Observações do pedido..."
        />
        <div className="mt-3 text-xs text-slate-500">
          Criado: {fmtDT(order.created_at)} · Enviado: {fmtDT(order.submitted_at)} · Aprovado: {fmtDT(order.approved_at)}
        </div>
      </Card>

      {/* Itens atuais */}
      <Card
        title="Itens do pedido (atual)"
        subtitle={
          editMode
            ? "Modo edição: ajuste quantidades e remova itens. Depois clique em Salvar alterações."
            : `${items.length} item(ns)`
        }
        right={
          lockedByLogistics
            ? <Badge tone="red">ENTREGUE (itens bloqueados)</Badge>
            : (editMode ? <Badge tone="blue">EDITANDO</Badge> : null)
        }
      >
        <Table
          headers={["SKU", "Produto", "Unid.", "Preço", "Qtd", "Total"]}
          rows={itemsRows}
        />
      </Card>

      {/* ✅ Pedido original */}
      {originalItems && originalItems.length > 0 ? (
        <Card
          title="Pedido original do franqueado"
          subtitle={order.edited_at ? `Snapshot salvo em ${fmtDT(order.edited_at)}` : "Snapshot salvo"}
          right={<Badge tone="neutral">ORIGINAL</Badge>}
        >
          <Table
            headers={["SKU", "Produto", "Unid.", "Preço", "Qtd", "Total"]}
            rows={originalRows}
          />
        </Card>
      ) : null}

      {/* Modal crédito */}
      {creditModalOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={closeCreditModal}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-slate-900">Abater crédito</div>
                <div className="mt-1 text-xs text-slate-500">
                  Saldo: <b>{fmtBRL(creditBalance)}</b> · Já abatido: <b>{fmtBRL(creditApplied)}</b>
                </div>
              </div>
              <Button variant="secondary" onClick={closeCreditModal} disabled={saving}>
                Fechar
              </Button>
            </div>

            <div className="mt-4 grid gap-3">
              <Input
                label="Valor (opcional)"
                placeholder="Vazio = abater o máximo possível"
                value={creditAmount}
                onChange={setCreditAmount}
              />
              <Input
                label="Observação (opcional)"
                placeholder="Ex.: abatimento parcial"
                value={creditNote}
                onChange={setCreditNote}
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={applyCredit} disabled={saving}>
                {saving ? "Aplicando..." : "Aplicar crédito"}
              </Button>
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Regra: abate até o limite do saldo e até o limite do total do pedido.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}