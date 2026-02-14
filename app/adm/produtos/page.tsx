"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { PageHeader, Card, Button, Input, Select, Badge } from "@/app/components/ui";

type ProductRow = {
  id: string;
  sku: string | null;
  name: string | null;
  unit: string | null;
  unit_price: number | null;
  step_qty: number | null;
  pack_qty: number | null;
  active: boolean | null;
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
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function AdmProdutosPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState("");

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [q, setQ] = useState("");

  // form produto
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("un");
  const [unitPrice, setUnitPrice] = useState("0");
  const [stepQty, setStepQty] = useState("1");
  const [packQty, setPackQty] = useState("1");
  const [active, setActive] = useState(true);

  // ======= PREÇO POR LOJA (override) =======
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storeFilterId, setStoreFilterId] = useState<string>(""); // loja selecionada
  const [storePricesMap, setStorePricesMap] = useState<Record<string, number>>({}); // product_id -> price
  const [dirtyMap, setDirtyMap] = useState<Record<string, string>>({}); // product_id -> input string (pendente)
  const [priceQ, setPriceQ] = useState<string>(""); // busca dentro da tabela de preços
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

    const { data, error } = await supabase
      .from("products")
      .select("id,sku,name,unit,unit_price,step_qty,pack_qty,active")
      .order("name", { ascending: true });

    if (error) {
      setMsg(error.message);
      setProducts([]);
      return;
    }

    setProducts((data ?? []) as ProductRow[]);
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

    // se não tem loja selecionada ainda, seleciona a primeira
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

  // quando trocar a loja, recarrega preços dela
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
      const blob = `${p.sku ?? ""} ${p.name ?? ""} ${p.unit ?? ""} ${p.id}`.toLowerCase();
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

  function resetForm() {
    setEditingId(null);
    setSku("");
    setName("");
    setUnit("un");
    setUnitPrice("0");
    setStepQty("1");
    setPackQty("1");
    setActive(true);
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

    const payload = {
      sku: skuVal,
      name: nameVal,
      unit: unit.trim() || "un",
      unit_price: toNumber(unitPrice),
      step_qty: Math.max(1, Math.floor(toNumber(stepQty))),
      pack_qty: Math.max(1, Math.floor(toNumber(packQty))),
      active: !!active,
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

  // ======= PREÇOS POR LOJA actions =======
  function getOverridePrice(pid: string): number | null {
    const v = storePricesMap[pid];
    return v == null ? null : Number(v);
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
      setMsg("Informe um preço para salvar (ou use Remover override).");
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
        setMsg("Existe preço inválido (<=0). Corrija antes de salvar.");
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
        subtitle="Cadastro de produtos + preço padrão + preço por loja (override)."
        right={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => router.push("/adm/lojas")}>
              Lojas
            </Button>
            <Button variant="secondary" onClick={() => router.push("/adm/pedidos")}>
              Pedidos
            </Button>
            <Button variant="secondary" onClick={refreshAll} disabled={working || priceWorking}>
              Atualizar
            </Button>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm text-red-600">{msg}</div>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Form */}
        <Card title={editingId ? "Editar produto" : "Novo produto"}>
          <div className="grid gap-3">
            <Input label="SKU" value={sku} onChange={setSku} placeholder="Ex.: AB-001" />
            <Input label="Nome" value={name} onChange={setName} placeholder="Ex.: Pão Brioche" />

            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Unidade" value={unit} onChange={setUnit} placeholder="un / cx / kg ..." />
              <Input label="Preço padrão" value={unitPrice} onChange={setUnitPrice} placeholder="0,00" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Passo (step_qty)" value={stepQty} onChange={setStepQty} placeholder="1" />
              <Input label="Lote/caixa (pack_qty)" value={packQty} onChange={setPackQty} placeholder="1" />
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

            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={saveProduct} disabled={working}>
                {working ? "Salvando..." : "Salvar"}
              </Button>
              <Button variant="secondary" onClick={resetForm} disabled={working}>
                Limpar
              </Button>
            </div>

            {editingId ? (
              <div className="pt-2 text-xs text-slate-500">
                ID: <span className="font-mono">{editingId}</span>
              </div>
            ) : null}
          </div>
        </Card>

        {/* Lista */}
        <Card title="Lista">
          <div className="grid gap-3">
            <Input value={q} onChange={setQ} placeholder="Buscar por SKU, nome..." />

            {loading ? <div className="text-sm text-slate-600">Carregando...</div> : null}

            {!loading && filtered.length === 0 ? (
              <div className="text-sm text-slate-600">Nenhum produto encontrado.</div>
            ) : null}

            {!loading && filtered.length > 0 ? (
              <div className="grid gap-2">
                {filtered.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate font-semibold text-slate-900">
                          {p.name ?? "-"} {p.sku ? `(${p.sku})` : ""}
                        </div>
                        <Badge tone={p.active ? "green" : "red"}>{p.active ? "Ativo" : "Inativo"}</Badge>
                      </div>

                      <div className="mt-1 text-sm text-slate-600">
                        {p.unit ?? "un"} · {moneyBR(Number(p.unit_price ?? 0))} · passo {p.step_qty ?? 1} · lote{" "}
                        {p.pack_qty ?? 1}
                      </div>

                      <div className="mt-2 truncate font-mono text-xs text-slate-500">{p.id}</div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => startEdit(p)} disabled={working}>
                        Editar
                      </Button>
                      <Button
                        variant="warn"
                        onClick={() => toggleActive(p)}
                        disabled={working}
                        title={p.active ? "Desativar produto" : "Ativar produto"}
                      >
                        {p.active ? "Desativar" : "Ativar"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      {/* Preços por loja */}
      <Card
        title="Preços por loja"
        subtitle="Defina um preço específico para uma loja. Se não existir override, vale o preço padrão do produto."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={storeFilterId}
              onChange={(v) => setStoreFilterId(v)}
              options={
                stores.length === 0
                  ? [{ value: "", label: "(Sem lojas)" }]
                  : stores.map((s) => ({ value: s.id, label: s.name ?? s.id }))
              }
            />

            <Button
              variant="secondary"
              onClick={() => storeFilterId && loadStorePrices(storeFilterId)}
              disabled={!storeFilterId || priceWorking || loading}
            >
              Recarregar preços
            </Button>

            <Button
              onClick={saveAllDirty}
              disabled={!storeFilterId || priceWorking || pendingCount === 0}
              title={pendingCount === 0 ? "Nenhuma alteração pendente" : "Salvar alterações"}
            >
              {priceWorking ? "Salvando..." : `Salvar alterações (${pendingCount})`}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-full max-w-md">
              <Input value={priceQ} onChange={setPriceQ} placeholder="Buscar produto por SKU/nome..." />
            </div>
            <div className="text-xs text-slate-600">
              Loja selecionada: <b>{selectedStoreName}</b>
            </div>
          </div>

          {loading ? <div className="text-sm text-slate-600">Carregando...</div> : null}

          {!loading ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-[900px] w-full border-collapse">
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

                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">{moneyBR(base)}</td>

                        <td className="px-4 py-3">
                          <div className="w-[160px]">
                            <Input
                              value={shownValue}
                              onChange={(v) => setDirty(pid, v)}
                              placeholder="Ex.: 12.50"
                            />
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {hasOverride ? "override cadastrado" : "sem override"}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">{moneyBR(effective)}</td>

                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="secondary"
                              onClick={() => saveStorePrice(pid)}
                              disabled={!storeFilterId || priceWorking}
                            >
                              Salvar
                            </Button>

                            <Button
                              variant="warn"
                              onClick={() => removeOverride(pid)}
                              disabled={!storeFilterId || priceWorking || !hasOverride}
                              title={!hasOverride ? "Não existe override para remover" : "Remover override"}
                            >
                              Remover override
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredForPrices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-4 text-sm text-slate-600">
                        Nenhum produto encontrado.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>

              <div className="px-4 py-3 text-xs text-slate-500">
                * Override: preço específico da loja. Se remover, volta a valer o “Preço padrão”.
              </div>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}