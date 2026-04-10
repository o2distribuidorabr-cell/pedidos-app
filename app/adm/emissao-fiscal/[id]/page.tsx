"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";
import { PageHeader, Card, Badge, Input, Select } from "@/app/components/ui";

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
  default_natureza_operacao: string | null;
  default_serie: string | null;
  is_default: boolean;
  is_active: boolean;
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

  icms_percent?: number | null;
  sit_trib?: string | null;
  pis_percent?: number | null;
  cofins_percent?: number | null;
  aliq_mun?: number | null;
  aliq_est?: number | null;
  aliq_fed?: number | null;
  aliq_csosn?: number | null;
  csosn?: string | null;
  base_reduction_percent?: number | null;
  benefit_fiscal?: string | null;
  desoneration_percent?: number | null;
  red_base_effective_percent?: number | null;
  icms_effective_percent?: number | null;
  last_fiscal_change_at?: string | null;
  cst_rt?: string | null;
  cod_class_trib_rt?: string | null;
  cbs_rt_percent?: number | null;
  ibs_uf_rt_percent?: number | null;
  ibs_mun_rt_percent?: number | null;
  red_cbs_rt_percent?: number | null;
  red_ibs_uf_rt_percent?: number | null;
  red_ibs_mun_rt_percent?: number | null;

  // ICMS-ST retida anteriormente (CSOSN 500)
  icms_st_ret_base?: number | null;
  icms_st_ret_aliquota?: number | null;
  icms_st_ret_vlr_substituto?: number | null;
  icms_st_ret_valor?: number | null;
};

type ItemRow = {
  id: string;
  qty: number;
  unit: string | null;
  unit_cost: number | null;
  product_id: string;
  products: ProductFiscalEmbed | null;
};

