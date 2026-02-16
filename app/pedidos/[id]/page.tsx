"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import PortalShell from "@/app/components/PortalShell";
import { PageHeader, Card, Button, Badge } from "@/app/components/ui";

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

  // ✅ novos campos refletidos
  due_date: string | null; // DATE => "YYYY-MM-DD"

  edited_by_admin: boolean | null;
  edited_at: string | null;
  original_items: OriginalItem[] | null;
};

type ProductRow = { sku: string | null; name: string | null; unit: string | null };

type ItemRow = {
  id: string;
  qty: number;
  unit: string | null;
  unit_cost: number | null;
  product_id: string;
  products: ProductRow | ProductRow[] | null;
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

function money(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDT(v: string | null | undefined) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("pt-BR");
  } catch {
    return String(v);
  }
}

function logisticLabel(v: OrderRow["logistic_status"]) {
  if (v === "RECEBIDO") return "Recebido";
  if (v === "EM_SEPARACAO") return "Em separação";
  if (v === "ENTREGUE") return "Entregue";
  return "—";
}

function deliveryLabel(v: OrderRow["delivery_mode"]) {
  return v === "FRETE" ? "Frete" : "Retirada";
}

function statusTone(status: string): "green" | "red" | "yellow" | "neutral" {
  const s = (status || "").toLowerCase();
  if (s === "approved") return "green";
  if (s === "rejected") return "red";
  if (s === "submitted") return "yellow";
  return "neutral";
}

