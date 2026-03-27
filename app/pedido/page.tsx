"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PortalShell from "@/app/components/PortalShell";
import { PageHeader, Card, Badge } from "@/app/components/ui";

type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string | null;
  unit_cost: number | null;
  step_qty: number | null;   // ← ADICIONADO
  pack_qty: number | null;   // ← ADICIONADO
  base_price?: number | null;
  override_price?: number | null;
  ncm?: string | null;
  cest?: string | null;
  cfop?: string | null;
  ean?: string | null;
  origin?: string | null;
  icms_cst?: string | null;
  pis_cst?: string | null;
  cofins_cst?: string | null;
};

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

type StoreRow = { id: string; name: string; freight_fee: number };
type PriceOverrideRow = { product_id: string; unit_price: number | null };

type OverdueOrderRow = {
  id: string;
  due_date: string | null;
  is_paid: boolean | null;
  created_at: string | null;
};

// ──────────────────────────────────────────────────────────────────────────────
// REMOVIDO: dicionário estático STEP_BY_SKU — agora o passo vem do banco de
// dados pelo campo step_qty cadastrado em cada produto.
// ──────────────────────────────────────────────────────────────────────────────

function getStep(product: Product): number {
  // Usa step_qty do banco; garante mínimo de 1 para nunca travar o controle.
  const v = Number(product.step_qty ?? 1);
  return v > 0 ? v : 1;
}

function roundToStep(value: number, step: number) {
  if (step <= 0) return value;
  const k = Math.round(value / step);
  return k * step;
}

