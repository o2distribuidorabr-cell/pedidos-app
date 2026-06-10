"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PageHeader, Card, Input, Select } from "@/app/components/ui";
import Link from "next/link";

type ProductRow = {
  id: string;
  sku: string | null;
  name: string | null;
  unit: string | null;
  ean?: string | null;
};

type EntryItem = {
  product_id: string;
  product_label: string;
  unit: string;
  quantity: string;
  unit_cost: string;
  supplier_sku?: string;
};

type XmlItem = {
  supplier_sku: string;
  description: string;
  ean: string;
  quantity: number;
  unit_cost: number;
};

function parseXmlItemsDOM(xmlText: string): { nfKey: string; nfNumber: string; supplierName: string; items: XmlItem[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");

  const getEl = (parent: Element | Document, tag: string) =>
    parent.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";

  const infNFe = doc.getElementsByTagName("infNFe")[0];
  const nfKey = infNFe?.getAttribute("Id")?.replace("NFe", "") ?? "";
  const nfNumber = getEl(doc, "nNF");
  const emit = doc.getElementsByTagName("emit")[0];
  const supplierName = emit ? (getEl(emit, "xNome") || getEl(emit, "xFant")) : "";

  const items: XmlItem[] = [];
  const dets = doc.getElementsByTagName("det");
  for (let i = 0; i < dets.length; i++) {
    const det = dets[i];
    const prod = det.getElementsByTagName("prod")[0];
    if (!prod) continue;
    items.push({
      supplier_sku: getEl(prod, "cProd"),
      description: getEl(prod, "xProd"),
      ean: getEl(prod, "cEAN") || getEl(prod, "cEANTrib"),
      quantity: parseFloat(getEl(prod, "qCom")) || 0,
      unit_cost: parseFloat(getEl(prod, "vUnCom")) || 0,
    });
  }
  return { nfKey, nfNumber, supplierName, items };
}

export default function EntradaEstoquePage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  // Cabeçalho da entrada
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [nfNumber, setNfNumber] = useState("");
  const [nfKey, setNfKey] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [notes, setNotes] = useState("");

  // Itens
  const [items, setItems] = useState<EntryItem[]>([]);
  const [selProduct, setSelProduct] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) { router.replace("/login"); return; }
      const { data } = await supabase
        .from("products")
        .select("id,sku,name,unit,ean")
        .eq("active", true)
        .order("name");
      if (data) setProducts(data as ProductRow[]);
      setLoading(false);
    })();
  }, []);

  function showToast(msg: string, type: "ok" | "err") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  function addItem() {
    if (!selProduct || !qty || !cost) { showToast("Preencha produto, quantidade e custo.", "err"); return; }
    const prod = products.find((p) => p.id === selProduct);
    if (!prod) return;
    setItems((prev) => [
      ...prev,
      {
        product_id: prod.id,
        product_label: `${prod.sku ? prod.sku + " – " : ""}${prod.name ?? ""}`,
        unit: prod.unit ?? "",
        quantity: qty,
        unit_cost: cost,
      },
    ]);
    setSelProduct("");
    setQty("");
    setCost("");
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleXml(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const { nfKey: k, nfNumber: n, supplierName: s, items: xmlItems } = parseXmlItemsDOM(text);
    if (k) setNfKey(k);
    if (n) setNfNumber(n);
    if (s) setSupplierName(s);

    const newItems: EntryItem[] = [];
    for (const xi of xmlItems) {
      // Tenta casar por EAN ou supplier_sku
      let prod = products.find((p) => p.ean && xi.ean && p.ean === xi.ean);
      if (!prod && xi.supplier_sku) {
        prod = products.find((p) => p.sku === xi.supplier_sku);
      }
      newItems.push({
        product_id: prod?.id ?? "",
        product_label: prod
          ? `${prod.sku ? prod.sku + " – " : ""}${prod.name ?? ""}`
          : `[NÃO ENCONTRADO] ${xi.description}`,
        unit: prod?.unit ?? "un",
        quantity: String(xi.quantity),
        unit_cost: String(xi.unit_cost),
        supplier_sku: xi.supplier_sku,
      });
    }
    setItems(newItems);
    if (fileRef.current) fileRef.current.value = "";
    showToast(`${newItems.length} item(ns) importado(s) do XML.`, "ok");
  }

  async function save() {
    const validItems = items.filter((i) => i.product_id);
    if (validItems.length === 0) { showToast("Nenhum item válido para salvar.", "err"); return; }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;

      for (const item of validItems) {
        const qty_n = parseFloat(item.quantity.replace(",", ".")) || 0;
        const cost_n = parseFloat(item.unit_cost.replace(",", ".")) || 0;
        if (qty_n <= 0 || cost_n < 0) continue;

        const { data: entry, error: entryErr } = await supabase
          .from("stock_entries")
          .insert({
            product_id: item.product_id,
            quantity: qty_n,
            unit_cost: cost_n,
            nf_key: nfKey || null,
            nf_number: nfNumber || null,
            supplier_name: supplierName || null,
            entry_date: entryDate,
            notes: notes || null,
            created_by: userId ?? null,
          })
          .select("id")
          .single();

        if (entryErr) throw new Error(entryErr.message);

        const { error: mvErr } = await supabase.from("stock_movements").insert({
          product_id: item.product_id,
          movement_type: "ENTRY",
          quantity: qty_n,
          unit_cost: cost_n,
          entry_id: entry.id,
          notes: supplierName ? `Entrada de ${supplierName}` : "Entrada manual",
          created_by: userId ?? null,
        });

        if (mvErr) throw new Error(mvErr.message);
      }

      showToast("Entrada registrada com sucesso!", "ok");
      setItems([]);
      setNfKey("");
      setNfNumber("");
      setSupplierName("");
      setNotes("");
    } catch (err: any) {
      showToast(err.message ?? "Erro ao salvar.", "err");
    } finally {
      setSaving(false);
    }
  }

  const productOptions = products.map((p) => ({
    value: p.id,
    label: `${p.sku ? p.sku + " – " : ""}${p.name ?? ""}`,
  }));

  if (loading) return <div className="p-8 text-center text-sm text-slate-500">Carregando...</div>;

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-[14px] px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}

      <PageHeader
        title="Entrada de estoque"
        subtitle="Registre entradas manuais ou via XML de NF-e"
        right={
          <Link
            href="/adm/estoque"
            className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            ← Voltar
          </Link>
        }
      />

      <Card>
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Dados da nota fiscal</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input label="Data de entrada" type="date" value={entryDate} onChange={(v) => setEntryDate(v)} />
          <Input label="Nº da NF" value={nfNumber} onChange={(v) => setNfNumber(v)} placeholder="Ex: 001234" />
          <Input label="Fornecedor" value={supplierName} onChange={(v) => setSupplierName(v)} placeholder="Nome do fornecedor" />
          <Input label="Observações" value={notes} onChange={(v) => setNotes(v)} placeholder="Opcional" />
        </div>
        <div className="mt-3">
          <Input label="Chave NF-e (44 dígitos)" value={nfKey} onChange={(v) => setNfKey(v)} placeholder="Chave de acesso" />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-sm text-slate-500">ou</span>
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[14px] border border-dashed border-slate-300 bg-slate-50 px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 transition">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M9.293 1.293a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 4.414V13a1 1 0 11-2 0V4.414L6.707 6.707a1 1 0 01-1.414-1.414l4-4z" />
              <path d="M3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
            </svg>
            Importar XML de NF-e
            <input ref={fileRef} type="file" accept=".xml,text/xml" className="hidden" onChange={handleXml} />
          </label>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Adicionar item</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Select
              label="Produto"
              value={selProduct}
              onChange={(v) => setSelProduct(v)}
              options={[{ value: "", label: "Selecione..." }, ...productOptions]}
            />
          </div>
          <Input label="Quantidade" value={qty} onChange={(v) => setQty(v)} placeholder="0" type="number" min="0" step="any" />
          <Input label="Custo unitário (R$)" value={cost} onChange={(v) => setCost(v)} placeholder="0,00" type="number" min="0" step="any" />
        </div>
        <button
          onClick={addItem}
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-[14px] bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 transition"
        >
          + Adicionar
        </button>
      </Card>

      {items.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">Itens da entrada ({items.length})</h2>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-[14px] bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {saving ? "Salvando..." : "Confirmar entrada"}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Produto</th>
                  <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Qtd</th>
                  <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Custo unit.</th>
                  <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Total</th>
                  <th className="pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const q = parseFloat(item.quantity) || 0;
                  const c = parseFloat(item.unit_cost) || 0;
                  const notFound = !item.product_id;
                  return (
                    <tr key={idx} className={`border-b border-slate-50 ${notFound ? "bg-red-50" : ""}`}>
                      <td className="py-3 pr-4">
                        <span className={notFound ? "text-red-600 font-medium" : "text-slate-900 font-medium"}>
                          {item.product_label}
                        </span>
                        {notFound && (
                          <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">não cadastrado</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">{q.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} {item.unit}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {c.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {(q * c).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </td>
                      <td className="py-3">
                        <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 text-xs">Remover</button>
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-slate-200">
                  <td colSpan={3} className="pt-3 pr-4 text-right font-semibold text-slate-700">Total da entrada</td>
                  <td className="pt-3 pr-4 text-right font-bold text-slate-900 tabular-nums">
                    {items
                      .reduce((acc, i) => acc + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_cost) || 0), 0)
                      .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
