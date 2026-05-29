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
  default_payment_method?: "PIX" | "CARTAO" | "BOLETO" | null;
  default_payment_days?: number | null;
};

// Formas de pagamento disponíveis para a loja (tabela store_payment_methods)
type StorePaymentMethod = {
  payment_method:
    | "PIX"
    | "PIX_1D"
    | "PIX_7D"
    | "CREDIT_CARD"
    | "CREDIT_CARD_ONLINE"
    | "BOLETO"
    | "CREDIT_PREPAGO";
  is_default: boolean;
  requires_payment_before_submit: boolean;
  fee_percent?: number | null;
};

// Mapeamento entre payment_method interno e o enum da tabela orders
type OrderPaymentMethod = "PIX" | "CARTAO" | "BOLETO" | "PREPAGO";

function mapToOrderPaymentMethod(m: StorePaymentMethod["payment_method"]): OrderPaymentMethod {
  if (m === "CREDIT_CARD" || m === "CREDIT_CARD_ONLINE") return "CARTAO";
  if (m === "BOLETO") return "BOLETO";
  if (m === "CREDIT_PREPAGO") return "PREPAGO";
  return "PIX"; // PIX, PIX_1D, PIX_7D
}

function paymentMethodLabel(m: StorePaymentMethod["payment_method"]) {
  const labels: Record<string, string> = {
    PIX: "PIX",
    PIX_1D: "Pix — 1 dia",
    PIX_7D: "Pix — 7 dias",
    CREDIT_CARD: "Cartão de crédito",
    CREDIT_CARD_ONLINE: "Cartão de crédito online",
    BOLETO: "Boleto",
    CREDIT_PREPAGO: "Crédito Pré-Pago",
  };
  return labels[m] ?? m;
}

