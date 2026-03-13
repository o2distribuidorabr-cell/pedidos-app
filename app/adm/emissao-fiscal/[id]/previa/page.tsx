"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";

type OrderRow = {
  id: string;
  store_id: string | null;
  emitter_id: string | null;
  status: string;
  notes: string | null;
  created_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  delivery_mode: "RETIRADA" | "FRETE" | null;
  freight_fee: number | null;
  credit_applied: number | null;
};

type StoreRow = {
  id: string;
  name: string | null;
  legal_name: string | null;
  cnpj: string | null;
  ie: string | null;
  ind_ie_dest: string | null;
  email_nf: string | null;
  phone_nf: string | null;
  address_zip: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  city: string | null;
  state: string | null;
};

type EmitterRow = {
  id: string;
  name: string;
  legal_name: string;
  cnpj: string;
  ie: string | null;
  email: string | null;
  phone: string | null;
  address_zip: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  city: string | null;
  state: string | null;
  default_natureza_operacao: string | null;
  default_serie: string | null;
  is_active: boolean;
  is_default: boolean;
};

type ProductFiscalEmbed = {
  sku: string | null;
  name: string | null;
  unit: string | null;
  ncm?: string | null;
  cest?: string | null;
  cfop?: string | null;
  ean?: string | null;
  origin?: string | null;
  icms_cst?: string | null;
  pis_cst?: string | null;
  cofins_cst?: string | null;
};

type ItemRow = {
  id: string;
  qty: number;
  unit: string | null;
  unit_cost: number | null;
  product_id: string;
  products: ProductFiscalEmbed | null;
};

function fmtBRL(v: number) {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleDateString("pt-BR");
  } catch {
    return v;
  }
}

function onlyDigits(v: string | null | undefined) {
  return (v ?? "").replace(/\D/g, "");
}