type FocusDocRow = {
  id: string;
  order_id: string;
  status: string | null;
  reference: string | null;
  numero: string | null;
  serie: string | null;
  chave: string | null;
  protocolo: string | null;
  url_danfe: string | null;
  url_xml: string | null;
  error_message: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type DraftItem = {
  line_id: string;
  product_id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  ncm: string;
  cest: string;
  cfop: string;
  ean: string;
  origem: string;
  icms_situacao_tributaria: string;
  pis_situacao_tributaria: string;
  cofins_situacao_tributaria: string;

  icms_percent: string;
  sit_trib: string;
  pis_percent: string;
  cofins_percent: string;
  aliq_mun: string;
  aliq_est: string;
  aliq_fed: string;
  aliq_csosn: string;
  csosn: string;
  base_reduction_percent: string;
  benefit_fiscal: string;
  desoneration_percent: string;
  red_base_effective_percent: string;
  icms_effective_percent: string;
  cst_rt: string;
  cod_class_trib_rt: string;
  cbs_rt_percent: string;
  ibs_uf_rt_percent: string;
  ibs_mun_rt_percent: string;
  red_cbs_rt_percent: string;
  red_ibs_uf_rt_percent: string;
  red_ibs_mun_rt_percent: string;

  quantidade: number;
  valor_unitario: number;
  valor_total: number;

  // ─── ST retido (CSOSN/CST 500) ──────────────────────────────────────────
  st_vbc_ret: string;       // vBCSTRet  — base de cálculo do ST retido
  st_p_st: string;          // pST       — alíquota suportada pelo consumidor
  st_v_substituto: string;  // vICMSSubstituto — ICMS próprio do substituto
  st_v_st_ret: string;      // vICMSSTRet — valor ST retido
};

type ItemIssue = {
  line_id: string;
  codigo: string;
  descricao: string;
  issues: string[];
};

type PayloadItem = {
  codigo: string;
  descricao: string;
  unidade: string;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  gtin: string | null;
  origem: string | null;
  icms_situacao_tributaria: string | null;
  pis_situacao_tributaria: string | null;
  cofins_situacao_tributaria: string | null;

  icms_percent: string | null;
  sit_trib: string | null;
  pis_percent: string | null;
  cofins_percent: string | null;
  aliq_mun: string | null;
  aliq_est: string | null;
  aliq_fed: string | null;
  aliq_csosn: string | null;
  csosn: string | null;
  base_reduction_percent: string | null;
  benefit_fiscal: string | null;
  desoneration_percent: string | null;
  red_base_effective_percent: string | null;
  icms_effective_percent: string | null;
  cst_rt: string | null;
  cod_class_trib_rt: string | null;
  cbs_rt_percent: string | null;
  ibs_uf_rt_percent: string | null;
  ibs_mun_rt_percent: string | null;
  red_cbs_rt_percent: string | null;
  red_ibs_uf_rt_percent: string | null;
  red_ibs_mun_rt_percent: string | null;

  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  valor_frete: number;
  valor_outras_despesas: number;

  // ST retido — só enviado quando CSOSN/CST 500
  icms_vbc_st_retido?: number | null;
  icms_p_st?: number | null;
  icms_valor_substituto?: number | null;
  icms_valor_st_retido?: number | null;
};

function fmtBRL(v: number) {
  return Number(v ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtDT(v: string | null | undefined) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("pt-BR");
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

function toneForNfeStatus(status: string | null | undefined) {
  const s = String(status || "").toLowerCase();
  if (["autorizado", "emitido", "processado", "aprovado"].includes(s)) return "green";
  if (["erro", "rejeitado", "cancelado", "denegado", "erro_autorizacao"].includes(s)) return "red";
  if (["processando", "pendente", "enviado"].includes(s)) return "yellow";
  return "neutral";
}

function toInput(v: number | string | null | undefined) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function round2(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function isStRetido(item: DraftItem): boolean {
  const cst = String(item.icms_situacao_tributaria || "").trim();
  const csosn = String(item.csosn || "").trim();
  return cst === "500" || csosn === "500";
}

function buildItemsWithExtraExpenses(items: DraftItem[], extraExpenseTotal: number): PayloadItem[] {
  const normalizedExtra = round2(extraExpenseTotal);
  const totalProdutos = round2(
    items.reduce((acc, item) => acc + Number(item.valor_total || 0), 0)
  );

  const mapItem = (it: DraftItem, valorOutrasDespesas: number): PayloadItem => {
    const stFields: Partial<PayloadItem> = {};
    if (isStRetido(it)) {
      const vbc = parseFloat(it.st_vbc_ret) || 0;
      const pst = parseFloat(it.st_p_st) || 0;
      const vsub = parseFloat(it.st_v_substituto) || 0;
      const vstret = parseFloat(it.st_v_st_ret) || 0;
      if (vbc > 0) {
        stFields.icms_vbc_st_retido = round2(vbc);
        stFields.icms_p_st = round2(pst);
        stFields.icms_valor_substituto = round2(vsub);
        stFields.icms_valor_st_retido = round2(vstret);
      }
    }

    return {
      codigo: it.codigo,
      descricao: it.descricao,
      unidade: it.unidade,
      ncm: it.ncm || null,
      cest: it.cest || null,
      cfop: it.cfop || null,
      gtin: it.ean || null,
      origem: it.origem || null,
      icms_situacao_tributaria: it.icms_situacao_tributaria || null,
      pis_situacao_tributaria: it.pis_situacao_tributaria || null,
      cofins_situacao_tributaria: it.cofins_situacao_tributaria || null,
      icms_percent: it.icms_percent || null,
      sit_trib: it.sit_trib || null,
      pis_percent: it.pis_percent || null,
      cofins_percent: it.cofins_percent || null,
      aliq_mun: it.aliq_mun || null,
      aliq_est: it.aliq_est || null,
      aliq_fed: it.aliq_fed || null,
      aliq_csosn: it.aliq_csosn || null,
      csosn: it.csosn || null,
      base_reduction_percent: it.base_reduction_percent || null,
      benefit_fiscal: it.benefit_fiscal || null,
      desoneration_percent: it.desoneration_percent || null,
      red_base_effective_percent: it.red_base_effective_percent || null,
      icms_effective_percent: it.icms_effective_percent || null,
      cst_rt: it.cst_rt || null,
      cod_class_trib_rt: it.cod_class_trib_rt || null,
      cbs_rt_percent: it.cbs_rt_percent || null,
      ibs_uf_rt_percent: it.ibs_uf_rt_percent || null,
      ibs_mun_rt_percent: it.ibs_mun_rt_percent || null,
      red_cbs_rt_percent: it.red_cbs_rt_percent || null,
      red_ibs_uf_rt_percent: it.red_ibs_uf_rt_percent || null,
      red_ibs_mun_rt_percent: it.red_ibs_mun_rt_percent || null,
      quantidade: Number(it.quantidade || 0),
      valor_unitario: round2(Number(it.valor_unitario || 0)),
      valor_total: round2(Number(it.valor_total || 0)),
      valor_frete: 0,
      valor_outras_despesas: valorOutrasDespesas,
      ...stFields,
    };
  };

  if (normalizedExtra <= 0 || totalProdutos <= 0 || items.length === 0) {
    return items.map((it) => mapItem(it, 0));
  }

  let allocated = 0;
  return items.map((it, index) => {
    const valorItem = round2(Number(it.valor_total || 0));
    let valorOutrasDespesas = 0;
    if (index === items.length - 1) {
      valorOutrasDespesas = round2(normalizedExtra - allocated);
    } else {
      valorOutrasDespesas = round2((valorItem / totalProdutos) * normalizedExtra);
      allocated = round2(allocated + valorOutrasDespesas);
    }
    return mapItem(it, valorOutrasDespesas);
  });
}

function TextCell({
  value,
  onChange,
  width = "w-24",
  invalid = false,
}: {
  value: string;
  onChange: (v: string) => void;
  width?: string;
  invalid?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${width} rounded-[10px] border px-2 py-2 text-xs text-slate-900 outline-none transition focus:border-slate-300 ${
        invalid ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
      }`}
    />
  );
}

function validateDraftItem(item: DraftItem): string[] {
  const issues: string[] = [];

  if (!String(item.descricao || "").trim()) issues.push("Descrição");
  if (!String(item.unidade || "").trim()) issues.push("Unidade");
  if (!String(item.ncm || "").trim()) issues.push("NCM");
  if (!String(item.cfop || "").trim()) issues.push("CFOP");
  if (!String(item.origem || "").trim()) issues.push("Origem");
  if (!String(item.icms_situacao_tributaria || "").trim()) issues.push("ICMS/CST");
  if (!String(item.pis_situacao_tributaria || "").trim()) issues.push("PIS CST");
  if (!String(item.cofins_situacao_tributaria || "").trim()) issues.push("COFINS CST");

  const qtd = Number(item.quantidade || 0);
  const unit = Number(item.valor_unitario || 0);
  if (!(qtd > 0)) issues.push("Quantidade");
  if (!(unit >= 0)) issues.push("Valor unitário");

  // Valida campos ST quando CSOSN/CST 500
  if (isStRetido(item)) {
    if (!(parseFloat(item.st_vbc_ret) > 0)) issues.push("ST: Base de cálculo retido");
    if (!(parseFloat(item.st_p_st) > 0)) issues.push("ST: Alíquota");
    if (!(parseFloat(item.st_v_substituto) >= 0)) issues.push("ST: ICMS substituto");
    if (!(parseFloat(item.st_v_st_ret) > 0)) issues.push("ST: Valor retido");
  }

  return issues;
}

export default function AdmEmissaoFiscalDetalhePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params?.id;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [emitting, setEmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingEmitter, setSavingEmitter] = useState(false);

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [store, setStore] = useState<StoreRow | null>(null);
  const [emitters, setEmitters] = useState<EmitterRow[]>([]);
  const [selectedEmitterId, setSelectedEmitterId] = useState<string>("");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [focusDoc, setFocusDoc] = useState<FocusDocRow | null>(null);

  const [naturezaOperacao, setNaturezaOperacao] = useState("VENDA DE MERCADORIA");
  const [serie, setSerie] = useState("1");
  const [numero, setNumero] = useState("");

  const [showAdvanced, setShowAdvanced] = useState(false);

  const [draftItems, setDraftItems] = useState<Record<string, DraftItem>>({});

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

    setMsg("");

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
    setSelectedEmitterId(ord.emitter_id || "");

    if (ord.store_id) {
      const { data: storeData } = await supabase
        .from("stores")
        .select("id,name,legal_name,cnpj,ie,ind_ie_dest,email_nf,phone_nf,address_zip,address_street,address_number,address_complement,address_neighborhood,city,state")
        .eq("id", ord.store_id)
        .maybeSingle();

      setStore((storeData ?? null) as StoreRow | null);
    } else {
      setStore(null);
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
          cofins_cst,
          icms_percent,
          sit_trib,
          pis_percent,
          cofins_percent,
          aliq_mun,
          aliq_est,
          aliq_fed,
          aliq_csosn,
          csosn,
          base_reduction_percent,
          benefit_fiscal,
          desoneration_percent,
          red_base_effective_percent,
          icms_effective_percent,
          last_fiscal_change_at,
          cst_rt,
          cod_class_trib_rt,
          cbs_rt_percent,
          ibs_uf_rt_percent,
          ibs_mun_rt_percent,
          red_cbs_rt_percent,
          red_ibs_uf_rt_percent,
          red_ibs_mun_rt_percent,
          icms_st_ret_base,
          icms_st_ret_aliquota,
          icms_st_ret_vlr_substituto,
          icms_st_ret_valor
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

      const nextDraft: Record<string, DraftItem> = {};
      for (const item of normalized) {
        const p = item.products;
        nextDraft[item.id] = {
          line_id: item.id,
          product_id: item.product_id,
          codigo: p?.sku || item.product_id,
          descricao: p?.name || "",
          unidade: p?.unit || item.unit || "UN",
          ncm: p?.ncm || "",
          cest: p?.cest || "",
          cfop: p?.cfop || "",
          ean: p?.ean || "",
          origem: p?.origin || "0",
          icms_situacao_tributaria: p?.icms_cst || "",
          pis_situacao_tributaria: p?.pis_cst || "",
          cofins_situacao_tributaria: p?.cofins_cst || "",

          icms_percent: toInput(p?.icms_percent),
          sit_trib: p?.sit_trib || "",
          pis_percent: toInput(p?.pis_percent),
          cofins_percent: toInput(p?.cofins_percent),
          aliq_mun: toInput(p?.aliq_mun),
          aliq_est: toInput(p?.aliq_est),
          aliq_fed: toInput(p?.aliq_fed),
          aliq_csosn: toInput(p?.aliq_csosn),
          csosn: p?.csosn || "",
          base_reduction_percent: toInput(p?.base_reduction_percent),
          benefit_fiscal: p?.benefit_fiscal || "",
          desoneration_percent: toInput(p?.desoneration_percent),
          red_base_effective_percent: toInput(p?.red_base_effective_percent),
          icms_effective_percent: toInput(p?.icms_effective_percent),
          cst_rt: p?.cst_rt || "",
          cod_class_trib_rt: p?.cod_class_trib_rt || "",
          cbs_rt_percent: toInput(p?.cbs_rt_percent),
          ibs_uf_rt_percent: toInput(p?.ibs_uf_rt_percent),
          ibs_mun_rt_percent: toInput(p?.ibs_mun_rt_percent),
          red_cbs_rt_percent: toInput(p?.red_cbs_rt_percent),
          red_ibs_uf_rt_percent: toInput(p?.red_ibs_uf_rt_percent),
          red_ibs_mun_rt_percent: toInput(p?.red_ibs_mun_rt_percent),

          quantidade: Number(item.qty || 0),
          valor_unitario: Number(item.unit_cost || 0),
          valor_total: Number(item.qty || 0) * Number(item.unit_cost || 0),

          // ST retida: carrega do cadastro do produto, editável na tela
          st_vbc_ret: toInput(p?.icms_st_ret_base),
          st_p_st: toInput(p?.icms_st_ret_aliquota),
          st_v_substituto: toInput(p?.icms_st_ret_vlr_substituto),
          st_v_st_ret: toInput(p?.icms_st_ret_valor),
        };
      }
      setDraftItems(nextDraft);
    }

    const { data: emitterData, error: emitterError } = await supabase
      .from("emitters")
      .select("id,name,legal_name,cnpj,ie,default_natureza_operacao,default_serie,is_default,is_active")
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });

    if (emitterError) {
      setMsg(emitterError.message);
      setEmitters([]);
    } else {
      const list = (emitterData ?? []) as EmitterRow[];
      setEmitters(list);

      const selected = list.find((e) => e.id === (ord.emitter_id || ""));
      const fallback = selected || list.find((e) => e.is_default) || list[0] || null;

      if (fallback) {
        setSelectedEmitterId((prev) => prev || fallback.id);
        setNaturezaOperacao(fallback.default_natureza_operacao || "VENDA DE MERCADORIA");
        setSerie(fallback.default_serie || "1");
      }
    }

    const { data: focusData } = await supabase
      .from("focus_nfe_documents")
      .select("id,order_id,status,reference,numero,serie,chave,protocolo,url_danfe,url_xml,error_message,updated_at,created_at")
      .eq("order_id", orderId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setFocusDoc((focusData ?? null) as FocusDocRow | null);
  }

  async function saveEmitterOnOrder() {
    if (!order) return;

    setSavingEmitter(true);
    setMsg("");

    const { error } = await supabase
      .from("orders")
      .update({ emitter_id: selectedEmitterId || null })
      .eq("id", order.id);

    if (error) {
      setMsg(error.message);
      setSavingEmitter(false);
      return;
    }

    setSavingEmitter(false);
    setMsg("Emitente salvo no pedido.");
    await loadData();
  }

  function setDraftField(lineId: string, field: keyof DraftItem, value: string) {
    setDraftItems((prev) => {
      const next = {
        ...prev,
        [lineId]: {
          ...prev[lineId],
          [field]: value,
        },
      };

      if (field === "quantidade" || field === "valor_unitario") {
        const qtd = Number(next[lineId].quantidade || 0);
        const vu = Number(next[lineId].valor_unitario || 0);
        next[lineId].valor_total = qtd * vu;
      }

      return next;
    });
  }

  const selectedEmitter = useMemo(() => {
    return emitters.find((e) => e.id === selectedEmitterId) || null;
  }, [emitters, selectedEmitterId]);

  const totalProdutos = useMemo(() => {
    return Object.values(draftItems).reduce((acc, item) => acc + Number(item.valor_total || 0), 0);
  }, [draftItems]);

  const despesasAcessoriasNfe = useMemo(() => {
    return round2(Number(order?.freight_fee ?? 0));
  }, [order?.freight_fee]);

  const totalLiquido = useMemo(() => {
    const credit = Number(order?.credit_applied ?? 0);
    const extras = Number(order?.freight_fee ?? 0);
    return Math.max(totalProdutos + extras - credit, 0);
  }, [draftItems, order?.credit_applied, order?.freight_fee, totalProdutos]);

  const itemIssues = useMemo<ItemIssue[]>(() => {
    return Object.values(draftItems)
      .map((item) => {
        const issues = validateDraftItem(item);
        return {
          line_id: item.line_id,
          codigo: item.codigo,
          descricao: item.descricao,
          issues,
        };
      })
      .filter((x) => x.issues.length > 0);
  }, [draftItems]);

  const issuesByLine = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const issue of itemIssues) {
      map.set(issue.line_id, issue.issues);
    }
    return map;
  }, [itemIssues]);

  const canEmit = useMemo(() => {
    if (!order || !store) return false;
    if (!selectedEmitterId) return false;
    if (itemIssues.length > 0) return false;
    return true;
  }, [order, store, selectedEmitterId, itemIssues.length]);

  async function emitNfe() {
    if (!order || !store) {
      setMsg("Pedido ou loja não encontrados.");
      return;
    }

    if (!selectedEmitterId) {
      setMsg("Selecione um emitente.");
      return;
    }

    if (itemIssues.length > 0) {
      setMsg("Existem itens com campos fiscais obrigatórios faltando. Corrija antes de emitir.");
      return;
    }

    setEmitting(true);
    setMsg("");

    try {
      const extraExpenseTotal = round2(Number(order.freight_fee ?? 0));
      const payloadItems = buildItemsWithExtraExpenses(
        Object.values(draftItems),
        extraExpenseTotal
      );

      const payload = {
        orderId: order.id,
        storeId: order.store_id,
        emitterId: selectedEmitterId,
        reference: `PED-${order.id}`,
        natureza_operacao: naturezaOperacao,
        serie,
        numero: numero.trim() || null,
        destinatario: {
          nome: store.legal_name || store.name || "",
          nome_fantasia: store.name || "",
          cpf_cnpj: onlyDigits(store.cnpj || ""),
          indicador_inscricao_estadual: store.ind_ie_dest || "9",
          inscricao_estadual: store.ie || null,
          email: store.email_nf || null,
          telefone: store.phone_nf || null,
          endereco: {
            logradouro: store.address_street || "",
            numero: store.address_number || "",
            complemento: store.address_complement || "",
            bairro: store.address_neighborhood || "",
            cep: onlyDigits(store.address_zip || ""),
            municipio: store.city || "",
            uf: store.state || "",
          },
        },

        transporte: {
          modalidade_frete: "9",
          valor_frete: 0,
        },

        valor_outras_despesas: extraExpenseTotal,
        tratar_frete_como_despesa_acessoria: true,

        itens: payloadItems,
        observacoes: order.notes || null,
      };

      const res = await fetch("/api/focus/nfe/emitir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        const details =
          typeof data?.focus_details === "string"
            ? data.focus_details
            : data?.focus_details
            ? JSON.stringify(data.focus_details)
            : "";

        const validationDetails = Array.isArray(data?.validation_errors)
          ? `\n${data.validation_errors.join("\n")}`
          : "";

        setMsg(
          [data?.error || "Erro ao emitir NF-e.", details, validationDetails]
            .filter(Boolean)
            .join(" | ")
        );
        setEmitting(false);
        return;
      }

      setMsg("NF-e enviada para a Focus.");
      await loadData();
    } catch (e: any) {
      setMsg(e?.message || "Erro ao emitir NF-e.");
    } finally {
      setEmitting(false);
    }
  }

  async function refreshStatus() {
    if (!order || !focusDoc?.reference) return;

    setRefreshing(true);
    setMsg("");

    try {
      const res = await fetch("/api/focus/nfe/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          reference: focusDoc.reference,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        setMsg(data?.error || "Erro ao consultar status da NF-e.");
        setRefreshing(false);
        return;
      }

      setMsg("Status da NF-e atualizado.");
      await loadData();
    } catch (e: any) {
      setMsg(e?.message || "Erro ao consultar status da NF-e.");
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return <Card>Carregando...</Card>;
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Emissão fiscal"
          subtitle="Pedido não encontrado"
          right={
            <button
              type="button"
              onClick={() => router.push("/adm/emissao-fiscal")}
              className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50"
            >
              Voltar
            </button>
          }
        />
        <Card>
          <div className="text-sm text-red-600">{msg || "Pedido não encontrado."}</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rascunho fiscal"
        subtitle={`Pedido ${order.id}`}
        right={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.open(`/adm/emissao-fiscal/${order.id}/previa`, "_blank")}
              className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50"
            >
              Visualizar prévia
            </button>
            <button
              type="button"
              onClick={() => router.push("/adm/emissao-fiscal")}
              className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={refreshStatus}
              disabled={!focusDoc?.reference || refreshing}
              className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50 disabled:opacity-50"
            >
              {refreshing ? "Consultando..." : "Consultar status"}
            </button>
            <button
              type="button"
              onClick={emitNfe}
              disabled={emitting || !canEmit}
              className="inline-flex h-11 items-center justify-center rounded-[18px] bg-cyan-600 px-4 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(8,145,178,0.22)] transition hover:bg-cyan-700 disabled:opacity-50"
            >
              {emitting ? "Emitindo..." : "Emitir NF-e"}
            </button>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="whitespace-pre-wrap text-sm text-red-600">{msg}</div>
        </Card>
      ) : null}

      {itemIssues.length > 0 ? (
        <div className="rounded-[30px] border border-red-200 bg-red-50 p-5 shadow-sm md:p-6">
          <div className="text-sm font-semibold text-red-800">
            Existem {itemIssues.length} item(ns) com campos fiscais obrigatórios faltando.
          </div>
          <div className="mt-2 text-sm text-red-700">
            A emissão está bloqueada até a correção.
          </div>
          <div className="mt-4 space-y-3">
            {itemIssues.map((issue) => (
              <div key={issue.line_id} className="rounded-[18px] border border-red-200 bg-white p-3">
                <div className="text-sm font-semibold text-slate-900">
                  {issue.codigo || "-"} • {issue.descricao || "Sem descrição"}
                </div>
                <div className="mt-1 text-sm text-red-700">
                  Faltando: {issue.issues.join(", ")}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-[30px] border border-green-200 bg-green-50 p-5 shadow-sm md:p-6">
          <div className="text-sm font-semibold text-green-800">
            Todos os itens possuem os campos fiscais obrigatórios mínimos para emissão.
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="text-sm font-semibold text-slate-900">Resumo do pedido</div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Status do pedido</span>
              <Badge tone="blue">{order.status}</Badge>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Criado em</span>
              <span className="font-semibold text-slate-900">{fmtDT(order.created_at)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Enviado em</span>
              <span className="font-semibold text-slate-900">{fmtDT(order.submitted_at)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Aprovado em</span>
              <span className="font-semibold text-slate-900">{fmtDT(order.approved_at)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Produtos</span>
              <span className="font-semibold text-slate-900">{fmtBRL(totalProdutos)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Despesa acessória NF-e</span>
              <span className="font-semibold text-slate-900">{fmtBRL(despesasAcessoriasNfe)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Total líquido</span>
              <span className="font-semibold text-slate-900">{fmtBRL(totalLiquido)}</span>
            </div>
          </div>
          <div className="mt-4 rounded-[18px] border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-900">
            O valor do campo <strong>freight_fee</strong> será enviado para a NF-e como
            <strong> despesa acessória</strong>, e não como frete fiscal.
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Retorno Focus</div>
            {focusDoc ? (
              <Badge tone={toneForNfeStatus(focusDoc.status) as any}>{focusDoc.status || "sem status"}</Badge>
            ) : (
              <Badge tone="neutral">sem NF-e</Badge>
            )}
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Referência</span>
              <span className="font-semibold text-slate-900">{focusDoc?.reference || `PED-${order.id}`}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Número</span>
              <span className="font-semibold text-slate-900">{focusDoc?.numero || "-"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Série</span>
              <span className="font-semibold text-slate-900">{focusDoc?.serie || serie || "-"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Chave</span>
              <span className="break-all text-right font-semibold text-slate-900">{focusDoc?.chave || "-"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Protocolo</span>
              <span className="font-semibold text-slate-900">{focusDoc?.protocolo || "-"}</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {focusDoc?.reference ? (
              <>
                <a
                  href={`/api/focus/nfe/danfe?reference=${encodeURIComponent(focusDoc.reference)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center justify-center rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                >
                  ↓ Baixar DANFE
                </a>
                <a
                  href={`/api/focus/nfe/xml?reference=${encodeURIComponent(focusDoc.reference)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center justify-center rounded-[16px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50"
                >
                  ↓ Baixar XML
                </a>
              </>
            ) : (
              <div className="rounded-[12px] border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Emita a NF-e primeiro para disponibilizar DANFE e XML.
              </div>
            )}
          </div>
          <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Erro / retorno</div>
            <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
              {focusDoc?.error_message || "Sem mensagem de erro."}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="text-sm font-semibold text-slate-900">Emitente</div>
          <div className="mt-4 grid gap-4">
            <Select
              label="Emitente"
              value={selectedEmitterId}
              onChange={setSelectedEmitterId}
              options={emitters.map((e) => ({
                value: e.id,
                label: `${e.name} - ${fmtCNPJ(e.cnpj)}`,
              }))}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Natureza da operação" value={naturezaOperacao} onChange={setNaturezaOperacao} />
              <Input label="Série" value={serie} onChange={setSerie} />
              <Input label="Número" value={numero} onChange={setNumero} placeholder="opcional" />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveEmitterOnOrder}
                disabled={savingEmitter}
                className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50 disabled:opacity-50"
              >
                {savingEmitter ? "Salvando..." : "Salvar emitente no pedido"}
              </button>
            </div>
            {selectedEmitter ? (
              <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="font-semibold text-slate-900">{selectedEmitter.legal_name}</div>
                <div className="mt-1 text-slate-600">CNPJ: {fmtCNPJ(selectedEmitter.cnpj)}</div>
                <div className="mt-1 text-slate-600">IE: {selectedEmitter.ie || "-"}</div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="text-sm font-semibold text-slate-900">Destinatário</div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Loja</span>
              <span className="font-semibold text-slate-900">{store?.name || "-"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Razão social</span>
              <span className="font-semibold text-slate-900">{store?.legal_name || "-"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">CNPJ</span>
              <span className="font-semibold text-slate-900">{fmtCNPJ(store?.cnpj)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">IE</span>
              <span className="font-semibold text-slate-900">{store?.ie || "-"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Indicador IE</span>
              <span className="font-semibold text-slate-900">{store?.ind_ie_dest || "-"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Cidade / UF</span>
              <span className="font-semibold text-slate-900">
                {[store?.city, store?.state].filter(Boolean).join("/") || "-"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Painel ICMS-ST Retido (aparece só quando há produto CSOSN/CST 500) ─── */}
      {Object.values(draftItems).some(isStRetido) && (
        <div className="rounded-[30px] border border-amber-200 bg-amber-50 p-5 shadow-sm md:p-6">
          <div className="text-sm font-semibold text-amber-900">
            ⚠️ Substituição Tributária retida (CSOSN/CST 500)
          </div>
          <div className="mt-1 text-sm text-amber-800">
            Os produtos abaixo têm ST já recolhida pelo fornecedor. Preencha os valores da nota de compra para cada um.
          </div>

          <div className="mt-4 space-y-4">
            {Object.values(draftItems).filter(isStRetido).map((it) => {
              const issues = issuesByLine.get(it.line_id) || [];
              const stIssues = issues.filter((i) => i.startsWith("ST:"));
              return (
                <div
                  key={it.line_id}
                  className={`rounded-[20px] border p-4 ${stIssues.length > 0 ? "border-red-200 bg-red-50" : "border-amber-100 bg-white"}`}
                >
                  <div className="text-sm font-semibold text-slate-900">
                    {it.codigo} — {it.descricao}
                  </div>
                  {stIssues.length > 0 && (
                    <div className="mt-1 text-xs text-red-700">Faltando: {stIssues.join(", ")}</div>
                  )}
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Base cálculo ST retido (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="ex: 4262.60"
                        value={it.st_vbc_ret}
                        onChange={(e) => setDraftField(it.line_id, "st_vbc_ret", e.target.value)}
                        className={`w-full rounded-[10px] border px-3 py-2 text-sm outline-none transition focus:border-amber-400 ${
                          stIssues.includes("ST: Base de cálculo retido") ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
                        }`}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Alíquota ST (%)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="ex: 18.00"
                        value={it.st_p_st}
                        onChange={(e) => setDraftField(it.line_id, "st_p_st", e.target.value)}
                        className={`w-full rounded-[10px] border px-3 py-2 text-sm outline-none transition focus:border-amber-400 ${
                          stIssues.includes("ST: Alíquota") ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
                        }`}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        ICMS próprio substituto (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="ex: 568.35"
                        value={it.st_v_substituto}
                        onChange={(e) => setDraftField(it.line_id, "st_v_substituto", e.target.value)}
                        className={`w-full rounded-[10px] border px-3 py-2 text-sm outline-none transition focus:border-amber-400 ${
                          stIssues.includes("ST: ICMS substituto") ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
                        }`}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Valor ST retido (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="ex: 198.92"
                        value={it.st_v_st_ret}
                        onChange={(e) => setDraftField(it.line_id, "st_v_st_ret", e.target.value)}
                        className={`w-full rounded-[10px] border px-3 py-2 text-sm outline-none transition focus:border-amber-400 ${
                          stIssues.includes("ST: Valor retido") ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
                        }`}
                      />
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Esses valores estão na nota de compra do fornecedor (campos vBCST, pICMSST, vICMS e vICMSST).
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-[30px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 md:px-6">
          <div>
            <div className="text-sm font-semibold text-slate-900">Itens fiscais do pedido</div>
            <div className="mt-1 text-sm text-slate-600">
              Os dados abaixo vieram automaticamente da grade de Fiscal de Produtos.
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showAdvanced}
              onChange={(e) => setShowAdvanced(e.target.checked)}
            />
            Exibir campos avançados
          </label>
        </div>

        <div className="overflow-x-auto">
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="min-w-[2600px] w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">SKU</th>
                  <th className="sticky left-[120px] z-20 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Produto</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Unid.</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Qtd</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Vlr unit.</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Total</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">NCM</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">CEST</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">CFOP</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Origem</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">ICMS/CST</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">PIS CST</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">COFINS CST</th>
                  {showAdvanced ? (
                    <>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% ICMS</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Sit. Trib</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% PIS</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% COFINS</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Alíq. mun</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Alíq. est</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Alíq. fed</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Alíq. CSOSN</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">CSOSN</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% Base Red</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Benef. Fiscal</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% Deson.</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% Red. Base efet.</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% ICMS efetiva</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">CST RT</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Cod. Class. Trib RT</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% CBS RT</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% IBS UF RT</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% IBS Mun RT</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% Red CBS RT</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% Red IBS UF RT</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% Red IBS Mun RT</th>
                    </>
                  ) : null}
                </tr>
              </thead>

              <tbody>
                {Object.values(draftItems).map((it) => {
                  const issues = issuesByLine.get(it.line_id) || [];
                  const hasIssue = issues.some((i) => !i.startsWith("ST:"));

                  return (
                    <tr
                      key={it.line_id}
                      className={`border-b align-top ${hasIssue ? "border-red-200 bg-red-50/40" : "border-slate-100"}`}
                    >
                      <td className={`sticky left-0 z-10 px-4 py-3 ${hasIssue ? "bg-red-50" : "bg-white"}`}>
                        <div className="w-[120px] font-mono text-xs text-slate-700">{it.codigo || "-"}</div>
                      </td>
                      <td className={`sticky left-[120px] z-10 px-4 py-3 ${hasIssue ? "bg-red-50" : "bg-white"}`}>
                        <div className="w-[320px] text-sm font-semibold text-slate-900">{it.descricao || "-"}</div>
                        {hasIssue ? (
                          <div className="mt-1 text-xs text-red-700">
                            Faltando: {issues.filter((i) => !i.startsWith("ST:")).join(", ")}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3"><TextCell value={it.unidade} onChange={(v) => setDraftField(it.line_id, "unidade", v)} width="w-20" invalid={issues.includes("Unidade")} /></td>
                      <td className="px-3 py-3"><div className={`w-20 text-xs ${issues.includes("Quantidade") ? "font-semibold text-red-700" : "text-slate-700"}`}>{it.quantidade}</div></td>
                      <td className="px-3 py-3"><div className={`w-24 text-xs ${issues.includes("Valor unitário") ? "font-semibold text-red-700" : "text-slate-700"}`}>{fmtBRL(it.valor_unitario)}</div></td>
                      <td className="px-3 py-3"><div className="w-24 text-xs font-semibold text-slate-900">{fmtBRL(it.valor_total)}</div></td>
                      <td className="px-3 py-3"><TextCell value={it.ncm} onChange={(v) => setDraftField(it.line_id, "ncm", v)} width="w-24" invalid={issues.includes("NCM")} /></td>
                      <td className="px-3 py-3"><TextCell value={it.cest} onChange={(v) => setDraftField(it.line_id, "cest", v)} width="w-24" /></td>
                      <td className="px-3 py-3"><TextCell value={it.cfop} onChange={(v) => setDraftField(it.line_id, "cfop", v)} width="w-20" invalid={issues.includes("CFOP")} /></td>
                      <td className="px-3 py-3"><TextCell value={it.origem} onChange={(v) => setDraftField(it.line_id, "origem", v)} width="w-20" invalid={issues.includes("Origem")} /></td>
                      <td className="px-3 py-3"><TextCell value={it.icms_situacao_tributaria} onChange={(v) => setDraftField(it.line_id, "icms_situacao_tributaria", v)} width="w-24" invalid={issues.includes("ICMS/CST")} /></td>
                      <td className="px-3 py-3"><TextCell value={it.pis_situacao_tributaria} onChange={(v) => setDraftField(it.line_id, "pis_situacao_tributaria", v)} width="w-20" invalid={issues.includes("PIS CST")} /></td>
                      <td className="px-3 py-3"><TextCell value={it.cofins_situacao_tributaria} onChange={(v) => setDraftField(it.line_id, "cofins_situacao_tributaria", v)} width="w-20" invalid={issues.includes("COFINS CST")} /></td>
                      {showAdvanced ? (
                        <>
                          <td className="px-3 py-3"><TextCell value={it.icms_percent} onChange={(v) => setDraftField(it.line_id, "icms_percent", v)} width="w-20" /></td>
                          <td className="px-3 py-3"><TextCell value={it.sit_trib} onChange={(v) => setDraftField(it.line_id, "sit_trib", v)} width="w-20" /></td>
                          <td className="px-3 py-3"><TextCell value={it.pis_percent} onChange={(v) => setDraftField(it.line_id, "pis_percent", v)} width="w-20" /></td>
                          <td className="px-3 py-3"><TextCell value={it.cofins_percent} onChange={(v) => setDraftField(it.line_id, "cofins_percent", v)} width="w-20" /></td>
                          <td className="px-3 py-3"><TextCell value={it.aliq_mun} onChange={(v) => setDraftField(it.line_id, "aliq_mun", v)} width="w-20" /></td>
                          <td className="px-3 py-3"><TextCell value={it.aliq_est} onChange={(v) => setDraftField(it.line_id, "aliq_est", v)} width="w-20" /></td>
                          <td className="px-3 py-3"><TextCell value={it.aliq_fed} onChange={(v) => setDraftField(it.line_id, "aliq_fed", v)} width="w-20" /></td>
                          <td className="px-3 py-3"><TextCell value={it.aliq_csosn} onChange={(v) => setDraftField(it.line_id, "aliq_csosn", v)} width="w-20" /></td>
                          <td className="px-3 py-3"><TextCell value={it.csosn} onChange={(v) => setDraftField(it.line_id, "csosn", v)} width="w-20" /></td>
                          <td className="px-3 py-3"><TextCell value={it.base_reduction_percent} onChange={(v) => setDraftField(it.line_id, "base_reduction_percent", v)} width="w-20" /></td>
                          <td className="px-3 py-3"><TextCell value={it.benefit_fiscal} onChange={(v) => setDraftField(it.line_id, "benefit_fiscal", v)} width="w-24" /></td>
                          <td className="px-3 py-3"><TextCell value={it.desoneration_percent} onChange={(v) => setDraftField(it.line_id, "desoneration_percent", v)} width="w-20" /></td>
                          <td className="px-3 py-3"><TextCell value={it.red_base_effective_percent} onChange={(v) => setDraftField(it.line_id, "red_base_effective_percent", v)} width="w-20" /></td>
                          <td className="px-3 py-3"><TextCell value={it.icms_effective_percent} onChange={(v) => setDraftField(it.line_id, "icms_effective_percent", v)} width="w-20" /></td>
                          <td className="px-3 py-3"><TextCell value={it.cst_rt} onChange={(v) => setDraftField(it.line_id, "cst_rt", v)} width="w-24" /></td>
                          <td className="px-3 py-3"><TextCell value={it.cod_class_trib_rt} onChange={(v) => setDraftField(it.line_id, "cod_class_trib_rt", v)} width="w-24" /></td>
                          <td className="px-3 py-3"><TextCell value={it.cbs_rt_percent} onChange={(v) => setDraftField(it.line_id, "cbs_rt_percent", v)} width="w-20" /></td>
                          <td className="px-3 py-3"><TextCell value={it.ibs_uf_rt_percent} onChange={(v) => setDraftField(it.line_id, "ibs_uf_rt_percent", v)} width="w-20" /></td>
                          <td className="px-3 py-3"><TextCell value={it.ibs_mun_rt_percent} onChange={(v) => setDraftField(it.line_id, "ibs_mun_rt_percent", v)} width="w-20" /></td>
                          <td className="px-3 py-3"><TextCell value={it.red_cbs_rt_percent} onChange={(v) => setDraftField(it.line_id, "red_cbs_rt_percent", v)} width="w-20" /></td>
                          <td className="px-3 py-3"><TextCell value={it.red_ibs_uf_rt_percent} onChange={(v) => setDraftField(it.line_id, "red_ibs_uf_rt_percent", v)} width="w-20" /></td>
                          <td className="px-3 py-3"><TextCell value={it.red_ibs_mun_rt_percent} onChange={(v) => setDraftField(it.line_id, "red_ibs_mun_rt_percent", v)} width="w-20" /></td>
                        </>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}