function paymentMethodIcon(m: StorePaymentMethod["payment_method"]) {
  if (m === "CREDIT_CARD" || m === "CREDIT_CARD_ONLINE") return "💳";
  if (m === "BOLETO") return "📄";
  if (m === "CREDIT_PREPAGO") return "🪙";
  return "⚡"; // PIX, PIX_1D, PIX_7D
}

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
  const [storeDefaultPaymentMethod, setStoreDefaultPaymentMethod] = useState<"PIX" | "CARTAO" | "BOLETO" | null>(null);

  // Formas de pagamento disponíveis e selecionada
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState<StorePaymentMethod[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<StorePaymentMethod["payment_method"] | null>(null);
  const [payingWithCard, setPayingWithCard] = useState(false);

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

  // Acréscimo do método de pagamento (ex: 4,25% no cartão online)
  const selectedMethodData = useMemo(
    () => availablePaymentMethods.find((m) => m.payment_method === selectedPaymentMethod) ?? null,
    [availablePaymentMethods, selectedPaymentMethod]
  );
  const feePercent = Number(selectedMethodData?.fee_percent ?? 0) || 0;
  const feeAmount = useMemo(
    () => (feePercent > 0 ? Math.round(grandTotal * feePercent) / 100 : 0),
    [grandTotal, feePercent]
  );
  const totalWithFee = useMemo(() => grandTotal + feeAmount, [grandTotal, feeAmount]);

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
        .select("id,name,freight_fee,default_payment_method,default_payment_days")
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
      setStoreDefaultPaymentMethod(st?.default_payment_method ?? null);

      // Carrega formas de pagamento disponíveis para esta loja (store_payment_methods)
      const { data: spmRows } = await supabase
        .from("store_payment_methods")
        .select("payment_method,is_default,requires_payment_before_submit,fee_percent")
        .eq("store_id", sId)
        .eq("enabled", true)
        .order("is_default", { ascending: false });

      let methods: StorePaymentMethod[] = (spmRows ?? []) as StorePaymentMethod[];

      // Fallback: se a tabela ainda estiver vazia para esta loja, usa default_payment_method
      if (methods.length === 0) {
        const legacyMethod = st?.default_payment_method;
        if (legacyMethod === "CARTAO") {
          methods = [{ payment_method: "CREDIT_CARD", is_default: true, requires_payment_before_submit: true }];
        } else if (legacyMethod === "BOLETO") {
          methods = [{ payment_method: "BOLETO", is_default: true, requires_payment_before_submit: false }];
        } else {
          // PIX (padrão) — comportamento original mantido
          methods = [{ payment_method: "PIX", is_default: true, requires_payment_before_submit: false }];
        }
      }

      setAvailablePaymentMethods(methods);

      // Pré-seleciona o método padrão (ou o único disponível)
      const defaultMethod = methods.find((m) => m.is_default) ?? methods[0] ?? null;
      setSelectedPaymentMethod(defaultMethod?.payment_method ?? null);

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

    if (!selectedPaymentMethod) {
      setMsg("Selecione uma forma de pagamento para continuar.");
      return;
    }

    const isCreditCard =
      selectedPaymentMethod === "CREDIT_CARD" ||
      selectedPaymentMethod === "CREDIT_CARD_ONLINE";
    const requiresPayment =
      availablePaymentMethods.find((m) => m.payment_method === selectedPaymentMethod)
        ?.requires_payment_before_submit ?? isCreditCard;

    setSending(true);
    if (isCreditCard) setPayingWithCard(true);

    const now = new Date().toISOString();
    const delivery_mode: "RETIRADA" | "FRETE" = deliveryMode;
    const freight_fee =
      delivery_mode === "FRETE" ? Number(storeFreightFee || 0) : 0;
    const orderPaymentMethod = mapToOrderPaymentMethod(selectedPaymentMethod);

    // ── Pedido com cartão de crédito: status inicial = awaiting_payment ────
    // ── Outros métodos (PIX, etc.): status inicial = submitted (fluxo atual) ─
    const orderStatus = requiresPayment ? "awaiting_payment" : "submitted";
    const submittedAt = requiresPayment ? null : now;

    const { data: orderInserted, error: orderError } = await supabase
      .from("orders")
      .insert({
        store_id: storeId,
        status: orderStatus,
        notes: notes.trim() || null,
        created_by: user.id,
        created_at: now,
        submitted_at: submittedAt,
        approved_at: null,
        delivery_mode,
        freight_fee,
        payment_method: orderPaymentMethod,
      })
      .select("id")
      .single();

    if (orderError || !orderInserted?.id) {
      setSending(false);
      setPayingWithCard(false);
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
      setPayingWithCard(false);
      setMsg(itemsError.message);
      return;
    }

    // ── Fluxo cartão de crédito ────────────────────────────────────────────
    if (isCreditCard) {
      try {
        const res = await fetch("/api/asaas/credit-card", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: order_id, paymentMethodCode: selectedPaymentMethod }),
        });
        const data = await res.json();

        if (!res.ok || !data.ok || !data.invoiceUrl) {
          setMsg(data.details || data.error || "Erro ao gerar cobrança com cartão. Tente novamente.");
          setSending(false);
          setPayingWithCard(false);
          return;
        }

        localStorage.removeItem("cart_items");
        localStorage.removeItem("delivery_info");

        // Redireciona para a página de pagamento segura da Asaas
        window.location.href = data.invoiceUrl;
        return;
      } catch {
        setMsg("Erro de conexão ao criar cobrança. Tente novamente.");
        setSending(false);
        setPayingWithCard(false);
        return;
      }
    }

    // ── Fluxo PIX / outros métodos (comportamento original intacto) ─────────
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
                disabled={sending || items.length === 0 || !selectedPaymentMethod}
              >
                {payingWithCard
                  ? "Criando cobrança..."
                  : sending
                  ? "Enviando..."
                  : (selectedPaymentMethod === "CREDIT_CARD" || selectedPaymentMethod === "CREDIT_CARD_ONLINE")
                  ? `Pagar (${money(totalWithFee)})`
                  : `Enviar (${money(grandTotal)})`}
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

                      {feePercent > 0 ? (
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className="text-sm text-amber-700 font-medium">
                            Acréscimo cartão ({feePercent}%)
                          </span>
                          <span className="text-sm font-semibold text-amber-700">
                            +{money(feeAmount)}
                          </span>
                        </div>
                      ) : null}

                      <div className="my-4 h-px bg-slate-200" />

                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Total do pedido
                          </div>
                          <div className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-slate-900">
                            {money(totalWithFee)}
                          </div>
                          {feePercent > 0 ? (
                            <div className="mt-1 text-xs text-slate-500">
                              Base: {money(grandTotal)} + acréscimo: {money(feeAmount)}
                            </div>
                          ) : null}
                        </div>

                        {deliveryMode === "FRETE" ? (
                          <Badge tone="yellow">Frete</Badge>
                        ) : (
                          <Badge tone="neutral">Retirada</Badge>
                        )}
                      </div>
                    </div>

                    {/* ── Seleção de forma de pagamento ── */}
                    {availablePaymentMethods.length > 0 ? (
                      <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Forma de pagamento
                        </div>
                        <div className="mt-2 text-xs text-slate-500">
                          Selecione como deseja pagar este pedido.
                        </div>

                        <div className="mt-3 grid gap-2">
                          {availablePaymentMethods.map((m) => {
                            const active = selectedPaymentMethod === m.payment_method;
                            const mFee = Number(m.fee_percent ?? 0) || 0;
                            return (
                              <button
                                key={m.payment_method}
                                type="button"
                                disabled={sending}
                                onClick={() => setSelectedPaymentMethod(m.payment_method)}
                                className={[
                                  "flex items-center gap-3 rounded-[16px] border px-4 py-3 text-left text-sm font-semibold transition",
                                  "disabled:cursor-not-allowed disabled:opacity-50",
                                  active
                                    ? "border-cyan-300 bg-cyan-50 text-cyan-800 shadow-[0_4px_14px_rgba(8,145,178,0.12)]"
                                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                                ].join(" ")}
                              >
                                <span className="text-lg leading-none">
                                  {paymentMethodIcon(m.payment_method)}
                                </span>
                                <span className="flex-1">{paymentMethodLabel(m.payment_method)}</span>
                                {mFee > 0 ? (
                                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                    +{mFee}%
                                  </span>
                                ) : null}
                                {active ? (
                                  <span className="ml-auto h-4 w-4 shrink-0 rounded-full bg-cyan-500 text-white flex items-center justify-center text-[9px] font-bold">✓</span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>

                        {/* Aviso cartão de crédito online — acréscimo + redirecionamento */}
                        {(selectedPaymentMethod === "CREDIT_CARD" || selectedPaymentMethod === "CREDIT_CARD_ONLINE") ? (
                          <div className="mt-3 rounded-[14px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            {feePercent > 0 ? (
                              <p className="mb-1">
                                <b>Acréscimo de {feePercent}% ({money(feeAmount)})</b> incluso por pagamento com cartão de crédito online.
                              </p>
                            ) : null}
                            <p>
                              Você será redirecionado para a página segura de pagamento da Asaas para concluir com cartão de crédito. O pedido só entrará em processamento após a confirmação do pagamento.
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="grid gap-3">
                      <PrimaryActionButton
                        onClick={onSubmit}
                        disabled={sending || items.length === 0 || !selectedPaymentMethod}
                        fullWidth
                      >
                        {payingWithCard
                          ? "Criando cobrança..."
                          : sending
                          ? "Enviando..."
                          : (selectedPaymentMethod === "CREDIT_CARD" || selectedPaymentMethod === "CREDIT_CARD_ONLINE")
                          ? `Pagar e finalizar — ${money(totalWithFee)}`
                          : "Enviar pedido"}
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