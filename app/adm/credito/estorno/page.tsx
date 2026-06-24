"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PageHeader, Card, Select, Badge, StatCard } from "@/app/components/ui";

function money(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtBR(iso: string | null | undefined) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return String(iso);
  }
}

function PrimaryActionButton({
  children,
  onClick,
  disabled,
  fullWidth,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-11 items-center justify-center rounded-[18px] px-4 text-sm font-semibold text-white transition",
        "bg-cyan-600 shadow-[0_14px_34px_rgba(8,145,178,0.22)] hover:bg-cyan-700",
        "disabled:cursor-not-allowed disabled:opacity-50",
        fullWidth ? "w-full" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SecondaryActionButton({
  children,
  onClick,
  disabled,
  fullWidth,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-11 items-center justify-center rounded-[18px] px-4 text-sm font-semibold transition",
        "border border-slate-200 bg-white text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] hover:bg-slate-50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        fullWidth ? "w-full" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function DangerActionButton({
  children,
  onClick,
  disabled,
  fullWidth,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-11 items-center justify-center rounded-[18px] px-4 text-sm font-semibold text-white transition",
        "bg-red-600 shadow-[0_14px_34px_rgba(220,38,38,0.22)] hover:bg-red-700",
        "disabled:cursor-not-allowed disabled:opacity-50",
        fullWidth ? "w-full" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <div className="text-sm text-slate-600">{text}</div>
    </div>
  );
}

type StoreRow = { id: string; name: string | null };

type OrderWithCredit = {
  id: string;
  created_at: string | null;
  submitted_at: string | null;
  credit_applied: number;
  is_paid: boolean | null;
  payment_method: string | null;
  status: string | null;
};

export default function EstornoCreditoPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [balance, setBalance] = useState<number | null>(null);

  const [orders, setOrders] = useState<OrderWithCredit[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");

  const [confirmStep, setConfirmStep] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        router.push("/login");
        return;
      }

      const { data, error } = await supabase
        .from("stores")
        .select("id,name")
        .order("name", { ascending: true });

      if (!error) setStores((data ?? []) as StoreRow[]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedStore) {
      setOrders([]);
      setBalance(null);
      setSelectedIds(new Set());
      setConfirmStep(false);
      return;
    }
    void loadBalance(selectedStore);
    void loadOrders(selectedStore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStore]);

  async function loadBalance(storeId: string) {
    const { data } = await supabase
      .from("v_store_credit_balance")
      .select("balance")
      .eq("store_id", storeId)
      .maybeSingle();
    setBalance(Number(data?.balance ?? 0));
  }

  async function loadOrders(storeId: string) {
    setLoading(true);
    setMsg("");
    const { data, error } = await supabase
      .from("orders")
      .select("id,created_at,submitted_at,credit_applied,is_paid,payment_method,status")
      .eq("store_id", storeId)
      .gt("credit_applied", 0)
      .order("created_at", { ascending: false });

    if (error) {
      setMsg(error.message);
      setOrders([]);
    } else {
      setOrders(
        (data ?? []).map((o: any) => ({
          ...o,
          credit_applied: Number(o.credit_applied ?? 0),
        }))
      );
    }
    setSelectedIds(new Set());
    setLoading(false);
  }

  const totalSelected = useMemo(
    () =>
      orders
        .filter((o) => selectedIds.has(o.id))
        .reduce((sum, o) => sum + o.credit_applied, 0),
    [orders, selectedIds]
  );

  const allSelected = orders.length > 0 && selectedIds.size === orders.length;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orders.map((o) => o.id)));
    }
  }

  function toggleOrder(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function doReversal() {
    if (selectedIds.size === 0) return;
    setWorking(true);
    setMsg("");
    setSuccessMsg("");

    const ids = Array.from(selectedIds);
    const creditTotal = totalSelected;

    const { error } = await supabase.rpc("reverse_orders_credit", {
      p_order_ids: ids,
      p_note: note.trim() || null,
    });

    if (error) {
      setMsg(error.message);
      setWorking(false);
      setConfirmStep(false);
      return;
    }

    setSuccessMsg(
      `${ids.length} pedido(s) estornado(s) com sucesso. Total devolvido ao saldo: ${money(creditTotal)}.`
    );
    setConfirmStep(false);
    setNote("");
    await loadOrders(selectedStore);
    await loadBalance(selectedStore);
    setWorking(false);
  }

  const storeName = stores.find((s) => s.id === selectedStore)?.name ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estorno de crédito em pedidos"
        subtitle="Reverta crédito aplicado incorretamente em pedidos para corrigir o saldo da loja"
        right={
          <div className="flex flex-wrap gap-2">
            <SecondaryActionButton onClick={() => router.push("/adm/credito")}>
              Extrato
            </SecondaryActionButton>
            <SecondaryActionButton onClick={() => router.push("/adm/lojas")}>
              Lojas
            </SecondaryActionButton>
          </div>
        }
      />

      <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
        <p>
          <b>Como usar:</b> selecione a loja, marque os pedidos com crédito aplicado incorretamente
          e clique em <b>Estornar selecionados</b>.
        </p>
        <ul className="mt-2 list-disc pl-4 space-y-1">
          <li>O crédito de cada pedido será devolvido ao saldo da loja.</li>
          <li>Pedidos pagos <b>100% por crédito</b> voltarão para o status <b>não pago</b>.</li>
          <li>
            Pedidos com crédito <b>parcial</b> mantêm o status de pagamento — apenas o crédito
            aplicado é zerado.
          </li>
          <li>
            Após o estorno, acesse <b>Lojas</b> para ajustar o saldo para o valor correto.
          </li>
        </ul>
      </div>

      {msg ? (
        <Card>
          <div className="text-sm text-red-600">{msg}</div>
        </Card>
      ) : null}

      {successMsg ? (
        <div className="rounded-[22px] border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800">
          <b>{successMsg}</b>
          <div className="mt-2">
            Agora acesse{" "}
            <button
              type="button"
              className="underline font-semibold"
              onClick={() => router.push("/adm/lojas")}
            >
              Lojas → Crédito
            </button>{" "}
            para remover o excesso e deixar o saldo no valor correto.
          </div>
        </div>
      ) : null}

      {/* Seleção de loja */}
      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <SectionTitle
          title="Loja"
          subtitle="Selecione a loja para ver os pedidos com crédito aplicado"
        />

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Select
            label="Loja"
            value={selectedStore}
            onChange={(v) => {
              setSelectedStore(v);
              setConfirmStep(false);
              setMsg("");
              setSuccessMsg("");
            }}
            options={[
              { value: "", label: "Selecione uma loja..." },
              ...stores.map((s) => ({ value: s.id, label: s.name ?? s.id })),
            ]}
          />

          {balance !== null && selectedStore ? (
            <StatCard label={`Saldo atual — ${storeName}`} value={money(balance)} />
          ) : null}
        </div>
      </div>

      {/* Pedidos */}
      {selectedStore ? (
        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <SectionTitle
            title="Pedidos com crédito aplicado"
            subtitle={
              loading
                ? "Carregando..."
                : `${orders.length} pedido(s) encontrado(s) para ${storeName}`
            }
            right={
              orders.length > 0 && !loading ? (
                <SecondaryActionButton onClick={toggleAll} disabled={working}>
                  {allSelected ? "Desmarcar todos" : "Selecionar todos"}
                </SecondaryActionButton>
              ) : null
            }
          />

          <div className="mt-6">
            {loading ? (
              <div className="text-sm text-slate-600">Carregando pedidos...</div>
            ) : orders.length === 0 ? (
              <EmptyState text="Nenhum pedido com crédito aplicado encontrado para esta loja." />
            ) : (
              <div className="space-y-3">
                {orders.map((o) => {
                  const checked = selectedIds.has(o.id);
                  const isFullyPaidByCredit = o.payment_method === "PREPAGO";
                  return (
                    <label
                      key={o.id}
                      className={[
                        "flex cursor-pointer items-start gap-3 rounded-[22px] border px-4 py-3 transition select-none",
                        checked
                          ? "border-cyan-300 bg-cyan-50"
                          : "border-slate-200 bg-white hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOrder(o.id)}
                        disabled={working}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-cyan-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-slate-500">
                            {o.id.slice(0, 8)}…
                          </span>
                          <Badge tone={o.is_paid ? "green" : "red"}>
                            {o.is_paid ? "Pago" : "Não pago"}
                          </Badge>
                          <Badge tone={isFullyPaidByCredit ? "blue" : "green"}>
                            {isFullyPaidByCredit ? "100% crédito" : "Crédito parcial"}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>{fmtBR(o.submitted_at ?? o.created_at)}</span>
                          {o.payment_method && o.payment_method !== "PREPAGO" ? (
                            <span>Método: {o.payment_method}</span>
                          ) : null}
                          <span className="capitalize">Status: {o.status ?? "—"}</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold text-slate-900">
                          {money(o.credit_applied)}
                        </div>
                        <a
                          href={`/adm/pedidos/${o.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-cyan-600 underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Ver pedido
                        </a>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {orders.length > 0 && !loading ? (
            <div className="mt-6 space-y-4">
              {/* Preview */}
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4 grid gap-4 md:grid-cols-3">
                <StatCard label="Pedidos selecionados" value={String(selectedIds.size)} />
                <StatCard label="Crédito a estornar" value={money(totalSelected)} />
                <StatCard
                  label="Saldo após estorno"
                  value={balance !== null ? money(balance + totalSelected) : "-"}
                />
              </div>

              {/* Motivo */}
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Motivo / Observação
                </div>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={working}
                  placeholder="Ex.: Correção — crédito gerado a maior em 24/06/2025"
                  className="h-11 w-full rounded-[18px] border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-300 disabled:opacity-50"
                />
              </div>

              {!confirmStep ? (
                <PrimaryActionButton
                  onClick={() => {
                    if (selectedIds.size === 0) {
                      setMsg("Selecione ao menos um pedido.");
                      return;
                    }
                    setMsg("");
                    setConfirmStep(true);
                  }}
                  disabled={working || selectedIds.size === 0}
                >
                  Estornar selecionados ({selectedIds.size})
                </PrimaryActionButton>
              ) : (
                <div className="rounded-[22px] border border-red-200 bg-red-50 p-4 space-y-3">
                  <div className="text-sm font-semibold text-red-800">
                    Confirmar estorno de {selectedIds.size} pedido(s)?
                  </div>
                  <div className="text-sm text-red-700">
                    O valor de <b>{money(totalSelected)}</b> será devolvido ao saldo de{" "}
                    <b>{storeName}</b>. Pedidos pagos 100% por crédito voltarão para{" "}
                    <b>não pago</b>. Esta ação cria lançamentos no ledger e não pode ser
                    desfeita automaticamente.
                  </div>
                  <div className="flex gap-2">
                    <SecondaryActionButton
                      onClick={() => setConfirmStep(false)}
                      disabled={working}
                    >
                      Cancelar
                    </SecondaryActionButton>
                    <DangerActionButton onClick={doReversal} disabled={working}>
                      {working ? "Processando..." : "Confirmar estorno"}
                    </DangerActionButton>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
