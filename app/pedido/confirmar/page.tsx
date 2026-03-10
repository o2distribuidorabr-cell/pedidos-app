"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import PortalShell from "@/app/components/PortalShell";
import { PageHeader, Card, Badge } from "@/app/components/ui";

type CartItem = {
  product_id: string;
  sku: string;
  name: string;
  unit: string;
  unit_cost: number;
  qty: number;

  ncm?: string | null;
  cest?: string | null;
  cfop?: string | null;
  ean?: string | null;
  origin?: string | null;
  icms_cst?: string | null;
  pis_cst?: string | null;
  cofins_cst?: string | null;
};

type StoreRow = {
  id: string;
  name: string;
  freight_fee?: number | null;
};

type DeliveryInfo = {
  delivery_mode: "RETIRADA" | "FRETE";
  freight_fee: number;
  store_name?: string;
};

function money(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function normalizeCartItems(raw: any): CartItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it: any) => ({
      product_id: String(it?.product_id ?? ""),
      sku: String(it?.sku ?? ""),
      name: String(it?.name ?? ""),
      unit: String(it?.unit ?? "un"),
      unit_cost: Number(it?.unit_cost ?? 0) || 0,
      qty: Number(it?.qty ?? 0) || 0,

      ncm: it?.ncm ?? null,
      cest: it?.cest ?? null,
      cfop: it?.cfop ?? null,
      ean: it?.ean ?? null,
      origin: it?.origin ?? null,
      icms_cst: it?.icms_cst ?? null,
      pis_cst: it?.pis_cst ?? null,
      cofins_cst: it?.cofins_cst ?? null,
    }))
    .filter((x) => !!x.product_id && x.qty > 0);
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
        "inline-flex h-12 items-center justify-center rounded-[18px] px-5 text-sm font-semibold text-white transition",
        "bg-cyan-600 shadow-[0_14px_34px_rgba(8,145,178,0.26)] hover:bg-cyan-700",
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
        "inline-flex h-12 items-center justify-center rounded-[18px] px-5 text-sm font-semibold transition",
        "border border-slate-200 bg-white text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] hover:bg-slate-50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        fullWidth ? "w-full" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SegmentedSwitch({
  value,
  onChange,
  disabled,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white/80 p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={[
                "h-11 rounded-[16px] px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                active
                  ? "bg-cyan-600 text-white shadow-[0_12px_24px_rgba(8,145,178,0.22)]"
                  : "bg-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              ].join(" ")}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
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

  const [deliveryMode, setDeliveryMode] = useState<"RETIRADA" | "FRETE">("RETIRADA");
  const [freightFee, setFreightFee] = useState<number>(0);
  const [storeFreightFee, setStoreFreightFee] = useState<number>(0);

  const itemsTotal = useMemo(
    () =>
      items.reduce(
        (acc, it) => acc + (Number(it.qty) || 0) * (Number(it.unit_cost) || 0),
        0
      ),
    [items]
  );

  const selectedItemsCount = useMemo(() => items.length, [items]);

  const selectedUnitsCount = useMemo(() => {
    return items.reduce((acc, it) => acc + (Number(it.qty) || 0), 0);
  }, [items]);

  const freightApplied = useMemo(
    () => (deliveryMode === "FRETE" ? Number(freightFee || 0) : 0),
    [deliveryMode, freightFee]
  );

  const grandTotal = useMemo(
    () => itemsTotal + freightApplied,
    [itemsTotal, freightApplied]
  );

  function persistDelivery(mode: "RETIRADA" | "FRETE", fee: number) {
    const payload: DeliveryInfo = {
      delivery_mode: mode,
      freight_fee: mode === "FRETE" ? Number(fee || 0) : 0,
      store_name: storeName,
    };
    localStorage.setItem("delivery_info", JSON.stringify(payload));
  }

  async function applyDeliveryMode(mode: "RETIRADA" | "FRETE") {
    setDeliveryMode(mode);

    const fee = mode === "FRETE" ? Number(storeFreightFee || 0) : 0;
    setFreightFee(mode === "FRETE" ? fee : 0);
    persistDelivery(mode, fee);
  }

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

      const raw = localStorage.getItem("cart_items");
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      setItems(normalizeCartItems(parsed));

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
        .select("id,name,freight_fee")
        .eq("id", sId)
        .maybeSingle();

      if (sErr) {
        setMsg(sErr.message);
        setLoading(false);
        return;
      }

      const st = (store ?? null) as StoreRow | null;
      const stName = st?.name ?? "Loja não encontrada";
      const stFreight = Number(st?.freight_fee ?? 0) || 0;

      setStoreName(stName);
      setStoreFreightFee(stFreight);

      const rawDelivery = localStorage.getItem("delivery_info");
      const dParsed = rawDelivery
        ? (JSON.parse(rawDelivery) as Partial<DeliveryInfo>)
        : null;

      const dMode =
        dParsed?.delivery_mode === "FRETE" || dParsed?.delivery_mode === "RETIRADA"
          ? dParsed.delivery_mode
          : "RETIRADA";

      const effectiveFee = dMode === "FRETE" ? stFreight : 0;

      setDeliveryMode(dMode);
      setFreightFee(effectiveFee);
      persistDelivery(dMode, stFreight);

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const freight_fee =
      delivery_mode === "FRETE" ? Number(storeFreightFee || 0) : 0;

    const { data: orderInserted, error: orderError } = await supabase
      .from("orders")
      .insert({
        store_id: storeId,
        status,
        notes: notes.trim() || null,
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

    const order_id = String(orderInserted.id);

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
      <PortalShell title="Confirmar pedido" subtitle="Carregando...">
        <Card>
          <div className="text-sm text-slate-600">Carregando...</div>
        </Card>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      title="Confirmar pedido"
      subtitle={storeName && storeName !== "-" ? `Loja: ${storeName}` : "Revise antes de enviar"}
    >
      <div className="space-y-6">
        <PageHeader
          title="Confirmar pedido"
          subtitle={`Usuário: ${userEmail} • Loja: ${storeName}`}
          right={
            <div className="flex flex-wrap gap-2">
              <SecondaryActionButton
                onClick={() => router.push("/pedido")}
                disabled={sending}
              >
                Voltar
              </SecondaryActionButton>

              <PrimaryActionButton
                onClick={onSubmit}
                disabled={sending || items.length === 0}
              >
                {sending ? "Enviando..." : `Enviar (${money(grandTotal)})`}
              </PrimaryActionButton>
            </div>
          }
        />

        {msg ? (
          <Card title="Erro">
            <div className="text-sm whitespace-pre-wrap text-red-600">{msg}</div>
          </Card>
        ) : null}

        {items.length === 0 ? (
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-sm text-slate-700">
              Seu carrinho está vazio.{" "}
              <button
                className="font-semibold text-cyan-700 underline"
                onClick={() => router.push("/pedido")}
              >
                Voltar para novo pedido
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-5 shadow-sm md:p-6">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Entrega</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Você ainda pode alterar a forma de entrega antes de enviar.
                    </div>

                    <div className="mt-4 max-w-md">
                      <SegmentedSwitch
                        value={deliveryMode}
                        onChange={(v) => applyDeliveryMode(v as "RETIRADA" | "FRETE")}
                        disabled={sending}
                        options={[
                          { value: "RETIRADA", label: "Retirada" },
                          { value: "FRETE", label: "Frete" },
                        ]}
                      />
                    </div>

                    <div className="mt-3 text-xs text-slate-500">
                      O total do pedido inclui o frete somente quando <b>Frete</b> estiver selecionado.
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Resumo da entrega
                    </div>

                    <div className="mt-4 grid gap-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-600">Modalidade</span>
                        {deliveryMode === "FRETE" ? (
                          <Badge tone="yellow">Frete</Badge>
                        ) : (
                          <Badge tone="neutral">Retirada</Badge>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-600">Frete aplicado</span>
                        <span className="text-sm font-semibold text-slate-900">
                          {money(freightApplied)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-600">Itens</span>
                        <span className="text-sm font-semibold text-slate-900">
                          {selectedItemsCount}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Itens do pedido ({items.length})
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Revise os itens e quantidades antes do envio.
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Quantidade total
                    </div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {selectedUnitsCount}
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-4">
                  {items.map((it) => {
                    const line = (Number(it.qty) || 0) * (Number(it.unit_cost) || 0);

                    return (
                      <div
                        key={it.product_id}
                        className="rounded-[26px] border border-slate-200 bg-white p-4 transition md:p-5"
                      >
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-base font-semibold text-slate-900">
                                {it.name}
                              </div>
                              <Badge tone="blue">Confirmado</Badge>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                              <span className="font-mono text-xs text-slate-500">
                                SKU {it.sku}
                              </span>
                              <span>Unidade: {it.unit}</span>
                              <span className="font-semibold text-slate-900">
                                {money(Number(it.unit_cost || 0))}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col gap-3 xl:items-end">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-center">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Quantidade
                              </div>
                              <div className="mt-1 text-lg font-semibold text-slate-900">
                                {it.qty}
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Total do item
                              </div>
                              <div className="text-lg font-semibold text-slate-900">
                                {money(line)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                <div className="text-sm font-semibold text-slate-900">Observações</div>
                <div className="mt-1 text-sm text-slate-600">Opcional</div>

                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex.: entregar até sexta-feira; substituir item X se faltar..."
                  className="mt-4 min-h-[130px] w-full rounded-[22px] border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                  disabled={sending}
                />
              </div>
            </div>

            <div>
              <div className="xl:sticky xl:top-24">
                <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfd_100%)] p-5 shadow-sm md:p-6">
                  <div className="text-lg font-semibold tracking-[-0.02em] text-slate-900">
                    Resumo final
                  </div>

                  <div className="mt-1 text-sm text-slate-600">
                    Confira os valores antes do envio.
                  </div>

                  <div className="mt-6 space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Itens
                      </div>
                      <div className="mt-1 text-2xl font-semibold text-slate-900">
                        {selectedItemsCount}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Quantidade total: {selectedUnitsCount}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-600">Subtotal dos itens</span>
                        <span className="text-sm font-semibold text-slate-900">
                          {money(itemsTotal)}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-600">Frete</span>
                        <span className="text-sm font-semibold text-slate-900">
                          {money(freightApplied)}
                        </span>
                      </div>

                      <div className="my-4 h-px bg-slate-200" />

                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Total do pedido
                          </div>
                          <div className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-slate-900">
                            {money(grandTotal)}
                          </div>
                        </div>

                        {deliveryMode === "FRETE" ? (
                          <Badge tone="yellow">Frete</Badge>
                        ) : (
                          <Badge tone="neutral">Retirada</Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <PrimaryActionButton
                        onClick={onSubmit}
                        disabled={sending || items.length === 0}
                        fullWidth
                      >
                        {sending ? "Enviando..." : "Enviar pedido"}
                      </PrimaryActionButton>

                      <SecondaryActionButton
                        onClick={() => router.push("/pedido")}
                        disabled={sending}
                        fullWidth
                      >
                        Voltar ao pedido
                      </SecondaryActionButton>
                    </div>

                    {items.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        Seu carrinho está vazio.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}