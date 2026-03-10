"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import PortalShell from "@/app/components/PortalShell";
import { PageHeader, Card, Badge } from "@/app/components/ui";

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

  due_date: string | null;
  delivery_forecast: string | null;
  credit_applied: number | null;

  edited_by_admin: boolean | null;
  edited_at: string | null;
  original_items: OriginalItem[] | null;
};

type ProductRow = {
  sku: string | null;
  name: string | null;
  unit: string | null;
};

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
  return (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtDT(v: string | null | undefined) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("pt-BR");
  } catch {
    return String(v);
  }
}

function fmtYMD(ymd: string | null | undefined) {
  if (!ymd) return "-";
  try {
    const [y, m, d] = String(ymd).split("-").map(Number);
    if (!y || !m || !d) return String(ymd);
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    return dt.toLocaleDateString("pt-BR");
  } catch {
    return String(ymd);
  }
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isOrderOverdue(order: Pick<OrderRow, "due_date" | "is_paid">) {
  if (!order.due_date) return false;
  if (order.is_paid) return false;
  return order.due_date < todayYMD();
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

function forecastTone(
  forecast: string | null,
  logistic: OrderRow["logistic_status"]
): "green" | "red" | "neutral" {
  if (!forecast) return "neutral";
  if (logistic === "ENTREGUE") return "green";
  return forecast < todayYMD() ? "red" : "green";
}

function getProduct(p: ItemRow["products"]): ProductRow | null {
  if (!p) return null;
  if (Array.isArray(p)) return p[0] ?? null;
  return p;
}

function PrimaryActionButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-12 items-center justify-center rounded-[18px] bg-cyan-600 px-5 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(8,145,178,0.26)] transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function SecondaryActionButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-12 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900">{value}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
  );
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
    if (!order) return false;
    return isOrderOverdue(order);
  }, [order]);

  const forecastOverdue = useMemo(() => {
    if (!order?.delivery_forecast) return false;
    if ((order.logistic_status ?? null) === "ENTREGUE") return false;
    return order.delivery_forecast < todayYMD();
  }, [order?.delivery_forecast, order?.logistic_status]);

  const creditApplied = useMemo(
    () => Number(order?.credit_applied ?? 0) || 0,
    [order?.credit_applied]
  );

  const totalLiquido = useMemo(() => {
    return Math.max(totalComFrete - creditApplied, 0);
  }, [totalComFrete, creditApplied]);

  const originalTotal = useMemo(() => {
    if (!originalItems || originalItems.length === 0) return 0;
    return originalItems.reduce((acc, it) => {
      const unitCost = Number(it.unit_cost ?? 0);
      return acc + (Number(it.qty ?? 0) || 0) * unitCost;
    }, 0);
  }, [originalItems]);

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

    const { data: o, error: oErr } = await supabase
      .from("orders")
      .select(
        "id,store_id,status,notes,created_at,submitted_at,approved_at,logistic_status,is_paid,paid_at,payment_method,delivery_mode,freight_fee,due_date,delivery_forecast,credit_applied,edited_by_admin,edited_at,original_items"
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

  return (
    <PortalShell title="Pedidos" subtitle="Detalhe do pedido">
      <div className="space-y-6">
        <PageHeader
          title="Detalhe do pedido"
          subtitle={orderId ? `ID: ${orderId}` : "—"}
          right={
            <div className="flex flex-wrap gap-2">
              <SecondaryActionButton onClick={() => router.push(backTo)} disabled={working}>
                Voltar
              </SecondaryActionButton>

              <SecondaryActionButton onClick={refresh} disabled={working || loading}>
                {working ? "Atualizando..." : "Atualizar"}
              </SecondaryActionButton>
            </div>
          }
        />

        {msg ? (
          <Card title="Aviso">
            <div className="text-sm whitespace-pre-wrap text-red-600">{msg}</div>
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
            <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-5 shadow-sm md:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={statusTone(order.status)}>{order.status}</Badge>
                    <Badge tone={logisticTone(order.logistic_status)}>
                      {logisticLabel(order.logistic_status)}
                    </Badge>

                    {edited ? (
                      <Badge tone="blue">Ajustado pela franqueadora</Badge>
                    ) : (
                      <Badge tone="neutral">Pedido original</Badge>
                    )}

                    {order.due_date ? (
                      order.is_paid ? (
                        <Badge tone="green">Pago</Badge>
                      ) : overdue ? (
                        <Badge tone="red">Vencido</Badge>
                      ) : (
                        <Badge tone="green">Em dia</Badge>
                      )
                    ) : (
                      <Badge tone="neutral">Sem vencimento</Badge>
                    )}

                    {order.delivery_forecast ? (
                      forecastOverdue ? (
                        <Badge tone="red">Entrega atrasada</Badge>
                      ) : (
                        <Badge tone="green">Previsão ativa</Badge>
                      )
                    ) : (
                      <Badge tone="neutral">Sem previsão</Badge>
                    )}
                  </div>

                  <div className="mt-4 text-sm leading-7 text-slate-700">
                    <div>
                      <span className="font-semibold text-slate-900">Entrega:</span>{" "}
                      {deliveryLabel(order.delivery_mode)}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-900">Vencimento:</span>{" "}
                      {fmtYMD(order.due_date)}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-900">Previsão de entrega:</span>{" "}
                      {fmtYMD(order.delivery_forecast)}
                    </div>
                    {edited ? (
                      <div>
                        <span className="font-semibold text-slate-900">Editado em:</span>{" "}
                        {fmtDT(order.edited_at)}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="w-full max-w-sm rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Resumo financeiro
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-slate-600">Itens</span>
                      <span className="text-sm font-semibold text-slate-900">
                        {money(totalItens)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-slate-600">Frete</span>
                      <span className="text-sm font-semibold text-slate-900">{money(frete)}</span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-slate-600">Crédito abatido</span>
                      <span className="text-sm font-semibold text-slate-900">
                        - {money(creditApplied)}
                      </span>
                    </div>

                    <div className="h-px bg-slate-200" />

                    <div className="flex items-end justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-900">Total líquido</span>
                      <span className="text-2xl font-semibold tracking-[-0.03em] text-slate-900">
                        {money(totalLiquido)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {edited && originalItems && originalItems.length > 0 ? (
                <div className="mt-4 text-sm text-slate-600">
                  Abaixo você verá o <b>pedido original</b> e o <b>pedido atual</b> após os ajustes.
                </div>
              ) : null}
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <MetricCard title="Itens atuais" value={money(totalItens)} />
                  <MetricCard title="Frete" value={money(frete)} />
                  <MetricCard title="Total com frete" value={money(totalComFrete)} />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <MetricCard title="Crédito abatido" value={`- ${money(creditApplied)}`} />
                  <MetricCard title="Total líquido" value={money(totalLiquido)} />
                  <MetricCard
                    title="Pagamento"
                    value={order.is_paid ? "Pago" : "Não pago"}
                    subtitle={order.paid_at ? fmtDT(order.paid_at) : order.payment_method ?? "—"}
                  />
                </div>

                <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                  <div className="text-sm font-semibold text-slate-900">Datas do pedido</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Linha do tempo do processo.
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Criado
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        {fmtDT(order.created_at)}
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Enviado
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        {fmtDT(order.submitted_at)}
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Aprovado
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        {fmtDT(order.approved_at)}
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Previsão
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        {fmtYMD(order.delivery_forecast)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                  <div className="text-sm font-semibold text-slate-900">Observações</div>
                  <div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {order.notes ?? "—"}
                  </div>
                </div>

                <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        Itens atuais ({items.length})
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Itens considerados no pedido final.
                      </div>
                    </div>
                  </div>

                  {items.length === 0 ? (
                    <div className="mt-6 text-sm text-slate-600">Nenhum item.</div>
                  ) : (
                    <div className="mt-6 overflow-x-auto">
                      <table className="w-full border-separate border-spacing-0">
                        <thead>
                          <tr className="text-left text-xs text-slate-600">
                            <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                              SKU
                            </th>
                            <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                              Produto
                            </th>
                            <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                              Unid.
                            </th>
                            <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-right">
                              Preço
                            </th>
                            <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-right">
                              Qtd
                            </th>
                            <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-right">
                              Total
                            </th>
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
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4">
                                  <div className="font-mono text-xs text-slate-600">{sku}</div>
                                </td>
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 text-sm text-slate-900">
                                  {name}
                                </td>
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 text-sm text-slate-700">
                                  {unit}
                                </td>
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 text-right text-sm text-slate-900">
                                  {money(unitCost)}
                                </td>
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 text-right font-semibold text-slate-900">
                                  {qty}
                                </td>
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 text-right font-semibold text-slate-900">
                                  {money(line)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {edited && originalItems && originalItems.length > 0 ? (
                  <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          Pedido original do franqueado ({originalItems.length})
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          Snapshot salvo em {fmtDT(order.edited_at)}.
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Total original
                        </div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">
                          {money(originalTotal)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 overflow-x-auto">
                      <table className="w-full border-separate border-spacing-0">
                        <thead>
                          <tr className="text-left text-xs text-slate-600">
                            <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                              SKU
                            </th>
                            <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                              Produto
                            </th>
                            <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                              Unid.
                            </th>
                            <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-right">
                              Preço
                            </th>
                            <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-right">
                              Qtd
                            </th>
                            <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-right">
                              Total
                            </th>
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
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4">
                                  <div className="font-mono text-xs text-slate-600">{sku}</div>
                                </td>
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 text-sm text-slate-900">
                                  {name}
                                </td>
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 text-sm text-slate-700">
                                  {unit}
                                </td>
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 text-right text-sm text-slate-900">
                                  {money(unitCost)}
                                </td>
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 text-right font-semibold text-slate-900">
                                  {qty}
                                </td>
                                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 text-right font-semibold text-slate-900">
                                  {money(line)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>

              <div>
                <div className="xl:sticky xl:top-24">
                  <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfd_100%)] p-5 shadow-sm md:p-6">
                    <div className="text-lg font-semibold tracking-[-0.02em] text-slate-900">
                      Ações
                    </div>

                    <div className="mt-1 text-sm text-slate-600">
                      Navegação rápida do pedido.
                    </div>

                    <div className="mt-6 grid gap-3">
                      <PrimaryActionButton onClick={() => router.push(backTo)}>
                        Voltar para histórico
                      </PrimaryActionButton>

                      <SecondaryActionButton onClick={refresh} disabled={working || loading}>
                        {working ? "Atualizando..." : "Atualizar pedido"}
                      </SecondaryActionButton>
                    </div>

                    <div className="mt-6 rounded-[22px] border border-slate-200 bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Situação
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge tone={statusTone(order.status)}>{order.status}</Badge>
                        <Badge tone={logisticTone(order.logistic_status)}>
                          {logisticLabel(order.logistic_status)}
                        </Badge>
                        {order.is_paid ? <Badge tone="green">Pago</Badge> : <Badge tone="yellow">Pendente</Badge>}
                      </div>
                    </div>

                    <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Entrega
                      </div>

                      <div className="mt-3 space-y-2 text-sm text-slate-700">
                        <div className="flex items-center justify-between gap-3">
                          <span>Modalidade</span>
                          <span className="font-semibold text-slate-900">
                            {deliveryLabel(order.delivery_mode)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <span>Previsão</span>
                          <span className="font-semibold text-slate-900">
                            {fmtYMD(order.delivery_forecast)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <span>Vencimento</span>
                          <span className="font-semibold text-slate-900">
                            {fmtYMD(order.due_date)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </PortalShell>
  );
}