function money(v: number) {
  return (Number(v) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function ymdToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtYMDToBR(ymd: string | null | undefined) {
  if (!ymd) return "-";
  try {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    return dt.toLocaleDateString("pt-BR");
  } catch {
    return String(ymd);
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

function MiniQtyButton({
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
      className="grid h-10 w-10 place-items-center rounded-[16px] border border-slate-200 bg-white text-base font-semibold text-slate-700 shadow-[0_6px_14px_rgba(15,23,42,0.04)] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function QtyControl({
  value,
  step,
  disabled,
  onDecrease,
  onIncrease,
  onChange,
}: {
  value: number;
  step: number;
  disabled?: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <MiniQtyButton onClick={onDecrease} disabled={disabled || value <= 0}>
        −
      </MiniQtyButton>

      <input
        className="h-10 w-28 rounded-[16px] border border-slate-200 bg-white px-3 text-center text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
        type="number"
        value={value}
        step={step}
        min={0}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />

      <MiniQtyButton onClick={onIncrease} disabled={disabled}>
        +
      </MiniQtyButton>
    </div>
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

export default function PedidoPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string>("");

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, CartItem>>({});

  const [deliveryMode, setDeliveryMode] = useState<"RETIRADA" | "FRETE">("RETIRADA");
  const [freightFee, setFreightFee] = useState<number>(0);
  const [storeName, setStoreName] = useState<string>("-");
  const [storeId, setStoreId] = useState<string | null>(null);

  const [overdueLoading, setOverdueLoading] = useState(false);
  const [overdues, setOverdues] = useState<OverdueOrderRow[]>([]);
  const hasOverdue = overdues.length > 0;

  const [search, setSearch] = useState("");

  const itemsTotal = useMemo(() => {
    return Object.values(cart).reduce((acc, it) => acc + it.qty * it.unit_cost, 0);
  }, [cart]);

  const selectedItemsCount = useMemo(() => Object.values(cart).length, [cart]);

  const selectedUnitsCount = useMemo(() => {
    return Object.values(cart).reduce((acc, it) => acc + (Number(it.qty) || 0), 0);
  }, [cart]);

  const freightApplied = useMemo(
    () => (deliveryMode === "FRETE" ? freightFee : 0),
    [deliveryMode, freightFee]
  );

  const grandTotal = useMemo(() => itemsTotal + freightApplied, [itemsTotal, freightApplied]);
  const hasItems = useMemo(() => Object.keys(cart).length > 0, [cart]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;

    return products.filter((p) => {
      const sku = String(p.sku ?? "").toLowerCase();
      const name = String(p.name ?? "").toLowerCase();
      return sku.includes(q) || name.includes(q);
    });
  }, [products, search]);

  useEffect(() => {
    (async () => {
      setMsg("");
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        router.push("/login");
        return;
      }

      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("id", auth.user.id)
        .maybeSingle();

      if (pErr) {
        setLoading(false);
        setMsg(pErr.message);
        return;
      }

      const sId = (profile?.store_id as string | null) ?? null;
      setStoreId(sId);

      if (!sId) {
        setLoading(false);
        setMsg("Seu usuário não está vinculado a nenhuma loja (profiles.store_id).");
        return;
      }

      await loadOverdues(sId);

      const { data: store, error: sErr } = await supabase
        .from("stores")
        .select("id,name,freight_fee")
        .eq("id", sId)
        .maybeSingle();

      if (sErr || !store) {
        setLoading(false);
        setMsg(sErr?.message || "Loja não encontrada.");
        return;
      }

      const st = store as StoreRow;
      setStoreName(st.name ?? "-");
      setFreightFee(Number(st.freight_fee ?? 0) || 0);

      // ── CORRIGIDO: inclui step_qty e pack_qty na query ──────────────────────
      const selectOld = "id, sku, name, unit, unit_price, step_qty, pack_qty, active";
      const selectNew =
        "id, sku, name, unit, unit_price, step_qty, pack_qty, active, ncm, cest, cfop, ean, origin, icms_cst, pis_cst, cofins_cst";
      // ────────────────────────────────────────────────────────────────────────

      const prodTry = await supabase
        .from("products")
        .select(selectNew)
        .eq("active", true)
        .order("name", { ascending: true });

      let prodData: any[] | null = null;

      if (prodTry.error) {
        const prodFallback = await supabase
          .from("products")
          .select(selectOld)
          .eq("active", true)
          .order("name", { ascending: true });

        if (prodFallback.error) {
          setLoading(false);
          setMsg(prodFallback.error.message);
          return;
        }

        prodData = (prodFallback.data ?? []).map((p: any) => ({
          ...p,
          ncm: null,
          cest: null,
          cfop: null,
          ean: null,
          origin: null,
          icms_cst: null,
          pis_cst: null,
          cofins_cst: null,
        }));
      } else {
        prodData = prodTry.data ?? [];
      }

      const { data: ovData, error: ovErr } = await supabase
        .from("store_product_prices")
        .select("product_id, unit_price")
        .eq("store_id", sId);

      if (ovErr) {
        setLoading(false);
        setMsg(ovErr.message);
        return;
      }

      const ovMap: Record<string, number> = {};
      (ovData as PriceOverrideRow[] | null)?.forEach((r) => {
        if (!r?.product_id) return;
        const v = Number(r.unit_price ?? 0);
        if (Number.isFinite(v) && v > 0) ovMap[String(r.product_id)] = v;
      });

      // ── CORRIGIDO: mapeia step_qty e pack_qty do banco ─────────────────────
      const merged: Product[] = (prodData ?? []).map((p: any) => {
        const base = Number(p.unit_price ?? 0) || 0;
        const ov = ovMap[p.id];
        const effective = ov != null ? ov : base;

        return {
          id: String(p.id),
          sku: String(p.sku ?? ""),
          name: String(p.name ?? ""),
          unit: (p.unit ?? "un") as string,
          unit_cost: Number(effective) || 0,
          step_qty: p.step_qty != null ? Math.max(1, Number(p.step_qty)) : 1,  // ← CORRIGIDO
          pack_qty: p.pack_qty != null ? Math.max(1, Number(p.pack_qty)) : 1,  // ← CORRIGIDO
          base_price: base,
          override_price: ov ?? null,
          ncm: (p.ncm ?? null) as any,
          cest: (p.cest ?? null) as any,
          cfop: (p.cfop ?? null) as any,
          ean: (p.ean ?? null) as any,
          origin: (p.origin ?? null) as any,
          icms_cst: (p.icms_cst ?? null) as any,
          pis_cst: (p.pis_cst ?? null) as any,
          cofins_cst: (p.cofins_cst ?? null) as any,
        };
      });
      // ────────────────────────────────────────────────────────────────────────

      setProducts(merged);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadOverdues(sId: string) {
    setOverdueLoading(true);
    try {
      const today = ymdToday();

      const { data, error } = await supabase
        .from("orders")
        .select("id,due_date,is_paid,created_at")
        .eq("store_id", sId)
        .or("is_paid.is.null,is_paid.eq.false")
        .not("due_date", "is", null)
        .lt("due_date", today)
        .order("due_date", { ascending: true })
        .limit(10);

      if (error) {
        console.warn("loadOverdues:", error.message);
        setOverdues([]);
        return;
      }

      setOverdues((data ?? []) as OverdueOrderRow[]);
    } finally {
      setOverdueLoading(false);
    }
  }

  function setQty(prod: Product, qtyRaw: number) {
    const unit = (prod.unit ?? "un").toString();
    const unit_cost = Number(prod.unit_cost ?? 0) || 0;

    // ── CORRIGIDO: usa getStep(prod) que lê step_qty do banco ────────────────
    const step = getStep(prod);
    const qty = Math.max(0, roundToStep(qtyRaw, step));
    // ────────────────────────────────────────────────────────────────────────

    setCart((prev) => {
      const next = { ...prev };

      if (qty === 0) {
        delete next[prod.id];
        return next;
      }

      next[prod.id] = {
        product_id: prod.id,
        sku: prod.sku,
        name: prod.name,
        unit,
        unit_cost,
        qty,
        ncm: prod.ncm ?? null,
        cest: prod.cest ?? null,
        cfop: prod.cfop ?? null,
        ean: prod.ean ?? null,
        origin: prod.origin ?? null,
        icms_cst: prod.icms_cst ?? null,
        pis_cst: prod.pis_cst ?? null,
        cofins_cst: prod.cofins_cst ?? null,
      };

      return next;
    });
  }

  function inc(prod: Product) {
    const step = getStep(prod);
    const current = cart[prod.id]?.qty ?? 0;
    setQty(prod, current + step);
  }

  function dec(prod: Product) {
    const step = getStep(prod);
    const current = cart[prod.id]?.qty ?? 0;
    setQty(prod, current - step);
  }

  function onContinue() {
    const items = Object.values(cart);

    localStorage.setItem("cart_items", JSON.stringify(items));
    localStorage.setItem(
      "delivery_info",
      JSON.stringify({
        delivery_mode: deliveryMode,
        freight_fee: deliveryMode === "FRETE" ? freightFee : 0,
        store_name: storeName,
      })
    );

    router.push("/pedido/confirmar");
  }

  const continueBlocked = hasOverdue || !hasItems;

  return (
    <PortalShell
      title="Novo pedido"
      subtitle={storeName && storeName !== "-" ? `Loja: ${storeName}` : "Monte seu pedido"}
    >
      <div className="space-y-6">
        <PageHeader
          title="Novo pedido"
          subtitle={
            storeName && storeName !== "-"
              ? `Selecione os itens e quantidades da loja ${storeName}.`
              : "Selecione os itens e quantidades do pedido."
          }
          right={
            <div className="flex flex-wrap gap-2">
              <SecondaryActionButton onClick={() => router.push("/pedidos")}>
                Histórico
              </SecondaryActionButton>

              <PrimaryActionButton onClick={onContinue} disabled={continueBlocked}>
                {hasOverdue ? "Bloqueado por vencidos" : `Continuar (${money(grandTotal)})`}
              </PrimaryActionButton>
            </div>
          }
        />

        {!loading && storeId && (overdueLoading || hasOverdue) ? (
          <div className="rounded-[28px] border border-amber-200 bg-[linear-gradient(180deg,#fffaf0_0%,#fff7e8_100%)] p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2">
                  <div className="text-base font-semibold text-amber-900">
                    Atenção: existem títulos vencidos
                  </div>
                  <Badge tone="yellow">Bloqueado</Badge>
                </div>

                <div className="mt-2 text-sm leading-6 text-amber-900/80">
                  Para criar novos pedidos, regularize os títulos vencidos no Financeiro.
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <SecondaryActionButton onClick={() => router.push("/financeiro")}>
                  Ir para Financeiro
                </SecondaryActionButton>

                <SecondaryActionButton
                  onClick={() => loadOverdues(storeId)}
                  disabled={overdueLoading}
                >
                  {overdueLoading ? "Verificando..." : "Atualizar vencidos"}
                </SecondaryActionButton>
              </div>
            </div>

            <div className="mt-4">
              {overdueLoading ? (
                <div className="text-sm text-slate-600">Carregando títulos vencidos...</div>
              ) : overdues.length === 0 ? (
                <div className="text-sm text-slate-600">Nenhum título vencido encontrado.</div>
              ) : (
                <div className="grid gap-3">
                  {overdues.map((o) => (
                    <div
                      key={o.id}
                      className="rounded-2xl border border-amber-200 bg-white/80 px-4 py-3"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <div className="font-mono text-xs text-slate-500 truncate">{o.id}</div>
                          <div className="mt-1 text-sm text-slate-800">
                            Vencimento: <b>{fmtYMDToBR(o.due_date)}</b>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge tone="red">Vencido</Badge>
                          <SecondaryActionButton onClick={() => router.push("/financeiro")}>
                            Ver no Financeiro
                          </SecondaryActionButton>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {msg ? (
          <Card title="Erro">
            <div className="text-sm whitespace-pre-wrap text-red-600">{msg}</div>
          </Card>
        ) : null}

        {loading ? (
          <Card>
            <div className="text-sm text-slate-600">Carregando...</div>
          </Card>
        ) : null}

        {!loading && !msg ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-5 shadow-sm md:p-6">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Entrega</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Escolha entre retirada ou frete padrão da loja.
                    </div>

                    <div className="mt-4 max-w-md">
                      <SegmentedSwitch
                        value={deliveryMode}
                        onChange={(v) => setDeliveryMode(v as "RETIRADA" | "FRETE")}
                        disabled={hasOverdue}
                        options={[
                          { value: "RETIRADA", label: "Retirada" },
                          { value: "FRETE", label: "Frete" },
                        ]}
                      />
                    </div>

                    <div className="mt-3 text-xs text-slate-500">
                      Quantidades com <b>passo</b> são travadas por caixa ou lote.
                    </div>

                    {hasOverdue ? (
                      <div className="mt-3 text-sm text-red-700">
                        Você possui títulos vencidos. Regularize no <b>Financeiro</b> para continuar.
                      </div>
                    ) : null}
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
                        <span className="text-sm text-slate-600">Itens selecionados</span>
                        <span className="text-sm font-semibold text-slate-900">
                          {selectedItemsCount}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Produtos ({filteredProducts.length})
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Use a busca para localizar mais rápido e ajuste as quantidades.
                    </div>
                  </div>

                  <div className="w-full lg:w-[320px]">
                    <label className="mb-2 block text-[13px] font-semibold text-slate-700">
                      Buscar produto
                    </label>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar por nome ou SKU"
                      className="h-12 w-full rounded-[18px] border border-slate-200 bg-slate-50/70 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                    />
                  </div>
                </div>

                {filteredProducts.length === 0 ? (
                  <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                    Nenhum produto encontrado.
                  </div>
                ) : (
                  <div className="mt-6 grid gap-4">
                    {filteredProducts.map((p) => {
                      const unit = (p.unit ?? "un").toString();
                      const unit_cost = Number(p.unit_cost ?? 0) || 0;
                      const qty = cart[p.id]?.qty ?? 0;
                      const step = getStep(p);  // ← CORRIGIDO: passa o objeto p
                      const lineTotal = qty * unit_cost;
                      const selected = qty > 0;

                      return (
                        <div
                          key={p.id}
                          className={[
                            "rounded-[26px] border p-4 transition md:p-5",
                            selected
                              ? "border-cyan-200 bg-cyan-50/40"
                              : "border-slate-200 bg-white",
                            hasOverdue ? "opacity-60" : "",
                          ].join(" ")}
                        >
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-base font-semibold text-slate-900">
                                  {p.name}
                                </div>

                                {selected ? <Badge tone="blue">Selecionado</Badge> : null}
                                {step > 1 ? <Badge tone="yellow">Passo {step}</Badge> : null}
                              </div>

                              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                                <span className="font-mono text-xs text-slate-500">
                                  SKU {p.sku}
                                </span>
                                <span>Unidade: {unit}</span>
                                <span className="font-semibold text-slate-900">
                                  {money(unit_cost)}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-col gap-3 xl:items-end">
                              <QtyControl
                                value={qty}
                                step={step}
                                disabled={hasOverdue}
                                onDecrease={() => dec(p)}
                                onIncrease={() => inc(p)}
                                onChange={(v) => setQty(p, v)}
                              />

                              <div className="text-right">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Total do item
                                </div>
                                <div className="text-lg font-semibold text-slate-900">
                                  {money(lineTotal)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="xl:sticky xl:top-24">
                <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfd_100%)] p-5 shadow-sm md:p-6">
                  <div className="text-lg font-semibold tracking-[-0.02em] text-slate-900">
                    Resumo do pedido
                  </div>

                  <div className="mt-1 text-sm text-slate-600">
                    Confira os valores antes de continuar.
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
                      <PrimaryActionButton onClick={onContinue} disabled={continueBlocked} fullWidth>
                        {hasOverdue ? "Bloqueado por vencidos" : "Continuar pedido"}
                      </PrimaryActionButton>

                      <SecondaryActionButton
                        onClick={() => router.push("/pedidos")}
                        fullWidth
                      >
                        Ver histórico
                      </SecondaryActionButton>
                    </div>

                    {hasOverdue ? (
                      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        Regularize os títulos vencidos no <b>Financeiro</b> para criar novos pedidos.
                      </div>
                    ) : !hasItems ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        Selecione pelo menos um item para continuar.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </PortalShell>
  );
}