function logisticTone(v: OrderRow["logistic_status"]): "green" | "yellow" | "neutral" {
  if (v === "ENTREGUE") return "green";
  if (v === "EM_SEPARACAO") return "yellow";
  return "neutral";
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Normaliza products para SEMPRE virar 1 objeto (ou null)
function getProduct(p: ItemRow["products"]): ProductRow | null {
  if (!p) return null;
  if (Array.isArray(p)) return p[0] ?? null;
  return p;
}

export default function PedidoDetalhePage() {
  const router = useRouter();
  const params = useParams();

  const rawId = (params as any)?.id as string | string[] | undefined;
  const orderId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState("");

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [originalItems, setOriginalItems] = useState<OriginalItem[] | null>(null);

  const totalItens = useMemo(() => {
    return items.reduce((acc, it) => {
      const unitCost = Number(it.unit_cost ?? 0);
      return acc + (Number(it.qty ?? 0) || 0) * unitCost;
    }, 0);
  }, [items]);

  const frete = useMemo(() => {
    if (!order) return 0;
    if (order.delivery_mode !== "FRETE") return 0;
    return Number(order.freight_fee ?? 0) || 0;
  }, [order]);

  const totalComFrete = useMemo(() => totalItens + frete, [totalItens, frete]);

  const edited = useMemo(() => !!order?.edited_by_admin, [order?.edited_by_admin]);
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
        setOrder(null);
        setItems([]);
        setOriginalItems(null);
        setLoading(false);
        return;
      }

      await loadAll(orderId);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function loadAll(id: string) {
    setMsg("");

    // Pedido
    const { data: o, error: oErr } = await supabase
      .from("orders")
      .select(
        "id,store_id,status,notes,created_at,submitted_at,approved_at,logistic_status,is_paid,paid_at,payment_method,delivery_mode,freight_fee,due_date,edited_by_admin,edited_at,original_items"
      )
      .eq("id", id)
      .maybeSingle();

    if (oErr || !o) {
      setMsg(oErr?.message || "Pedido não encontrado.");
      setOrder(null);
      setItems([]);
      setOriginalItems(null);
      return;
    }

    const ord = o as OrderRow;
    setOrder(ord);
    setOriginalItems((ord.original_items ?? null) as any);

    // Itens (alias products:products para relação)
    const { data: it, error: itErr } = await supabase
      .from("order_items")
      .select("id,qty,unit,unit_cost,product_id, products:products (sku,name,unit)")
      .eq("order_id", id);

    if (itErr) {
      setMsg(itErr.message);
      setItems([]);
      return;
    }

    const safe = (it ?? []) as unknown as ItemRow[];
    setItems(safe);
  }

  async function refresh() {
    if (!orderId) return;
    setWorking(true);
    await loadAll(orderId);
    setWorking(false);
  }

  const backTo = "/pedidos";

  const originalTotal = useMemo(() => {
    if (!originalItems || originalItems.length === 0) return 0;
    return originalItems.reduce((acc, it) => {
      const unitCost = Number(it.unit_cost ?? 0);
      return acc + (Number(it.qty ?? 0) || 0) * unitCost;
    }, 0);
  }, [originalItems]);

  return (
    <PortalShell title="Pedidos" subtitle="Detalhe do pedido">
      <div className="space-y-4">
        <PageHeader
          title="Detalhe do pedido"
          subtitle={orderId ? `ID: ${orderId}` : "—"}
          right={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => router.push(backTo)} disabled={working}>
                ← Voltar
              </Button>
              <Button variant="secondary" onClick={refresh} disabled={working || loading}>
                {working ? "Atualizando..." : "Atualizar"}
              </Button>
            </div>
          }
        />

        {msg ? (
          <Card title="Aviso">
            <div className="text-sm text-red-600 whitespace-pre-wrap">{msg}</div>
          </Card>
        ) : null}

        {loading ? (
          <Card>
            <div className="text-sm text-slate-600">Carregando...</div>
          </Card>
        ) : !order ? (
          <Card>
            <div className="text-sm text-slate-700">Pedido não encontrado.</div>
          </Card>
        ) : (
          <>
            {/* Aviso de edição + vencimento */}
            <Card title="Informações importantes">
              <div className="flex flex-wrap items-center gap-2">
                {edited ? (
                  <Badge tone="blue">Pedido ajustado pela franqueadora</Badge>
                ) : (
                  <Badge tone="neutral">Pedido original</Badge>
                )}

                {order.due_date ? (
                  overdue ? (
                    <Badge tone="red">Vencido • {order.due_date}</Badge>
                  ) : (
                    <Badge tone="green">Vence em • {order.due_date}</Badge>
                  )
                ) : (
                  <Badge tone="neutral">Sem vencimento</Badge>
                )}
              </div>

              <div className="mt-3 text-sm text-slate-700">
                <div>
                  <span className="font-semibold text-slate-900">Vencimento:</span>{" "}
                  {order.due_date ? order.due_date : "—"}
                </div>
                {edited ? (
                  <div className="mt-1">
                    <span className="font-semibold text-slate-900">Editado em:</span>{" "}
                    {fmtDT(order.edited_at)}
                  </div>
                ) : null}
              </div>

              {edited && originalItems && originalItems.length > 0 ? (
                <div className="mt-3 text-sm text-slate-600">
                  Abaixo você verá o <b>pedido original</b> e o <b>pedido atual</b> após ajustes de estoque.
                </div>
              ) : null}
            </Card>

            {/* Cards de informações */}
            <div className="grid gap-3 lg:grid-cols-3">
              <Card title="Status">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={statusTone(order.status)}>{order.status}</Badge>
                  <Badge tone={logisticTone(order.logistic_status)}>{logisticLabel(order.logistic_status)}</Badge>
                </div>

                <div className="mt-3 text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">Entrega:</span> {deliveryLabel(order.delivery_mode)}
                </div>
                <div className="mt-1 text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">Frete:</span> {money(frete)}
                </div>
              </Card>

              <Card title="Pagamento">
                <div className="text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">{order.is_paid ? "Pago" : "Não pago"}</span>{" "}
                  <span className="text-slate-500">{order.paid_at ? `(${fmtDT(order.paid_at)})` : ""}</span>
                </div>
                <div className="mt-2 text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">Forma:</span> {order.payment_method ?? "—"}
                </div>
              </Card>

              <Card title="Datas">
                <div className="text-sm text-slate-700 leading-6">
                  <div>
                    <span className="font-semibold text-slate-900">Criado:</span> {fmtDT(order.created_at)}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">Enviado:</span> {fmtDT(order.submitted_at)}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">Aprovado:</span> {fmtDT(order.approved_at)}
                  </div>
                </div>
              </Card>
            </div>

            {/* Observações */}
            <Card title="Observações">
              <div className="whitespace-pre-wrap text-sm text-slate-700">{order.notes ?? "—"}</div>
            </Card>

            {/* Resumo atual */}
            <div className="grid gap-3 md:grid-cols-3">
              <Card title="Itens (atual)">
                <div className="text-lg font-semibold text-slate-900">{money(totalItens)}</div>
              </Card>
              <Card title="Frete">
                <div className="text-lg font-semibold text-slate-900">{money(frete)}</div>
              </Card>
              <Card title="Total (c/ frete)">
                <div className="text-lg font-semibold text-slate-900">{money(totalComFrete)}</div>
              </Card>
            </div>

            {/* Itens atuais */}
            <Card title={`Itens atuais (${items.length})`}>
              {items.length === 0 ? (
                <div className="text-sm text-slate-600">Nenhum item.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left text-xs text-slate-600">
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">SKU</th>
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">Produto</th>
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">Unid.</th>
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-right">Preço</th>
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-right">Qtd</th>
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>

                    <tbody>
                      {items.map((it) => {
                        const prod = getProduct(it.products);
                        const sku = prod?.sku ?? "-";
                        const name = prod?.name ?? "-";
                        const unit = prod?.unit ?? it.unit ?? "-";
                        const unitCost = Number(it.unit_cost ?? 0) || 0;
                        const qty = Number(it.qty ?? 0) || 0;
                        const line = qty * unitCost;

                        return (
                          <tr key={it.id} className="hover:bg-slate-50">
                            <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3">
                              <div className="font-mono text-xs text-slate-600">{sku}</div>
                            </td>
                            <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-sm text-slate-900">
                              {name}
                            </td>
                            <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-sm text-slate-700">
                              {unit}
                            </td>
                            <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-right text-sm text-slate-900">
                              {money(unitCost)}
                            </td>
                            <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-right font-semibold text-slate-900">
                              {qty}
                            </td>
                            <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-right font-semibold text-slate-900">
                              {money(line)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Pedido original (snapshot) */}
            {edited && originalItems && originalItems.length > 0 ? (
              <Card
                title={`Pedido original do franqueado (${originalItems.length})`}
                subtitle={`Snapshot salvo em ${fmtDT(order.edited_at)}`}
              >
                <div className="mb-3 grid gap-3 md:grid-cols-3">
                  <Card title="Total original (itens)">
                    <div className="text-lg font-semibold text-slate-900">{money(originalTotal)}</div>
                  </Card>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left text-xs text-slate-600">
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">SKU</th>
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">Produto</th>
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2">Unid.</th>
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-right">Preço</th>
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-right">Qtd</th>
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>

                    <tbody>
                      {originalItems.map((it) => {
                        const sku = it.sku ?? "-";
                        const name = it.name ?? "-";
                        const unit = it.product_unit ?? it.unit ?? "-";
                        const unitCost = Number(it.unit_cost ?? 0) || 0;
                        const qty = Number(it.qty ?? 0) || 0;
                        const line = qty * unitCost;

                        return (
                          <tr key={it.id} className="hover:bg-slate-50">
                            <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3">
                              <div className="font-mono text-xs text-slate-600">{sku}</div>
                            </td>
                            <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-sm text-slate-900">
                              {name}
                            </td>
                            <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-sm text-slate-700">
                              {unit}
                            </td>
                            <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-right text-sm text-slate-900">
                              {money(unitCost)}
                            </td>
                            <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-right font-semibold text-slate-900">
                              {qty}
                            </td>
                            <td className="whitespace-nowrap border-b border-slate-100 px-3 py-3 text-right font-semibold text-slate-900">
                              {money(line)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </PortalShell>
  );
}