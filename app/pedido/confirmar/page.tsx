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
  credit_card_provider?: string | null;
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

  // Modal de pagamento + crédito pré-pago
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [creditBalance, setCreditBalance] = useState(0);
  const [useCredit, setUseCredit] = useState(false);

  // Provedor de cartão de crédito desta loja (ASAAS ou MERCADOPAGO)
  const [creditCardProvider, setCreditCardProvider] = useState<string>("ASAAS");

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

  // Crédito pré-pago — disponível sempre que houver saldo, independente da config de métodos
  const hasCreditPrepago = creditBalance > 0;
  const nonCreditMethods = useMemo(
    () => availablePaymentMethods.filter((m) => m.payment_method !== "CREDIT_PREPAGO"),
    [availablePaymentMethods]
  );
  const creditToApply = useMemo(() => {
    if (!useCredit || creditBalance <= 0) return 0;
    return Math.min(creditBalance, grandTotal);
  }, [useCredit, creditBalance, grandTotal]);
  const baseAfterCredit = useMemo(
    () => Math.max(grandTotal - creditToApply, 0),
    [grandTotal, creditToApply]
  );
  const fullyPaidByCredit = creditToApply > 0 && baseAfterCredit <= 0;

  // Acréscimo aplicado apenas sobre o valor restante após abatimento do crédito
  const selectedMethodData = useMemo(
    () => availablePaymentMethods.find((m) => m.payment_method === selectedPaymentMethod) ?? null,
    [availablePaymentMethods, selectedPaymentMethod]
  );
  // Mercado Pago não cobra acréscimo ao franqueado — taxa absorvida internamente
  const isCreditCardMethod =
    selectedPaymentMethod === "CREDIT_CARD" || selectedPaymentMethod === "CREDIT_CARD_ONLINE";
  const feePercent =
    isCreditCardMethod && creditCardProvider === "MERCADOPAGO"
      ? 0
      : Number(selectedMethodData?.fee_percent ?? 0) || 0;
  const feeAmount = useMemo(
    () => (feePercent > 0 ? Math.round(baseAfterCredit * feePercent) / 100 : 0),
    [baseAfterCredit, feePercent]
  );
  const finalPayAmount = useMemo(
    () => baseAfterCredit + feeAmount,
    [baseAfterCredit, feeAmount]
  );
  // totalWithFee = valor final a pagar (inclui crédito abatido + fee sobre o restante)
  const totalWithFee = useMemo(
    () => creditToApply + finalPayAmount,
    [creditToApply, finalPayAmount]
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
        .select("id,name,freight_fee,default_payment_method,default_payment_days,credit_card_provider")
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
      setCreditCardProvider(st?.credit_card_provider ?? "ASAAS");

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

      // Pré-seleciona o método padrão entre os não-crédito
      const nonCredit = methods.filter((m) => m.payment_method !== "CREDIT_PREPAGO");
      const defaultMethod = nonCredit.find((m) => m.is_default) ?? nonCredit[0] ?? null;
      setSelectedPaymentMethod(defaultMethod?.payment_method ?? null);

      // Carrega saldo de crédito pré-pago — sempre, independente da configuração de métodos
      if (sId) {
        const { data: balData } = await supabase
          .from("v_store_credit_balance")
          .select("balance")
          .eq("store_id", sId)
          .maybeSingle();
        const bal = Number((balData as any)?.balance ?? 0) || 0;
        setCreditBalance(bal);
        if (bal > 0) setUseCredit(true); // ativa automaticamente se houver saldo
      }

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
    setShowPaymentModal(false);

    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;

    if (!user) { router.push("/login"); return; }
    if (!storeId) { setMsg("Seu usuário não tem loja vinculada."); return; }
    if (items.length === 0) { setMsg("Carrinho vazio."); return; }

    // Validação: se não totalmente coberto por crédito, precisa de um método
    if (!fullyPaidByCredit && !selectedPaymentMethod) {
      setMsg("Selecione uma forma de pagamento para continuar.");
      return;
    }

    const isCreditCard =
      selectedPaymentMethod === "CREDIT_CARD" ||
      selectedPaymentMethod === "CREDIT_CARD_ONLINE";
    const requiresPayment = !fullyPaidByCredit && (
      availablePaymentMethods.find((m) => m.payment_method === selectedPaymentMethod)
        ?.requires_payment_before_submit ?? isCreditCard
    );

    setSending(true);
    if (isCreditCard) setPayingWithCard(true);

    const now = new Date().toISOString();
    const delivery_mode: "RETIRADA" | "FRETE" = deliveryMode;
    const freight_fee = delivery_mode === "FRETE" ? Number(storeFreightFee || 0) : 0;
    const orderPaymentMethod = fullyPaidByCredit
      ? "PREPAGO"
      : mapToOrderPaymentMethod(selectedPaymentMethod!);

    // Crédito totalmente cobre → submitted; cartão → awaiting_payment; resto → submitted
    const orderStatus = requiresPayment ? "awaiting_payment" : "submitted";
    const submittedAt = requiresPayment ? null : now;

    // ── 1. Cria o pedido ────────────────────────────────────────────────────
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
        credit_applied: creditToApply > 0 ? creditToApply : 0,
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

    // ── 2. Cria os itens ────────────────────────────────────────────────────
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

    // ── 3. Debita crédito pré-pago (se usado) ──────────────────────────────
    if (creditToApply > 0) {
      const { error: creditError } = await supabase.rpc("remove_store_credit", {
        p_store_id: storeId,
        p_amount: creditToApply,
        p_note: `Pedido ${order_id.slice(0, 8).toUpperCase()}`,
      });

      if (creditError) {
        // Tenta reverter o pedido
        await supabase.from("order_items").delete().eq("order_id", order_id);
        await supabase.from("orders").delete().eq("id", order_id);
        setSending(false);
        setPayingWithCard(false);
        setMsg("Saldo de crédito insuficiente ou erro ao debitar. Tente novamente.");
        return;
      }
    }

    // ── 4a. Pedido totalmente coberto pelo crédito ─────────────────────────
    if (fullyPaidByCredit) {
      await supabase
        .from("orders")
        .update({ is_paid: true, paid_at: now, paid_amount: creditToApply })
        .eq("id", order_id);

      localStorage.removeItem("cart_items");
      localStorage.removeItem("delivery_info");
      setSending(false);
      router.push("/pedidos");
      return;
    }

    // ── 4b. Cartão de crédito (com ou sem crédito parcial) ─────────────────
    if (isCreditCard) {
      // Roteia para o provedor configurado na loja
      const cardApiUrl = creditCardProvider === "MERCADOPAGO"
        ? "/api/mp/credit-card"
        : "/api/asaas/credit-card";

      try {
        const res = await fetch(cardApiUrl, {
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
        window.location.href = data.invoiceUrl;
        return;
      } catch {
        setMsg("Erro de conexão ao criar cobrança. Tente novamente.");
        setSending(false);
        setPayingWithCard(false);
        return;
      }
    }

    // ── 4c. PIX / outros métodos ────────────────────────────────────────────
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
                onClick={() => setShowPaymentModal(true)}
                disabled={sending || items.length === 0}
              >
                {sending ? (payingWithCard ? "Criando cobrança..." : "Enviando...") : "Finalizar pedido"}
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
                    Resumo do pedido
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    Confira os valores antes de pagar.
                  </div>

                  <div className="mt-6 space-y-4">
                    {/* Contadores */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Produtos</div>
                        <div className="mt-1 text-2xl font-semibold text-slate-900">{selectedItemsCount}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unidades</div>
                        <div className="mt-1 text-2xl font-semibold text-slate-900">{selectedUnitsCount}</div>
                      </div>
                    </div>

                    {/* Breakdown de valores */}
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-600">Subtotal</span>
                        <span className="text-sm font-semibold text-slate-900">{money(itemsTotal)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-600">Frete</span>
                        <span className="text-sm font-semibold text-slate-900">{money(freightApplied)}</span>
                      </div>
                      <div className="h-px bg-slate-100" />
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-700">Total</span>
                        <span className="text-xl font-semibold text-slate-900">{money(grandTotal)}</span>
                      </div>
                    </div>

                    {/* Crédito pré-pago — preview se estiver ativo */}
                    {hasCreditPrepago && creditBalance > 0 && useCredit ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 space-y-1">
                        <div className="flex items-center justify-between gap-2 text-sm font-semibold text-emerald-800">
                          <span>🪙 Crédito pré-pago</span>
                          <span>−{money(creditToApply)}</span>
                        </div>
                        <div className="text-xs text-emerald-700">
                          Saldo disponível: {money(creditBalance)}
                        </div>
                        {!fullyPaidByCredit ? (
                          <div className="text-xs text-emerald-700">
                            Restante a pagar: <b>{money(baseAfterCredit)}</b>
                          </div>
                        ) : (
                          <div className="text-xs font-semibold text-emerald-700">
                            ✓ Saldo cobre o pedido inteiro
                          </div>
                        )}
                      </div>
                    ) : null}

                    {/* Botão principal */}
                    <PrimaryActionButton
                      onClick={() => setShowPaymentModal(true)}
                      disabled={sending || items.length === 0}
                      fullWidth
                    >
                      {sending
                        ? (payingWithCard ? "Criando cobrança..." : "Enviando...")
                        : "Escolher forma de pagamento"}
                    </PrimaryActionButton>

                    <SecondaryActionButton
                      onClick={() => router.push("/pedido")}
                      disabled={sending}
                      fullWidth
                    >
                      Voltar ao pedido
                    </SecondaryActionButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal de pagamento ──────────────────────────────────────────────── */}
      {showPaymentModal ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => { if (!sending) setShowPaymentModal(false); }}
        >
          <div
            className="w-full max-w-lg rounded-t-[32px] sm:rounded-[32px] border border-slate-200 bg-white shadow-2xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do modal */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 rounded-t-[32px] sm:rounded-t-[32px]">
              <div>
                <div className="text-base font-semibold text-slate-900">Como deseja pagar?</div>
                <div className="text-sm text-slate-500">Total do pedido: <span className="font-semibold text-slate-900">{money(grandTotal)}</span></div>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                disabled={sending}
                className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition disabled:opacity-40"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-5">

              {/* ── Seção crédito pré-pago ── */}
              {hasCreditPrepago ? (
                <div className={[
                  "rounded-[22px] border-2 p-4 transition",
                  useCredit ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white",
                ].join(" ")}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none">🪙</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900">Crédito Pré-Pago</span>
                        {/* Toggle */}
                        <button
                          type="button"
                          disabled={sending || creditBalance <= 0}
                          onClick={() => setUseCredit((v) => !v)}
                          className={[
                            "relative h-6 w-11 rounded-full transition-colors focus:outline-none disabled:opacity-40",
                            useCredit ? "bg-emerald-500" : "bg-slate-300",
                          ].join(" ")}
                        >
                          <span className={[
                            "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                            useCredit ? "translate-x-5" : "translate-x-0",
                          ].join(" ")} />
                        </button>
                      </div>

                      {creditBalance > 0 ? (
                        <>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-emerald-500 transition-all"
                                style={{ width: `${Math.min(100, (creditToApply / grandTotal) * 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                              {money(creditToApply)} de {money(grandTotal)}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            Saldo disponível: <span className="font-semibold text-emerald-700">{money(creditBalance)}</span>
                            {useCredit && creditToApply >= grandTotal
                              ? " · Cobre o pedido inteiro 🎉"
                              : useCredit && creditToApply > 0
                              ? ` · Restante a pagar: ${money(baseAfterCredit)}`
                              : ""}
                          </div>
                        </>
                      ) : (
                        <div className="mt-1 text-xs text-slate-400">Sem saldo disponível no momento.</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* ── Formas de pagamento (para o valor restante ou total) ── */}
              {!fullyPaidByCredit ? (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                    {useCredit && creditToApply > 0
                      ? `Pagar o restante — ${money(baseAfterCredit)}`
                      : "Selecione a forma de pagamento"}
                  </div>
                  <div className="grid gap-2">
                    {nonCreditMethods.map((m) => {
                      const active = selectedPaymentMethod === m.payment_method;
                      const mIsCreditCard = m.payment_method === "CREDIT_CARD" || m.payment_method === "CREDIT_CARD_ONLINE";
                      const mFee = (mIsCreditCard && creditCardProvider === "MERCADOPAGO")
                        ? 0
                        : Number(m.fee_percent ?? 0) || 0;
                      const mFeeAmt = mFee > 0 ? Math.round(baseAfterCredit * mFee) / 100 : 0;
                      const displayAmt = baseAfterCredit + mFeeAmt;

                      return (
                        <button
                          key={m.payment_method}
                          type="button"
                          disabled={sending}
                          onClick={() => setSelectedPaymentMethod(m.payment_method)}
                          className={[
                            "flex items-center gap-4 rounded-[20px] border-2 p-4 text-left transition",
                            "disabled:cursor-not-allowed disabled:opacity-50",
                            active
                              ? "border-cyan-400 bg-cyan-50 shadow-[0_4px_20px_rgba(8,145,178,0.15)]"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          {/* Ícone grande */}
                          <span className="text-3xl leading-none shrink-0">{paymentMethodIcon(m.payment_method)}</span>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className={[
                              "text-sm font-semibold",
                              active ? "text-cyan-900" : "text-slate-900",
                            ].join(" ")}>
                              {paymentMethodLabel(m.payment_method)}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {mFee > 0
                                ? `+${mFee}% acréscimo · Total: ${money(displayAmt)}`
                                : money(displayAmt)}
                            </div>
                          </div>

                          {/* Check */}
                          <div className={[
                            "h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition",
                            active ? "border-cyan-500 bg-cyan-500" : "border-slate-300 bg-white",
                          ].join(" ")}>
                            {active ? <span className="text-white text-[10px] font-bold">✓</span> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Aviso cartão */}
                  {(selectedPaymentMethod === "CREDIT_CARD" || selectedPaymentMethod === "CREDIT_CARD_ONLINE") ? (
                    <div className="mt-3 rounded-[14px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {feePercent > 0 ? (
                        <p className="mb-1 font-semibold">Acréscimo de {feePercent}% = {money(feeAmount)} sobre {money(baseAfterCredit)}</p>
                      ) : null}
                      <p>Você será redirecionado para a página segura de pagamento{creditCardProvider === "MERCADOPAGO" ? " do Mercado Pago" : " da Asaas"}. O pedido entra em processamento após a confirmação.</p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* ── Breakdown final ── */}
              <div className="rounded-[18px] bg-slate-50 border border-slate-200 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-2 text-sm text-slate-600">
                  <span>Subtotal + frete</span>
                  <span className="font-semibold text-slate-900">{money(grandTotal)}</span>
                </div>
                {creditToApply > 0 ? (
                  <div className="flex items-center justify-between gap-2 text-sm text-emerald-700">
                    <span>🪙 Crédito aplicado</span>
                    <span className="font-semibold">−{money(creditToApply)}</span>
                  </div>
                ) : null}
                {feeAmount > 0 && !fullyPaidByCredit ? (
                  <div className="flex items-center justify-between gap-2 text-sm text-amber-700">
                    <span>Acréscimo ({feePercent}%)</span>
                    <span className="font-semibold">+{money(feeAmount)}</span>
                  </div>
                ) : null}
                <div className="h-px bg-slate-200" />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-700">
                    {fullyPaidByCredit ? "Pago com crédito" : "A pagar agora"}
                  </span>
                  <span className="text-xl font-semibold text-slate-900">
                    {fullyPaidByCredit ? money(creditToApply) : money(finalPayAmount)}
                  </span>
                </div>
              </div>

              {/* ── Botão confirmar ── */}
              <div className="grid gap-2 pt-1">
                <PrimaryActionButton
                  onClick={onSubmit}
                  disabled={sending || (!fullyPaidByCredit && !selectedPaymentMethod)}
                  fullWidth
                >
                  {sending
                    ? (payingWithCard ? "Criando cobrança..." : "Processando...")
                    : fullyPaidByCredit
                    ? `Pagar com crédito — ${money(creditToApply)}`
                    : (selectedPaymentMethod === "CREDIT_CARD" || selectedPaymentMethod === "CREDIT_CARD_ONLINE")
                    ? `Ir para o pagamento — ${money(finalPayAmount)}`
                    : selectedPaymentMethod
                    ? `Confirmar pedido — ${money(finalPayAmount)}`
                    : "Selecione uma forma de pagamento"}
                </PrimaryActionButton>

                <SecondaryActionButton
                  onClick={() => setShowPaymentModal(false)}
                  disabled={sending}
                  fullWidth
                >
                  Cancelar
                </SecondaryActionButton>
              </div>

            </div>
          </div>
        </div>
      ) : null}

    </PortalShell>
  );
}