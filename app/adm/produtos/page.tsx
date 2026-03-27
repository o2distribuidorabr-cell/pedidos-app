"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { PageHeader, Card, Input, Select, Badge, StatCard } from "@/app/components/ui";

type ProductRow = {
  id: string;
  sku: string | null;
  name: string | null;
  unit: string | null;
  unit_price: number | null;
  step_qty: number | null;
  pack_qty: number | null;
  active: boolean | null;

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
  name: string | null;
};

function toNumber(v: string) {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function moneyBR(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function onlyDigits(v: string) {
  return String(v ?? "").replace(/\D/g, "");
}

function normNCM(v: string) {
  return onlyDigits(v).slice(0, 8);
}
function normCEST(v: string) {
  return onlyDigits(v).slice(0, 7);
}
function normCFOP(v: string) {
  return onlyDigits(v).slice(0, 4);
}
function normEAN(v: string) {
  return onlyDigits(v).slice(0, 14);
}
function isValidEAN(digits: string) {
  if (!digits) return true;
  return [8, 12, 13, 14].includes(digits.length);
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

function WarnActionButton({
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
        "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
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

function InfoPair({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-semibold text-slate-900">{value}</span>
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

export default function AdmProdutosPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState("");

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [q, setQ] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("un");
  const [unitPrice, setUnitPrice] = useState("0");
  const [stepQty, setStepQty] = useState("1");
  const [packQty, setPackQty] = useState("1");
  const [active, setActive] = useState(true);

  const [ncm, setNcm] = useState("");
  const [cest, setCest] = useState("");
  const [cfop, setCfop] = useState("");
  const [ean, setEan] = useState("");
  const [origin, setOrigin] = useState<string>("");
  const [icmsCst, setIcmsCst] = useState("");
  const [pisCst, setPisCst] = useState("");
  const [cofinsCst, setCofinsCst] = useState("");

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storeFilterId, setStoreFilterId] = useState<string>("");
  const [storePricesMap, setStorePricesMap] = useState<Record<string, number>>({});
  const [dirtyMap, setDirtyMap] = useState<Record<string, string>>({});
  const [priceQ, setPriceQ] = useState<string>("");
  const [priceWorking, setPriceWorking] = useState<boolean>(false);

  async function requireAuth() {
    const { data } = await supabase.auth.getUser();
    if (!data?.user) {
      router.push("/login");
      return false;
    }
    return true;
  }

  async function loadProducts() {
    setMsg("");
    const ok = await requireAuth();
    if (!ok) return;

    const baseSelect = "id,sku,name,unit,unit_price,step_qty,pack_qty,active";
    const fullSelect =
      "id,sku,name,unit,unit_price,step_qty,pack_qty,active,ncm,cest,cfop,ean,origin,icms_cst,pis_cst,cofins_cst";

    const first = await supabase.from("products").select(fullSelect).order("name", { ascending: true });

    if (first.error) {
      console.warn("loadProducts fullSelect error:", first.error);

      const fallback = await supabase.from("products").select(baseSelect).order("name", { ascending: true });

      if (fallback.error) {
        setMsg(fallback.error.message);
        setProducts([]);
        return;
      }

      const normalized = (fallback.data ?? []).map((p: any) => ({
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

      setProducts(normalized as ProductRow[]);
      return;
    }

    setProducts((first.data ?? []) as ProductRow[]);
  }

  async function loadStores() {
    const { data, error } = await supabase.from("stores").select("id,name").order("name", { ascending: true });

    if (error) {
      console.warn("loadStores:", error.message);
      setStores([]);
      return;
    }

    const list = (data ?? []) as StoreRow[];
    setStores(list);

    if (!storeFilterId && list.length > 0) {
      setStoreFilterId(list[0].id);
    }
  }

  async function loadStorePrices(storeId: string) {
    if (!storeId) {
      setStorePricesMap({});
      setDirtyMap({});
      return;
    }

    setPriceWorking(true);
    setMsg("");

    const { data, error } = await supabase
      .from("store_product_prices")
      .select("store_id,product_id,unit_price")
      .eq("store_id", storeId);

    if (error) {
      setPriceWorking(false);
      setMsg(error.message);
      setStorePricesMap({});
      setDirtyMap({});
      return;
    }

    const map: Record<string, number> = {};
    (data ?? []).forEach((r: any) => {
      map[String(r.product_id)] = Number(r.unit_price ?? 0) || 0;
    });

    setStorePricesMap(map);
    setDirtyMap({});
    setPriceWorking(false);
  }

  async function refreshAll() {
    setLoading(true);
    await loadProducts();
    await loadStores();
    if (storeFilterId) await loadStorePrices(storeFilterId);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadProducts();
      await loadStores();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      if (!storeFilterId) return;
      await loadStorePrices(storeFilterId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeFilterId]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return products;

    return products.filter((p) => {
      const blob =
        `${p.sku ?? ""} ${p.name ?? ""} ${p.unit ?? ""} ${p.ncm ?? ""} ${p.cest ?? ""} ${p.cfop ?? ""} ${p.ean ?? ""} ${p.id}`.toLowerCase();
      return blob.includes(qq);
    });
  }, [products, q]);

  const filteredForPrices = useMemo(() => {
    const qq = priceQ.trim().toLowerCase();
    if (!qq) return products;

    return products.filter((p) => {
      const blob = `${p.sku ?? ""} ${p.name ?? ""} ${p.unit ?? ""}`.toLowerCase();
      return blob.includes(qq);
    });
  }, [products, priceQ]);

  const summary = useMemo(() => {
    return {
      total: products.length,
      active: products.filter((p) => p.active ?? true).length,
      inactive: products.filter((p) => !(p.active ?? true)).length,
      withOverride: Object.keys(storePricesMap).length,
    };
  }, [products, storePricesMap]);

  function resetForm() {
    setEditingId(null);
    setSku("");
    setName("");
    setUnit("un");
    setUnitPrice("0");
    setStepQty("1");
    setPackQty("1");
    setActive(true);

    setNcm("");
    setCest("");
    setCfop("");
    setEan("");
    setOrigin("");
    setIcmsCst("");
    setPisCst("");
    setCofinsCst("");
  }

  function startEdit(p: ProductRow) {
    setEditingId(p.id);
    setSku(p.sku ?? "");
    setName(p.name ?? "");
    setUnit(p.unit ?? "un");
    setUnitPrice(String(p.unit_price ?? 0));
    setStepQty(String(p.step_qty ?? 1));
    setPackQty(String(p.pack_qty ?? 1));
    setActive(p.active ?? true);
    setMsg("");

    setNcm(p.ncm ?? "");
    setCest(p.cest ?? "");
    setCfop(p.cfop ?? "");
    setEan(p.ean ?? "");
    setOrigin((p.origin ?? "") as any);
    setIcmsCst(p.icms_cst ?? "");
    setPisCst(p.pis_cst ?? "");
    setCofinsCst(p.cofins_cst ?? "");
  }

  async function saveProduct() {
    setMsg("");
    setWorking(true);

    const skuVal = sku.trim();
    const nameVal = name.trim();

    if (!skuVal) {
      setWorking(false);
      setMsg("Preencha o SKU.");
      return;
    }
    if (!nameVal) {
      setWorking(false);
      setMsg("Preencha o nome do produto.");
      return;
    }

    const ncmNorm = normNCM(ncm);
    if (ncm.trim() && ncmNorm.length !== 8) {
      setWorking(false);
      setMsg("NCM inválido. Informe 8 dígitos.");
      return;
    }

    const cestNorm = normCEST(cest);
    if (cest.trim() && cestNorm.length !== 7) {
      setWorking(false);
      setMsg("CEST inválido. Informe 7 dígitos.");
      return;
    }

    const cfopNorm = normCFOP(cfop);
    if (cfop.trim() && cfopNorm.length !== 4) {
      setWorking(false);
      setMsg("CFOP inválido. Informe 4 dígitos.");
      return;
    }

    const eanNorm = normEAN(ean);
    if (ean.trim() && !isValidEAN(eanNorm)) {
      setWorking(false);
      setMsg("EAN/GTIN inválido. Use 8, 12, 13 ou 14 dígitos.");
      return;
    }

    const payload = {
      sku: skuVal,
      name: nameVal,
      unit: unit.trim() || "un",
      unit_price: toNumber(unitPrice),
      step_qty: Math.max(0.001, Math.round(toNumber(stepQty) * 1000) / 1000),
      pack_qty: Math.max(0.001, Math.round(toNumber(packQty) * 1000) / 1000),
      active: !!active,

      ncm: ncmNorm || null,
      cest: cestNorm || null,
      cfop: cfopNorm || null,
      ean: eanNorm || null,
      origin: (origin || "").trim() || null,
      icms_cst: (icmsCst || "").trim() || null,
      pis_cst: (pisCst || "").trim() || null,
      cofins_cst: (cofinsCst || "").trim() || null,
    };

    if (editingId) {
      const { error } = await supabase.from("products").update(payload).eq("id", editingId);
      if (error) {
        setWorking(false);
        setMsg(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("products").insert(payload);
      if (error) {
        setWorking(false);
        setMsg(error.message);
        return;
      }
    }

    setWorking(false);
    resetForm();
    await loadProducts();
  }

  async function toggleActive(p: ProductRow) {
    setMsg("");
    setWorking(true);

    const { error } = await supabase.from("products").update({ active: !(p.active ?? true) }).eq("id", p.id);

    if (error) {
      setWorking(false);
      setMsg(error.message);
      return;
    }

    setWorking(false);
    await loadProducts();
  }

  function getDirtyInput(pid: string): string {
    return dirtyMap[pid] ?? "";
  }

  function setDirty(pid: string, value: string) {
    setDirtyMap((prev) => ({ ...prev, [pid]: value }));
  }

  async function saveStorePrice(productId: string) {
    if (!storeFilterId) {
      setMsg("Selecione uma loja.");
      return;
    }

    setMsg("");
    setPriceWorking(true);

    const raw = getDirtyInput(productId).trim();
    if (!raw) {
      setPriceWorking(false);
      setMsg("Informe um preço para salvar ou use remover override.");
      return;
    }

    const price = toNumber(raw);
    if (!(price > 0)) {
      setPriceWorking(false);
      setMsg("Preço inválido. Use um número maior que zero.");
      return;
    }

    const { error } = await supabase
      .from("store_product_prices")
      .upsert([{ store_id: storeFilterId, product_id: productId, unit_price: price }], {
        onConflict: "store_id,product_id",
      });

    if (error) {
      setPriceWorking(false);
      setMsg(error.message);
      return;
    }

    setStorePricesMap((prev) => ({ ...prev, [productId]: price }));
    setDirtyMap((prev) => {
      const n = { ...prev };
      delete n[productId];
      return n;
    });

    setPriceWorking(false);
  }

  async function removeOverride(productId: string) {
    if (!storeFilterId) {
      setMsg("Selecione uma loja.");
      return;
    }

    setMsg("");
    setPriceWorking(true);

    const { error } = await supabase
      .from("store_product_prices")
      .delete()
      .eq("store_id", storeFilterId)
      .eq("product_id", productId);

    if (error) {
      setPriceWorking(false);
      setMsg(error.message);
      return;
    }

    setStorePricesMap((prev) => {
      const n = { ...prev };
      delete n[productId];
      return n;
    });

    setDirtyMap((prev) => {
      const n = { ...prev };
      delete n[productId];
      return n;
    });

    setPriceWorking(false);
  }

  async function saveAllDirty() {
    if (!storeFilterId) {
      setMsg("Selecione uma loja.");
      return;
    }

    setMsg("");
    setPriceWorking(true);

    const entries = Object.entries(dirtyMap)
      .map(([product_id, val]) => ({ product_id, val: val.trim() }))
      .filter((x) => x.val !== "");

    if (entries.length === 0) {
      setPriceWorking(false);
      setMsg("Nenhuma alteração para salvar.");
      return;
    }

    const payload: { store_id: string; product_id: string; unit_price: number }[] = [];
    for (const e of entries) {
      const p = toNumber(e.val);
      if (!(p > 0)) {
        setPriceWorking(false);
        setMsg("Existe preço inválido. Corrija antes de salvar.");
        return;
      }
      payload.push({ store_id: storeFilterId, product_id: e.product_id, unit_price: p });
    }

    const { error } = await supabase.from("store_product_prices").upsert(payload, {
      onConflict: "store_id,product_id",
    });

    if (error) {
      setPriceWorking(false);
      setMsg(error.message);
      return;
    }

    const nextMap = { ...storePricesMap };
    for (const row of payload) nextMap[row.product_id] = Number(row.unit_price);
    setStorePricesMap(nextMap);
    setDirtyMap({});

    setPriceWorking(false);
  }

  const selectedStoreName = useMemo(() => {
    const s = stores.find((x) => x.id === storeFilterId);
    return s?.name ?? (storeFilterId ? storeFilterId : "-");
  }, [stores, storeFilterId]);

  const pendingCount = Object.keys(dirtyMap).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produtos"
        subtitle="Cadastro de produtos, regras fiscais e preço específico por loja."
        right={
          <div className="flex flex-wrap gap-2">
            <SecondaryActionButton onClick={() => router.push("/adm/lojas")}>
              Lojas
            </SecondaryActionButton>
            <SecondaryActionButton onClick={() => router.push("/adm/pedidos")}>
              Pedidos
            </SecondaryActionButton>
            <SecondaryActionButton onClick={refreshAll} disabled={working || priceWorking}>
              Atualizar
            </SecondaryActionButton>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm text-red-600">{msg}</div>
        </Card>
      ) : null}

      <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-5 shadow-sm md:p-6">
        <SectionTitle
          title="Visão geral"
          subtitle="Resumo do catálogo e dos overrides de preço"
        />

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total de produtos" value={summary.total} />
          <StatCard label="Produtos ativos" value={summary.active} />
          <StatCard label="Produtos inativos" value={summary.inactive} />
          <StatCard label="Overrides nesta loja" value={summary.withOverride} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_1.35fr]">
        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <SectionTitle
            title={editingId ? "Editar produto" : "Novo produto"}
            subtitle={editingId ? "Atualize os dados do produto selecionado" : "Preencha os dados para cadastrar um novo produto"}
          />

          <div className="mt-6 grid gap-4">
            <Input label="SKU" value={sku} onChange={setSku} placeholder="Ex.: AB-001" />
            <Input label="Nome" value={name} onChange={setName} placeholder="Ex.: Pão Brioche" />

            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Unidade" value={unit} onChange={setUnit} placeholder="un / cx / kg" />
              <Input label="Preço padrão" value={unitPrice} onChange={setUnitPrice} placeholder="0,00" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Passo (step_qty)" value={stepQty} onChange={setStepQty} placeholder="Ex.: 1 ou 0,397" />
              <Input label="Lote / caixa (pack_qty)" value={packQty} onChange={setPackQty} placeholder="1" />
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Dados fiscais</div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Input label="NCM" value={ncm} onChange={setNcm} placeholder="8 dígitos" />
                <Input label="CEST" value={cest} onChange={setCest} placeholder="7 dígitos" />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Input label="CFOP" value={cfop} onChange={setCfop} placeholder="4 dígitos" />
                <Input label="EAN / GTIN" value={ean} onChange={setEan} placeholder="8/12/13/14 dígitos" />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Select
                  label="Origem"
                  value={origin}
                  onChange={(v) => setOrigin(v)}
                  options={[
                    { value: "", label: "—" },
                    { value: "0", label: "0 - Nacional" },
                    { value: "1", label: "1 - Estrangeira (importação direta)" },
                    { value: "2", label: "2 - Estrangeira (adquirida no mercado interno)" },
                    { value: "3", label: "3 - Nacional (conteúdo importação > 40%)" },
                    { value: "4", label: "4 - Nacional (produção conforme processos)" },
                    { value: "5", label: "5 - Nacional (conteúdo importação <= 40%)" },
                    { value: "6", label: "6 - Estrangeira (sem similar nacional)" },
                    { value: "7", label: "7 - Estrangeira (mercado interno sem similar)" },
                    { value: "8", label: "8 - Nacional (conteúdo importação > 70%)" },
                  ]}
                />
                <Input
                  label="ICMS CST / CSOSN"
                  value={icmsCst}
                  onChange={setIcmsCst}
                  placeholder="Ex.: 00 / 102 / 60"
                />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Input label="PIS CST" value={pisCst} onChange={setPisCst} placeholder="Ex.: 01 / 99" />
                <Input
                  label="COFINS CST"
                  value={cofinsCst}
                  onChange={setCofinsCst}
                  placeholder="Ex.: 01 / 99"
                />
              </div>
            </div>

            <Select
              label="Ativo?"
              value={active ? "true" : "false"}
              onChange={(v) => setActive(v === "true")}
              options={[
                { value: "true", label: "Sim" },
                { value: "false", label: "Não" },
              ]}
            />

            <div className="grid gap-2 pt-2 sm:grid-cols-2">
              <SecondaryActionButton onClick={resetForm} disabled={working} fullWidth>
                Limpar
              </SecondaryActionButton>

              <PrimaryActionButton onClick={saveProduct} disabled={working} fullWidth>
                {working ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar produto"}
              </PrimaryActionButton>
            </div>

            {editingId ? (
              <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                ID do produto: <span className="font-mono">{editingId}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <SectionTitle
            title="Lista de produtos"
            subtitle="Busque, edite e ative/desative produtos"
          />

          <div className="mt-6">
            <Input value={q} onChange={setQ} placeholder="Buscar por SKU, nome, NCM, CFOP..." />
          </div>

          <div className="mt-6 space-y-4">
            {loading ? <EmptyState text="Carregando produtos..." /> : null}

            {!loading && filtered.length === 0 ? (
              <EmptyState text="Nenhum produto encontrado." />
            ) : null}

            {!loading && filtered.length > 0
              ? filtered.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm md:p-5"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-base font-semibold text-slate-900">
                            {p.name ?? "-"} {p.sku ? `(${p.sku})` : ""}
                          </div>
                          <Badge tone={p.active ? "green" : "red"}>
                            {p.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </div>

                        <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                          <div className="space-y-3">
                            <InfoPair label="Unidade" value={p.unit ?? "un"} />
                            <InfoPair label="Preço padrão" value={moneyBR(Number(p.unit_price ?? 0))} />
                            <InfoPair label="Passo" value={p.step_qty ?? 1} />
                            <InfoPair label="Lote / caixa" value={p.pack_qty ?? 1} />
                            <InfoPair label="NCM" value={p.ncm ?? "-"} />
                            <InfoPair label="CEST" value={p.cest ?? "-"} />
                            <InfoPair label="CFOP" value={p.cfop ?? "-"} />
                            <InfoPair label="EAN / GTIN" value={p.ean ?? "-"} />
                            <InfoPair label="Origem" value={p.origin ?? "-"} />
                            <InfoPair label="ICMS CST / CSOSN" value={p.icms_cst ?? "-"} />
                            <InfoPair label="PIS CST" value={p.pis_cst ?? "-"} />
                            <InfoPair label="COFINS CST" value={p.cofins_cst ?? "-"} />
                            <InfoPair
                              label="ID"
                              value={<span className="break-all font-mono text-xs">{p.id}</span>}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2 xl:w-[260px] xl:grid-cols-1">
                        <SecondaryActionButton
                          onClick={() => startEdit(p)}
                          disabled={working}
                          fullWidth
                        >
                          Editar
                        </SecondaryActionButton>

                        <WarnActionButton
                          onClick={() => toggleActive(p)}
                          disabled={working}
                          fullWidth
                        >
                          {p.active ? "Desativar" : "Ativar"}
                        </WarnActionButton>
                      </div>
                    </div>
                  </div>
                ))
              : null}
          </div>
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <SectionTitle
          title="Preços por loja"
          subtitle="Defina preço específico para a loja selecionada. Sem override, o sistema usa o preço padrão."
          right={
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[220px]">
                <Select
                  value={storeFilterId}
                  onChange={(v) => setStoreFilterId(v)}
                  options={
                    stores.length === 0
                      ? [{ value: "", label: "(Sem lojas)" }]
                      : stores.map((s) => ({ value: s.id, label: s.name ?? s.id }))
                  }
                />
              </div>

              <SecondaryActionButton
                onClick={() => storeFilterId && loadStorePrices(storeFilterId)}
                disabled={!storeFilterId || priceWorking || loading}
              >
                Recarregar preços
              </SecondaryActionButton>

              <PrimaryActionButton
                onClick={saveAllDirty}
                disabled={!storeFilterId || priceWorking || pendingCount === 0}
              >
                {priceWorking ? "Salvando..." : `Salvar alterações (${pendingCount})`}
              </PrimaryActionButton>
            </div>
          }
        />

        <div className="mt-6 grid gap-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <Input
              label="Buscar produto"
              value={priceQ}
              onChange={setPriceQ}
              placeholder="Buscar por SKU, nome ou unidade..."
            />

            <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Loja selecionada: <b>{selectedStoreName}</b>
            </div>
          </div>

          {loading ? (
            <EmptyState text="Carregando tabela de preços..." />
          ) : (
            <div className="overflow-x-auto rounded-[24px] border border-slate-200">
              <table className="min-w-[980px] w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs text-slate-600">
                    <th className="px-4 py-3 font-semibold">SKU</th>
                    <th className="px-4 py-3 font-semibold">Produto</th>
                    <th className="px-4 py-3 font-semibold">Un</th>
                    <th className="px-4 py-3 font-semibold">Preço padrão</th>
                    <th className="px-4 py-3 font-semibold">Override loja</th>
                    <th className="px-4 py-3 font-semibold">Preço efetivo</th>
                    <th className="px-4 py-3 font-semibold">Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredForPrices.map((p) => {
                    const pid = p.id;
                    const base = Number(p.unit_price ?? 0) || 0;
                    const ov = storePricesMap[pid];
                    const hasOverride = ov != null;
                    const effective = hasOverride ? Number(ov) : base;

                    const dirty = getDirtyInput(pid);
                    const shownValue = dirty !== "" ? dirty : hasOverride ? String(ov) : "";

                    return (
                      <tr key={pid} className="border-t border-slate-200">
                        <td className="px-4 py-3 font-mono text-sm text-slate-900">{p.sku ?? "-"}</td>

                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{p.name ?? "-"}</div>
                          <div className="mt-1 font-mono text-xs text-slate-500">{pid}</div>
                        </td>

                        <td className="px-4 py-3 text-sm text-slate-700">{p.unit ?? "un"}</td>

                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                          {moneyBR(base)}
                        </td>

                        <td className="px-4 py-3">
                          <div className="w-[160px]">
                            <Input
                              value={shownValue}
                              onChange={(v) => setDirty(pid, v)}
                              placeholder="Ex.: 12,50"
                            />
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {hasOverride ? "override cadastrado" : "sem override"}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                          {moneyBR(effective)}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <SecondaryActionButton
                              onClick={() => saveStorePrice(pid)}
                              disabled={!storeFilterId || priceWorking}
                            >
                              Salvar
                            </SecondaryActionButton>

                            <WarnActionButton
                              onClick={() => removeOverride(pid)}
                              disabled={!storeFilterId || priceWorking || !hasOverride}
                            >
                              Remover override
                            </WarnActionButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredForPrices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-sm text-slate-600">
                        Nenhum produto encontrado.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            Override é o preço específico da loja. Ao remover, volta a valer o preço padrão do produto.
          </div>
        </div>
      </div>
    </div>
  );
}