function fmtCNPJ(v: string | null | undefined) {
  const d = onlyDigits(v);
  if (d.length !== 14) return v ?? "-";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function fmtIE(v: string | null | undefined) {
  return v || "-";
}

function fullAddress(data: {
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  address_zip?: string | null;
}) {
  return [
    [data.address_street, data.address_number].filter(Boolean).join(", "),
    data.address_complement,
    data.address_neighborhood,
    [data.city, data.state].filter(Boolean).join("/"),
    data.address_zip ? `CEP ${data.address_zip}` : "",
  ]
    .filter(Boolean)
    .join(" • ");
}

export default function AdmEmissaoFiscalPreviaPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params?.id;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [store, setStore] = useState<StoreRow | null>(null);
  const [emitter, setEmitter] = useState<EmitterRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);

  useEffect(() => {
    (async () => {
      const ok = await requireAdminOrRedirect(router);
      if (!ok) return;
      await loadData();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function loadData() {
    if (!orderId) {
      setMsg("Pedido inválido.");
      return;
    }

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("id,store_id,emitter_id,status,notes,created_at,submitted_at,approved_at,delivery_mode,freight_fee,credit_applied")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !orderData) {
      setMsg(orderError?.message || "Pedido não encontrado.");
      return;
    }

    const ord = orderData as OrderRow;
    setOrder(ord);

    if (ord.store_id) {
      const { data: storeData } = await supabase
        .from("stores")
        .select("id,name,legal_name,cnpj,ie,ind_ie_dest,email_nf,phone_nf,address_zip,address_street,address_number,address_complement,address_neighborhood,city,state")
        .eq("id", ord.store_id)
        .maybeSingle();

      setStore((storeData ?? null) as StoreRow | null);
    }

    if (ord.emitter_id) {
      const { data: emitterData } = await supabase
        .from("emitters")
        .select("id,name,legal_name,cnpj,ie,email,phone,address_zip,address_street,address_number,address_complement,address_neighborhood,city,state,default_natureza_operacao,default_serie,is_active,is_default")
        .eq("id", ord.emitter_id)
        .maybeSingle();

      setEmitter((emitterData ?? null) as EmitterRow | null);
    } else {
      const { data: defaultEmitter } = await supabase
        .from("emitters")
        .select("id,name,legal_name,cnpj,ie,email,phone,address_zip,address_street,address_number,address_complement,address_neighborhood,city,state,default_natureza_operacao,default_serie,is_active,is_default")
        .eq("is_default", true)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      setEmitter((defaultEmitter ?? null) as EmitterRow | null);
    }

    const { data: itemsData, error: itemsError } = await supabase
      .from("order_items")
      .select(`
        id,
        qty,
        unit,
        unit_cost,
        product_id,
        products:products (
          sku,
          name,
          unit,
          ncm,
          cest,
          cfop,
          ean,
          origin,
          icms_cst,
          pis_cst,
          cofins_cst
        )
      `)
      .eq("order_id", orderId);

    if (itemsError) {
      setMsg(itemsError.message);
      setItems([]);
    } else {
      const normalized = (itemsData ?? []).map((row: any) => ({
        id: row.id,
        qty: row.qty,
        unit: row.unit ?? null,
        unit_cost: row.unit_cost ?? null,
        product_id: row.product_id,
        products: Array.isArray(row.products) ? row.products[0] ?? null : row.products ?? null,
      })) as ItemRow[];
      setItems(normalized);
    }
  }

  const totalProdutos = useMemo(() => {
    return items.reduce((acc, item) => acc + Number(item.qty || 0) * Number(item.unit_cost || 0), 0);
  }, [items]);

  const valorFrete = useMemo(() => Number(order?.freight_fee ?? 0), [order?.freight_fee]);
  const valorCredito = useMemo(() => Number(order?.credit_applied ?? 0), [order?.credit_applied]);
  const valorLiquido = useMemo(() => Math.max(totalProdutos + valorFrete - valorCredito, 0), [totalProdutos, valorFrete, valorCredito]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-[1100px] rounded-2xl bg-white p-8 shadow-sm">
          Carregando prévia...
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-[1100px] rounded-2xl bg-white p-8 shadow-sm text-red-600">
          {msg || "Pedido não encontrado."}
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
          }
        }
      `}</style>

      <div className="min-h-screen bg-slate-100 p-4 md:p-8">
        <div className="no-print mx-auto mb-4 flex max-w-[1100px] flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-11 items-center justify-center rounded-[18px] bg-cyan-600 px-4 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(8,145,178,0.22)] transition hover:bg-cyan-700"
          >
            Imprimir / Salvar PDF
          </button>
          <button
            type="button"
            onClick={() => window.close()}
            className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>

        <div className="relative mx-auto max-w-[1100px] overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rotate-[-28deg] select-none text-[64px] font-extrabold tracking-[0.2em] text-slate-200 opacity-60 md:text-[96px]">
              PRÉVIA • SEM VALOR FISCAL
            </div>
          </div>

          <div className="relative z-10 p-5 md:p-8">
            <div className="border-b border-slate-300 pb-4">
              <div className="grid gap-4 md:grid-cols-[1.4fr_0.8fr]">
                <div>
                  <div className="text-xl font-bold tracking-tight text-slate-900">
                    DANFE - DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    Pré-visualização não autorizada
                  </div>
                </div>

                <div className="rounded-xl border border-slate-300 p-4 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-slate-500">Pedido</div>
                    <div className="text-right font-semibold text-slate-900">{order.id}</div>
                    <div className="text-slate-500">Emissão</div>
                    <div className="text-right font-semibold text-slate-900">{fmtDate(order.created_at)}</div>
                    <div className="text-slate-500">Série</div>
                    <div className="text-right font-semibold text-slate-900">{emitter?.default_serie || "1"}</div>
                    <div className="text-slate-500">Nº NF-e</div>
                    <div className="text-right font-semibold text-slate-900">PRÉVIA</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div className="rounded-xl border border-slate-300 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Emitente</div>
                <div className="mt-2 text-base font-bold text-slate-900">{emitter?.legal_name || "-"}</div>
                <div className="mt-1 text-sm text-slate-700">Fantasia: {emitter?.name || "-"}</div>
                <div className="mt-1 text-sm text-slate-700">CNPJ: {fmtCNPJ(emitter?.cnpj)}</div>
                <div className="mt-1 text-sm text-slate-700">IE: {fmtIE(emitter?.ie)}</div>
                <div className="mt-1 text-sm text-slate-700">
                  {fullAddress({
                    address_street: emitter?.address_street,
                    address_number: emitter?.address_number,
                    address_complement: emitter?.address_complement,
                    address_neighborhood: emitter?.address_neighborhood,
                    city: emitter?.city,
                    state: emitter?.state,
                    address_zip: emitter?.address_zip,
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-300 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Destinatário</div>
                <div className="mt-2 text-base font-bold text-slate-900">{store?.legal_name || store?.name || "-"}</div>
                <div className="mt-1 text-sm text-slate-700">Fantasia: {store?.name || "-"}</div>
                <div className="mt-1 text-sm text-slate-700">CNPJ: {fmtCNPJ(store?.cnpj)}</div>
                <div className="mt-1 text-sm text-slate-700">IE: {fmtIE(store?.ie)}</div>
                <div className="mt-1 text-sm text-slate-700">
                  {fullAddress({
                    address_street: store?.address_street,
                    address_number: store?.address_number,
                    address_complement: store?.address_complement,
                    address_neighborhood: store?.address_neighborhood,
                    city: store?.city,
                    state: store?.state,
                    address_zip: store?.address_zip,
                  })}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-300 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="border-b border-slate-300 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-600">Código</th>
                      <th className="border-b border-slate-300 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-600">Descrição</th>
                      <th className="border-b border-slate-300 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-600">NCM</th>
                      <th className="border-b border-slate-300 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-600">CFOP</th>
                      <th className="border-b border-slate-300 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-600">Unid.</th>
                      <th className="border-b border-slate-300 px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wide text-slate-600">Qtd.</th>
                      <th className="border-b border-slate-300 px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wide text-slate-600">Vlr Unit.</th>
                      <th className="border-b border-slate-300 px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wide text-slate-600">Vlr Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const total = Number(item.qty || 0) * Number(item.unit_cost || 0);
                      return (
                        <tr key={item.id}>
                          <td className="border-b border-slate-200 px-3 py-2 text-xs text-slate-900">{item.products?.sku || "-"}</td>
                          <td className="border-b border-slate-200 px-3 py-2 text-xs text-slate-900">{item.products?.name || "-"}</td>
                          <td className="border-b border-slate-200 px-3 py-2 text-center text-xs text-slate-700">{item.products?.ncm || "-"}</td>
                          <td className="border-b border-slate-200 px-3 py-2 text-center text-xs text-slate-700">{item.products?.cfop || "-"}</td>
                          <td className="border-b border-slate-200 px-3 py-2 text-center text-xs text-slate-700">{item.products?.unit || item.unit || "-"}</td>
                          <td className="border-b border-slate-200 px-3 py-2 text-right text-xs text-slate-700">{Number(item.qty || 0).toLocaleString("pt-BR")}</td>
                          <td className="border-b border-slate-200 px-3 py-2 text-right text-xs text-slate-700">{fmtBRL(Number(item.unit_cost || 0))}</td>
                          <td className="border-b border-slate-200 px-3 py-2 text-right text-xs font-semibold text-slate-900">{fmtBRL(total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-[1.5fr_0.9fr]">
              <div className="rounded-xl border border-slate-300 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Informações complementares</div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  {order.notes || "Sem observações."}
                </div>
              </div>

              <div className="rounded-xl border border-slate-300 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Totais</div>
                <div className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
                  <div className="text-slate-500">Valor produtos</div>
                  <div className="text-right font-semibold text-slate-900">{fmtBRL(totalProdutos)}</div>

                  <div className="text-slate-500">Frete</div>
                  <div className="text-right font-semibold text-slate-900">{fmtBRL(valorFrete)}</div>

                  <div className="text-slate-500">Crédito abatido</div>
                  <div className="text-right font-semibold text-slate-900">- {fmtBRL(valorCredito)}</div>

                  <div className="border-t border-slate-200 pt-2 text-slate-700 font-bold">Valor total da nota</div>
                  <div className="border-t border-slate-200 pt-2 text-right font-bold text-slate-900">{fmtBRL(valorLiquido)}</div>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm font-semibold text-slate-600">
              ESTA É UMA PRÉVIA VISUAL DA NF-E • DOCUMENTO SEM VALOR FISCAL • NÃO AUTORIZADO PELA SEFAZ
            </div>
          </div>
        </div>
      </div>
    </>
  );
}