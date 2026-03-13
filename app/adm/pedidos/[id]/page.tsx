"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { PageHeader, Card, Button, Input, Select, Badge, Table } from "@/app/components/ui";

type OrderRow = {
  id: string;
  store_id: string | null;
  status: string;
  notes: string | null;

  created_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;

  logistic_status: "RECEBIDO" | "EM_SEPARACAO" | "ENTREGUE" | null;

  is_paid: boolean | null;
  paid_at: string | null;
  payment_method: "PIX" | "CARTAO" | "BOLETO" | null;

  delivery_mode: "RETIRADA" | "FRETE" | null;
  freight_fee: number | null;

  credit_applied: number | null;

  due_date: string | null;
  delivery_forecast: string | null;

  edited_by_admin: boolean | null;
  edited_at: string | null;
  original_items: any[] | null;
};

type StoreInfo = {
  id: string;
  name: string | null;
  legal_name?: string | null;
  cnpj?: string | null;
  ie?: string | null;
  ind_ie_dest?: string | null;
  email_nf?: string | null;
  phone_nf?: string | null;
  address_zip?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
};

type ProductEmbed = {
  sku: string | null;
  name: string | null;
  unit: string | null;
  ncm?: string | null;
  cest?: string | null;
  cfop?: string | null;
  cfop_default?: string | null;
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
  products: ProductEmbed | null;
};

type ItemEdit = {
  qty: string;
  removed: boolean;
};

type OriginalItem = {
  id: string;
  product_id: string;
  qty: number;
  unit: string | null;
  unit_cost: number | null;
  sku: string | null;
  name: string | null;
  product_unit: string | null;
};

type SplitItemState = {
  include: boolean;
  qty: string;
};

type NfeItemDraft = {
  product_id: string;
  sku: string;
  name: string;
  unit: string;
  qty: number;
  unit_cost: number;
  ncm: string;
  cest: string;
  cfop: string;
  ean: string;
  origin: string;
  icms_cst: string;
  pis_cst: string;
  cofins_cst: string;
};

type FocusNfeDocRow = {
  id: string;
  order_id: string;
  store_id?: string | null;
  status: string | null;
  reference: string | null;
  numero: string | null;
  serie: string | null;
  chave: string | null;
  protocolo: string | null;
  url_danfe: string | null;
  url_xml: string | null;
  error_message: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const STATUS_OPTIONS = ["draft", "submitted", "approved", "rejected"] as const;
const LOG_OPTIONS = ["RECEBIDO", "EM_SEPARACAO", "ENTREGUE"] as const;
const PAY_METHODS = ["PIX", "CARTAO", "BOLETO"] as const;
const DELIVERY_OPTIONS = ["RETIRADA", "FRETE"] as const;

function fmtBRL(v: number) {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDT(v: string | null | undefined) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("pt-BR");
  } catch {
    return v;
  }
}

function isoToDateInput(iso: string | null) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

function dateInputToISO(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  return dt.toISOString();
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function onlyDigits(v: string | null | undefined) {
  return (v ?? "").replace(/\D/g, "");
}

function fmtCNPJ(v: string | null | undefined) {
  const d = onlyDigits(v);
  if (d.length !== 14) return v ?? "-";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

type PackInfo = {
  perPack?: number;
  perPackKg?: number;
  packLabel: string;
  unitLabel: string;
};

function normTxt(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const PACK_RULES: Array<{ match: string; info: PackInfo }> = [
  { match: "bife picanha 120g", info: { perPack: 120, packLabel: "cx", unitLabel: "u" } },
  { match: "bife picanha120g", info: { perPack: 120, packLabel: "cx", unitLabel: "u" } },
  { match: "bife picanha 56g", info: { perPack: 216, packLabel: "cx", unitLabel: "u" } },
  { match: "bife vegetariano", info: { perPack: 20, packLabel: "pct", unitLabel: "u" } },
  { match: "copo milkshake", info: { perPack: 50, packLabel: "pct", unitLabel: "u" } },
  { match: "embalagem batata m", info: { perPack: 800, packLabel: "cx", unitLabel: "u" } },
  { match: "emba batata m", info: { perPack: 800, packLabel: "cx", unitLabel: "u" } },
  { match: "embalagem batata p", info: { perPack: 2250, packLabel: "cx", unitLabel: "u" } },
  { match: "emba batata p", info: { perPack: 2250, packLabel: "cx", unitLabel: "u" } },
  { match: "emba kraft", info: { perPack: 50, packLabel: "pct", unitLabel: "u" } },
  { match: "embalagem kraft", info: { perPack: 50, packLabel: "pct", unitLabel: "u" } },
  { match: "etiqueta de identificacao", info: { perPack: 1000, packLabel: "rolo", unitLabel: "u" } },
  { match: "etiqueta identificacao", info: { perPack: 1000, packLabel: "rolo", unitLabel: "u" } },
  { match: "etiqueta identific", info: { perPack: 1000, packLabel: "rolo", unitLabel: "u" } },
  { match: "molho american burger", info: { perPackKg: 3.5, packLabel: "balde", unitLabel: "kg" } },
  { match: "molho american", info: { perPackKg: 3.5, packLabel: "balde", unitLabel: "kg" } },
  { match: "molho barbecue", info: { perPackKg: 0.397, packLabel: "frasco", unitLabel: "kg" } },
  { match: "molho barbacue", info: { perPackKg: 0.397, packLabel: "frasco", unitLabel: "kg" } },
  { match: "barbecue whisky", info: { perPackKg: 0.397, packLabel: "frasco", unitLabel: "kg" } },
  { match: "barbacue whisky", info: { perPackKg: 0.397, packLabel: "frasco", unitLabel: "kg" } },
  { match: "barbecue wisky", info: { perPackKg: 0.397, packLabel: "frasco", unitLabel: "kg" } },
  { match: "barbacue wisky", info: { perPackKg: 0.397, packLabel: "frasco", unitLabel: "kg" } },
  { match: "pao hb", info: { perPack: 48, packLabel: "cx", unitLabel: "u" } },
  { match: "papel acoplado", info: { perPack: 1000, packLabel: "fardo", unitLabel: "u" } },
  { match: "sache baconese", info: { perPack: 60, packLabel: "cx", unitLabel: "u" } },
  { match: "sache maionese temperada", info: { perPack: 60, packLabel: "cx", unitLabel: "u" } },
];

function getPackInfo(productName: string | null | undefined): PackInfo | null {
  const n = normTxt(productName || "");
  if (!n) return null;
  const rule = PACK_RULES.find((r) => n.includes(r.match));
  return rule?.info ?? null;
}

function fmtNumBR(v: number) {
  const rounded = Math.round((v + Number.EPSILON) * 100) / 100;
  const isInt = Math.abs(rounded - Math.round(rounded)) < 1e-9;
  return isInt
    ? String(Math.round(rounded))
    : rounded.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function ceilPacks(qty: number, pack: PackInfo) {
  const q = Number(qty) || 0;
  if (pack.perPackKg && pack.perPackKg > 0) return Math.ceil(q / pack.perPackKg);
  if (pack.perPack && pack.perPack > 0) return Math.ceil(q / pack.perPack);
  return 0;
}

function packBaseText(pack: PackInfo) {
  if (pack.perPackKg && pack.perPackKg > 0) return `${fmtNumBR(pack.perPackKg)}${pack.unitLabel}/${pack.packLabel}`;
  if (pack.perPack && pack.perPack > 0) return `${fmtNumBR(pack.perPack)}${pack.unitLabel}/${pack.packLabel}`;
  return `-${pack.unitLabel}/${pack.packLabel}`;
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
  danger,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-11 items-center justify-center rounded-[18px] px-4 text-sm font-semibold transition",
        danger
          ? "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
          : "border border-slate-200 bg-white text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] hover:bg-slate-50",
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

function SummaryBox({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900">{value}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

function toneForNfeStatus(status: string | null | undefined) {
  const s = String(status || "").toLowerCase();

  if (["autorizado", "emitido", "processado", "aprovado"].includes(s)) return "green";
  if (["erro", "rejeitado", "cancelado", "denegado"].includes(s)) return "red";
  if (["processando", "pendente", "enviado"].includes(s)) return "yellow";
  return "neutral";
}

export default function AdmPedidoDetalhePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const orderId = params?.id;

  const editMode = searchParams.get("edit") === "1";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);

  const [printMode, setPrintMode] = useState(false);

  const [originalItems, setOriginalItems] = useState<OriginalItem[] | null>(null);
  const [itemEdits, setItemEdits] = useState<Record<string, ItemEdit>>({});

  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState<string>("");
  const [creditNote, setCreditNote] = useState<string>("");

  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [splitItems, setSplitItems] = useState<Record<string, SplitItemState>>({});
  const [splitNotes, setSplitNotes] = useState<string>("");
  const [splitCreating, setSplitCreating] = useState(false);

  const [nfeModalOpen, setNfeModalOpen] = useState(false);
  const [nfeItems, setNfeItems] = useState<Record<string, NfeItemDraft>>({});
  const [nfeNatureza, setNfeNatureza] = useState<string>("VENDA");
  const [nfeSerie, setNfeSerie] = useState<string>("1");
  const [nfeNumero, setNfeNumero] = useState<string>("");
  const [nfeCopyMsg, setNfeCopyMsg] = useState<string>("");

  const [focusDoc, setFocusDoc] = useState<FocusNfeDocRow | null>(null);
  const [focusLoading, setFocusLoading] = useState(false);
  const [focusEmitting, setFocusEmitting] = useState(false);
  const [focusRefreshing, setFocusRefreshing] = useState(false);

  const lockedByLogistics = useMemo(() => {
    return (order?.logistic_status ?? null) === "ENTREGUE";
  }, [order?.logistic_status]);

  const totalItens = useMemo(() => {
    return items.reduce((acc, it) => {
      const edit = itemEdits[it.id];
      const removed = editMode ? (edit?.removed ?? false) : false;
      if (removed) return acc;

      const qtyStr = editMode ? (edit?.qty ?? String(it.qty ?? 0)) : String(it.qty ?? 0);
      const qty = Number(qtyStr.replace(",", ".")) || 0;
      const unitCost = Number(it.unit_cost ?? 0);
      return acc + qty * unitCost;
    }, 0);
  }, [items, itemEdits, editMode]);

  const frete = useMemo(() => {
    if (!order) return 0;
    if (order.delivery_mode !== "FRETE") return 0;
    return Number(order.freight_fee ?? 0);
  }, [order]);

  const totalComFrete = useMemo(() => totalItens + frete, [totalItens, frete]);
  const creditApplied = useMemo(() => Number(order?.credit_applied ?? 0), [order?.credit_applied]);

  const totalLiquido = useMemo(() => {
    return Math.max(totalComFrete - creditApplied, 0);
  }, [totalComFrete, creditApplied]);

  const overdue = useMemo(() => {
    if (!order?.due_date) return false;
    return order.due_date < todayYMD();
  }, [order?.due_date]);

  const forecastOverdue = useMemo(() => {
    if (!order?.delivery_forecast) return false;
    if ((order?.logistic_status ?? null) === "ENTREGUE") return false;
    return order.delivery_forecast < todayYMD();
  }, [order?.delivery_forecast, order?.logistic_status]);

  useEffect(() => {
    (async () => {
      setMsg("");
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        router.push("/login");
        return;
      }

      if (!orderId) {
        setMsg("Pedido inválido.");
        setLoading(false);
        return;
      }

      await loadAll(orderId);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    if (!editMode) return;

    const draft: Record<string, ItemEdit> = {};
    for (const it of items) {
      draft[it.id] = { qty: String(it.qty ?? 0), removed: false };
    }
    setItemEdits(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, order?.id]);

  useEffect(() => {
    const onAfterPrint = () => setPrintMode(false);
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);

  async function loadFocusDoc(currentOrderId: string) {
    setFocusLoading(true);
    try {
      const { data, error } = await supabase
        .from("focus_nfe_documents")
        .select("*")
        .eq("order_id", currentOrderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn("loadFocusDoc:", error.message);
        setFocusDoc(null);
        return;
      }

      setFocusDoc((data ?? null) as FocusNfeDocRow | null);
    } finally {
      setFocusLoading(false);
    }
  }

  async function loadCreditBalance(storeId: string) {
    const { data, error } = await supabase
      .from("v_store_credit_balance")
      .select("balance")
      .eq("store_id", storeId)
      .maybeSingle();

    if (error) {
      console.warn("loadCreditBalance error:", error.message);
      setCreditBalance(0);
      return;
    }

    setCreditBalance(Number((data as any)?.balance ?? 0));
  }

  async function loadStoreInfo(storeId: string) {
    const { data, error } = await supabase
      .from("stores")
      .select(
        "id,name,legal_name,cnpj,ie,ind_ie_dest,email_nf,phone_nf,address_zip,address_street,address_number,address_complement,address_neighborhood,city,state"
      )
      .eq("id", storeId)
      .maybeSingle();

    if (error) {
      console.warn("loadStoreInfo error:", error.message);
      setStoreInfo(null);
      return;
    }

    setStoreInfo((data ?? null) as any);
  }

  async function loadAll(id: string) {
    const { data: o, error: oErr } = await supabase
      .from("orders")
      .select(
        "id,store_id,status,notes,created_at,submitted_at,approved_at,logistic_status,is_paid,paid_at,payment_method,delivery_mode,freight_fee,credit_applied,due_date,delivery_forecast,edited_by_admin,edited_at,original_items"
      )
      .eq("id", id)
      .maybeSingle();

    if (oErr || !o) {
      setMsg(oErr?.message || "Pedido não encontrado.");
      setOrder(null);
      setItems([]);
      setCreditBalance(0);
      setOriginalItems(null);
      setStoreInfo(null);
      setFocusDoc(null);
      return;
    }

    const ord = o as OrderRow;
    setOrder(ord);

    const snap = (ord.original_items ?? null) as OriginalItem[] | null;
    setOriginalItems(snap);

    if (ord.store_id) {
      await Promise.all([
        loadCreditBalance(ord.store_id),
        loadStoreInfo(ord.store_id),
        loadFocusDoc(ord.id),
      ]);
    } else {
      setCreditBalance(0);
      setStoreInfo(null);
      await loadFocusDoc(ord.id);
    }

    const { data: it, error: itErr } = await supabase
      .from("order_items")
      .select(
        "id,qty,unit,unit_cost,product_id, products:products (sku,name,unit,ncm,cest,cfop,cfop_default,ean,origin,icms_cst,pis_cst,cofins_cst)"
      )
      .eq("order_id", id);

    if (itErr) {
      setMsg(itErr.message);
      setItems([]);
      return;
    }

    const normalized: ItemRow[] = (it ?? []).map((row: any) => {
      const raw = row?.products;
      const prod: ProductEmbed | null = Array.isArray(raw) ? (raw[0] ?? null) : (raw ?? null);

      return {
        id: row.id,
        qty: row.qty,
        unit: row.unit ?? null,
        unit_cost: row.unit_cost ?? null,
        product_id: row.product_id,
        products: prod,
      };
    });

    setItems(normalized);
  }

  async function updateOrder(patch: Partial<OrderRow>) {
    if (!order) return;
    setSaving(true);
    setMsg("");

    const { data, error } = await supabase
      .from("orders")
      .update(patch)
      .eq("id", order.id)
      .select(
        "id,store_id,status,notes,created_at,submitted_at,approved_at,logistic_status,is_paid,paid_at,payment_method,delivery_mode,freight_fee,credit_applied,due_date,delivery_forecast,edited_by_admin,edited_at,original_items"
      )
      .single();

    if (error) {
      setMsg(error.message);
      setSaving(false);
      return;
    }

    const ord = data as OrderRow;
    setOrder(ord);
    setOriginalItems((ord.original_items ?? null) as any);

    if (ord.store_id) await loadCreditBalance(ord.store_id);

    setSaving(false);
  }

  async function onTogglePaid() {
    if (!order) return;
    const paid = !!order.is_paid;

    if (paid) {
      await updateOrder({ is_paid: false, paid_at: null });
    } else {
      await updateOrder({
        is_paid: true,
        paid_at: new Date().toISOString(),
        payment_method: order.payment_method ?? "PIX",
      });
    }
  }

  function openCreditModal() {
    setCreditAmount("");
    setCreditNote("");
    setCreditModalOpen(true);
    setMsg("");
  }

  function closeCreditModal() {
    setCreditModalOpen(false);
  }

  async function applyCredit() {
    if (!order?.id || !order.store_id) return;

    setSaving(true);
    setMsg("");

    let amt: number | null = null;
    if (creditAmount.trim() !== "") {
      const parsed = Number(creditAmount.replace(",", "."));
      if (Number.isNaN(parsed) || parsed <= 0) {
        setSaving(false);
        setMsg("Valor inválido. Use número maior que zero (ex.: 200 ou 200.00).");
        return;
      }
      amt = parsed;
    }

    const { data, error } = await supabase.rpc("apply_store_credit_to_order", {
      p_order_id: order.id,
      p_amount: amt,
      p_note: creditNote.trim() || null,
    });

    if (error) {
      setSaving(false);
      setMsg(`Erro ao aplicar crédito: ${error.message}`);
      return;
    }

    const applied = Number(data ?? 0);

    closeCreditModal();
    await loadAll(order.id);

    setSaving(false);
    setMsg(applied > 0 ? `Crédito abatido: ${fmtBRL(applied)}.` : "Nenhum crédito abatido (sem saldo ou pedido já quitado).");
  }

  async function deleteThisOrder() {
    if (!order) return;
    const ok = window.confirm("Tem certeza que deseja excluir este pedido? Isso remove do Admin e do Franqueado.");
    if (!ok) return;

    setSaving(true);
    setMsg("");

    const delItems = await supabase.from("order_items").delete().eq("order_id", order.id);
    if (delItems.error) {
      setSaving(false);
      setMsg(`Erro ao excluir itens: ${delItems.error.message}`);
      return;
    }

    const delOrder = await supabase.from("orders").delete().eq("id", order.id);
    if (delOrder.error) {
      setSaving(false);
      setMsg(`Erro ao excluir pedido: ${delOrder.error.message}`);
      return;
    }

    setSaving(false);
    router.push("/adm/pedidos");
  }

  function statusBadgeTone(s: string) {
    if (s === "approved") return "green";
    if (s === "rejected") return "red";
    if (s === "submitted") return "blue";
    return "neutral";
  }

  function setItemQty(id: string, v: string) {
    setItemEdits((prev) => ({
      ...prev,
      [id]: { qty: v, removed: prev[id]?.removed ?? false },
    }));
  }

  function toggleRemoveItem(id: string) {
    setItemEdits((prev) => ({
      ...prev,
      [id]: { qty: prev[id]?.qty ?? "0", removed: !(prev[id]?.removed ?? false) },
    }));
  }

  function cancelEdits() {
    router.push(`/adm/pedidos/${order?.id ?? ""}`);
  }

  async function saveEdits() {
    if (!order) return;
    if (lockedByLogistics) {
      setMsg("Pedido já ENTREGUE. Edição de itens bloqueada.");
      return;
    }

    setSaving(true);
    setMsg("");

    try {
      const payload = items.map((it) => {
        const e = itemEdits[it.id];
        const removed = e?.removed ?? false;

        const qtyNum = Number((e?.qty ?? String(it.qty ?? 0)).replace(",", "."));
        if (!removed && (Number.isNaN(qtyNum) || qtyNum < 0)) {
          throw new Error("Quantidade inválida em um ou mais itens.");
        }

        return { id: it.id, qty: removed ? 0 : qtyNum, removed };
      });

      const { error } = await supabase.rpc("admin_edit_order_items", {
        p_order_id: order.id,
        p_items: payload,
      });

      if (error) {
        setSaving(false);
        setMsg(`Erro ao salvar edição: ${error.message}`);
        return;
      }

      await loadAll(order.id);
      setSaving(false);
      router.push(`/adm/pedidos/${order.id}`);
    } catch (e: any) {
      setSaving(false);
      setMsg(e?.message || "Erro ao salvar edição.");
    }
  }

  function handlePrint() {
    setPrintMode(true);
    setTimeout(() => window.print(), 50);
  }

  function openSplitModal() {
    if (!order) return;
    if (lockedByLogistics) {
      setMsg("Pedido já ENTREGUE. Não é possível gerar remessa parcial.");
      return;
    }

    const draft: Record<string, SplitItemState> = {};
    for (const it of items) {
      draft[it.id] = { include: true, qty: String(Number(it.qty ?? 0)) };
    }
    setSplitItems(draft);
    setSplitNotes("");
    setSplitModalOpen(true);
    setMsg("");
  }

  function closeSplitModal() {
    if (splitCreating) return;
    setSplitModalOpen(false);
  }

  function setSplitInclude(itemId: string, include: boolean) {
    setSplitItems((prev) => ({
      ...prev,
      [itemId]: { include, qty: prev[itemId]?.qty ?? "0" },
    }));
  }

  function setSplitQty(itemId: string, qty: string) {
    setSplitItems((prev) => ({
      ...prev,
      [itemId]: { include: prev[itemId]?.include ?? true, qty },
    }));
  }

  async function createPartialShipment() {
    if (!order?.id) return;

    if (lockedByLogistics) {
      setMsg("Pedido já ENTREGUE. Não é possível gerar remessa parcial.");
      return;
    }

    setSplitCreating(true);
    setMsg("");

    try {
      const payload = items
        .map((it) => {
          const st = splitItems[it.id];
          const include = st?.include ?? false;
          const qtyNum = Number((st?.qty ?? "0").replace(",", "."));

          if (!include) return null;
          if (Number.isNaN(qtyNum) || qtyNum <= 0) return null;

          const max = Number(it.qty ?? 0);
          const finalQty = Math.min(qtyNum, max);

          return {
            order_item_id: it.id,
            product_id: it.product_id,
            qty: finalQty,
          };
        })
        .filter(Boolean);

      if (payload.length === 0) {
        setSplitCreating(false);
        setMsg("Selecione ao menos 1 item com quantidade maior que zero.");
        return;
      }

      const { data, error } = await supabase.rpc("create_partial_shipment_order", {
        p_parent_order_id: order.id,
        p_items: payload,
        p_notes: (splitNotes || "").trim() || null,
      });

      if (error) {
        setSplitCreating(false);
        setMsg(`Erro ao gerar remessa parcial: ${error.message}`);
        return;
      }

      const newOrderId = String(data ?? "");
      setSplitCreating(false);
      setSplitModalOpen(false);

      if (newOrderId) {
        router.push(`/adm/pedidos/${newOrderId}`);
        return;
      }

      await loadAll(order.id);
      setMsg("Remessa parcial gerada.");
    } catch (e: any) {
      setSplitCreating(false);
      setMsg(e?.message || "Erro ao gerar remessa parcial.");
    }
  }

  function openNfeModal() {
    if (!order) return;

    setNfeCopyMsg("");

    const draft: Record<string, NfeItemDraft> = {};
    for (const it of items) {
      const sku = it.products?.sku ?? "";
      const name = it.products?.name ?? "";
      const unit = (it.products?.unit ?? it.unit ?? "un") as string;
      const qty = Number(it.qty ?? 0) || 0;
      const unit_cost = Number(it.unit_cost ?? 0) || 0;

      draft[it.id] = {
        product_id: it.product_id,
        sku,
        name,
        unit,
        qty,
        unit_cost,
        ncm: it.products?.ncm ?? "",
        cest: it.products?.cest ?? "",
        cfop: it.products?.cfop ?? it.products?.cfop_default ?? "",
        ean: it.products?.ean ?? "",
        origin: it.products?.origin ?? "",
        icms_cst: it.products?.icms_cst ?? "",
        pis_cst: it.products?.pis_cst ?? "",
        cofins_cst: it.products?.cofins_cst ?? "",
      };
    }

    setNfeItems(draft);
    setNfeNatureza("VENDA");
    setNfeSerie("1");
    setNfeNumero("");
    setNfeModalOpen(true);
  }

  function closeNfeModal() {
    setNfeModalOpen(false);
  }

  function setNfeItemField(itemId: string, field: keyof NfeItemDraft, value: string) {
    setNfeItems((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] ?? ({} as any)),
        [field]: value,
      },
    }));
  }

  const nfeDraftPayload = useMemo(() => {
    if (!order || !storeInfo) return null;

    const itemsList = Object.values(nfeItems).map((it) => {
      const qty = Number(it.qty || 0);
      const unit_cost = Number(it.unit_cost || 0);

      return {
        codigo: it.sku || it.product_id,
        descricao: it.name,
        ncm: (it.ncm || "").trim() || null,
        cest: (it.cest || "").trim() || null,
        cfop: (it.cfop || "").trim() || null,
        unidade: it.unit || "UN",
        quantidade: qty,
        valor_unitario: unit_cost,
        valor_total: qty * unit_cost,
        gtin: (it.ean || "").trim() || null,
        origem: (it.origin || "").trim() || null,
        icms_situacao_tributaria: (it.icms_cst || "").trim() || null,
        pis_situacao_tributaria: (it.pis_cst || "").trim() || null,
        cofins_situacao_tributaria: (it.cofins_cst || "").trim() || null,
      };
    });

    return {
      orderId: order.id,
      storeId: order.store_id,
      natureza_operacao: (nfeNatureza || "").trim() || "VENDA",
      serie: (nfeSerie || "").trim() || "1",
      numero: (nfeNumero || "").trim() || null,
      data_emissao: new Date().toISOString(),
      destinatario: {
        nome: storeInfo.legal_name || storeInfo.name || "",
        nome_fantasia: storeInfo.name || "",
        cpf_cnpj: onlyDigits(storeInfo.cnpj || ""),
        indicador_inscricao_estadual: storeInfo.ind_ie_dest || "9",
        inscricao_estadual: storeInfo.ie || null,
        email: storeInfo.email_nf || null,
        telefone: storeInfo.phone_nf || null,
        endereco: {
          logradouro: storeInfo.address_street || "",
          numero: storeInfo.address_number || "",
          complemento: storeInfo.address_complement || "",
          bairro: storeInfo.address_neighborhood || "",
          cep: onlyDigits(storeInfo.address_zip || ""),
          municipio: storeInfo.city || "",
          uf: storeInfo.state || "",
        },
      },
      transporte: {
        modalidade_frete: "9",
        valor_frete: Number(order.freight_fee ?? 0) || 0,
      },
      itens: itemsList,
      observacoes: order.notes || null,
    };
  }, [order, storeInfo, nfeItems, nfeNatureza, nfeSerie, nfeNumero]);

  async function copyNfeJson() {
    if (!nfeDraftPayload) return;
    try {
      const txt = JSON.stringify(nfeDraftPayload, null, 2);
      await navigator.clipboard.writeText(txt);
      setNfeCopyMsg("JSON copiado.");
      setTimeout(() => setNfeCopyMsg(""), 1500);
    } catch {
      setNfeCopyMsg("Não consegui copiar automaticamente. Selecione e copie manualmente.");
    }
  }

  async function emitFocusNfe() {
  if (!order || !storeInfo || !order.store_id) {
    setMsg("Pedido sem store_id. Não é possível emitir.");
    return;
  }

  setFocusEmitting(true);
  setMsg("");

  try {
    const reference = `PED-${order.id}`;

    const payload = {
      orderId: order.id,
      storeId: order.store_id,
      emitterId: (order as any).emitter_id || null,
      reference,
      natureza_operacao: (nfeNatureza || "VENDA").trim(),
      serie: (nfeSerie || "1").trim(),
      numero: (nfeNumero || "").trim() || null,
      destinatario: {
        nome: storeInfo.legal_name || storeInfo.name || "",
        nome_fantasia: storeInfo.name || "",
        cpf_cnpj: onlyDigits(storeInfo.cnpj || ""),
        indicador_inscricao_estadual: storeInfo.ind_ie_dest || "9",
        inscricao_estadual: storeInfo.ie || null,
        email: storeInfo.email_nf || null,
        telefone: storeInfo.phone_nf || null,
        endereco: {
          logradouro: storeInfo.address_street || "",
          numero: storeInfo.address_number || "",
          complemento: storeInfo.address_complement || "",
          bairro: storeInfo.address_neighborhood || "",
          cep: onlyDigits(storeInfo.address_zip || ""),
          municipio: storeInfo.city || "",
          uf: storeInfo.state || "",
        },
      },
      transporte: {
        modalidade_frete: "9",
        valor_frete: Number(order.freight_fee ?? 0) || 0,
      },
      itens: Object.values(nfeItems).length
        ? Object.values(nfeItems).map((it) => ({
            codigo: it.sku || it.product_id,
            descricao: it.name,
            ncm: (it.ncm || "").trim() || null,
            cest: (it.cest || "").trim() || null,
            cfop: (it.cfop || "").trim() || null,
            unidade: it.unit || "UN",
            quantidade: Number(it.qty || 0),
            valor_unitario: Number(it.unit_cost || 0),
            valor_total: Number(it.qty || 0) * Number(it.unit_cost || 0),
            gtin: (it.ean || "").trim() || null,
            origem: (it.origin || "").trim() || null,
            icms_situacao_tributaria: (it.icms_cst || "").trim() || null,
            pis_situacao_tributaria: (it.pis_cst || "").trim() || null,
            cofins_situacao_tributaria: (it.cofins_cst || "").trim() || null,
          }))
        : items.map((it) => ({
            codigo: it.products?.sku || it.product_id,
            descricao: it.products?.name || "",
            ncm: (it.products?.ncm || "").trim() || null,
            cest: (it.products?.cest || "").trim() || null,
            cfop: (it.products?.cfop || it.products?.cfop_default || "").trim() || null,
            unidade: it.products?.unit || it.unit || "UN",
            quantidade: Number(it.qty || 0),
            valor_unitario: Number(it.unit_cost || 0),
            valor_total: Number(it.qty || 0) * Number(it.unit_cost || 0),
            gtin: (it.products?.ean || "").trim() || null,
            origem: (it.products?.origin || "").trim() || null,
            icms_situacao_tributaria: (it.products?.icms_cst || "").trim() || null,
            pis_situacao_tributaria: (it.products?.pis_cst || "").trim() || null,
            cofins_situacao_tributaria: (it.products?.cofins_cst || "").trim() || null,
          })),
      observacoes: order.notes || null,
    };

    const res = await fetch("/api/focus/nfe/emitir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data?.ok) {
      const validationErrors = Array.isArray(data?.validation_errors)
        ? data.validation_errors.join(" | ")
        : "";

      const focusDetails =
        typeof data?.focus_details === "string"
          ? data.focus_details
          : data?.focus_details
          ? JSON.stringify(data.focus_details)
          : "";

      const debugError =
        typeof data?.error === "string"
          ? data.error
          : "Erro ao emitir NF-e.";

      setMsg([debugError, validationErrors, focusDetails].filter(Boolean).join(" | "));
      return;
    }

    await loadFocusDoc(order.id);
    setMsg("NF-e enviada para a Focus.");
  } catch (e: any) {
    setMsg(e?.message || "Erro ao emitir NF-e.");
  } finally {
    setFocusEmitting(false);
  }
}

  async function refreshFocusStatus() {
    if (!order || !focusDoc?.reference) return;

    setFocusRefreshing(true);
    setMsg("");

    try {
      const res = await fetch("/api/focus/nfe/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId: order.id,
          reference: focusDoc.reference,
        }),
      });

      const data = await res.json().catch(() => ({}));

      console.log("RESPOSTA STATUS NF-E:", data);

      if (!res.ok || !data?.ok) {
        setMsg(data?.error || "Erro ao consultar status da NF-e.");
        return;
      }

      await loadFocusDoc(order.id);
      setMsg("Status da NF-e atualizado.");
    } catch (e: any) {
      console.error("ERRO FRONT STATUS NF-E:", e);
      setMsg(e?.message || "Erro ao consultar status da NF-e.");
    } finally {
      setFocusRefreshing(false);
    }
  }

  if (loading) return <Card>Carregando...</Card>;

  if (!order) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Pedido"
          subtitle="Não foi possível carregar"
          right={<SecondaryActionButton onClick={() => router.push("/adm/pedidos")}>Voltar</SecondaryActionButton>}
        />
        <Card>
          <div className="text-sm text-red-600">{msg || "Pedido não encontrado."}</div>
        </Card>
      </div>
    );
  }

  const edited = !!order.edited_by_admin;

  const itemsRows = items.map((it) => {
    const sku = it.products?.sku ?? "-";
    const name = it.products?.name ?? "-";
    const unit = it.products?.unit ?? it.unit ?? "-";
    const unitCost = Number(it.unit_cost ?? 0);

    const edit = itemEdits[it.id];
    const removed = editMode ? (edit?.removed ?? false) : false;
    const qtyStr = editMode ? (edit?.qty ?? String(it.qty ?? 0)) : String(it.qty ?? 0);
    const qtyNum = Number(qtyStr.replace(",", ".")) || 0;

    const line = removed ? 0 : qtyNum * unitCost;

    const pack = getPackInfo(name);
    const packsQty = pack ? ceilPacks(qtyNum, pack) : null;

    const packCell = !pack ? (
      <span className="text-slate-500">-</span>
    ) : (
      <div className="leading-tight">
        <div className="font-semibold text-slate-800">{packBaseText(pack)}</div>
        <div className="text-xs text-slate-500">
          {pack.packLabel.toUpperCase()}: {fmtNumBR(packsQty ?? 0)}
        </div>
      </div>
    );

    if (!editMode) {
      return [
        <span key="sku" className="font-mono text-xs">{sku}</span>,
        <span key="name" className="text-slate-900">{name}</span>,
        <span key="unit" className="text-slate-700">{unit}</span>,
        <span key="price" className="font-semibold">{fmtBRL(unitCost)}</span>,
        <span key="qty" className="font-semibold">{it.qty}</span>,
        <div key="pack">{packCell}</div>,
        <span key="total" className="font-semibold">{fmtBRL(line)}</span>,
      ];
    }

    return [
      <span key="sku" className="font-mono text-xs">{sku}</span>,
      <span key="name" className="text-slate-900">
        <div className="flex items-center gap-2">
          <span>{name}</span>
          {removed ? <Badge tone="red">Removido</Badge> : null}
        </div>
      </span>,
      <span key="unit" className="text-slate-700">{unit}</span>,
      <span key="price" className="font-semibold">{fmtBRL(unitCost)}</span>,
      <div key="qty" className="flex items-center gap-2">
        <input
          className="w-24 rounded-[14px] border border-slate-200 bg-white px-2 py-2 text-sm outline-none focus:border-slate-300 disabled:bg-slate-50"
          type="number"
          value={qtyStr}
          disabled={saving || lockedByLogistics || removed}
          onChange={(e) => setItemQty(it.id, e.target.value)}
          min={0}
          step={1}
        />
        <SecondaryActionButton
          danger={!removed}
          disabled={saving || lockedByLogistics}
          onClick={() => toggleRemoveItem(it.id)}
        >
          {removed ? "Desfazer" : "Remover"}
        </SecondaryActionButton>
      </div>,
      <div key="pack">{packCell}</div>,
      <span key="total" className="font-semibold">{fmtBRL(line)}</span>,
    ];
  });

  const originalRows =
    originalItems?.map((it) => {
      const unitCost = Number(it.unit_cost ?? 0);
      const line = Number(it.qty ?? 0) * unitCost;

      const name = it.name ?? "-";
      const pack = getPackInfo(name);
      const qtyNum = Number(it.qty ?? 0);
      const packsQty = pack ? ceilPacks(qtyNum, pack) : null;

      const packCell = !pack ? (
        <span className="text-slate-500">-</span>
      ) : (
        <div className="leading-tight">
          <div className="font-semibold text-slate-800">{packBaseText(pack)}</div>
          <div className="text-xs text-slate-500">
            {pack.packLabel.toUpperCase()}: {fmtNumBR(packsQty ?? 0)}
          </div>
        </div>
      );

      return [
        <span key="sku" className="font-mono text-xs">{it.sku ?? "-"}</span>,
        <span key="name" className="text-slate-900">{it.name ?? "-"}</span>,
        <span key="unit" className="text-slate-700">{it.product_unit ?? it.unit ?? "-"}</span>,
        <span key="price" className="font-semibold">{fmtBRL(unitCost)}</span>,
        <span key="qty" className="font-semibold">{it.qty}</span>,
        <div key="pack">{packCell}</div>,
        <span key="total" className="font-semibold">{fmtBRL(line)}</span>,
      ];
    }) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Detalhe do pedido"
        subtitle={`ID: ${order.id}`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            {edited ? (
              <Badge tone="blue">EDITADO {order.edited_at ? `• ${fmtDT(order.edited_at)}` : ""}</Badge>
            ) : (
              <Badge tone="neutral">ORIGINAL</Badge>
            )}

            <SecondaryActionButton onClick={() => router.push("/adm/pedidos")}>
              Voltar
            </SecondaryActionButton>
            <SecondaryActionButton onClick={() => loadAll(order.id)} disabled={saving}>
              Recarregar
            </SecondaryActionButton>
            <SecondaryActionButton onClick={handlePrint}>
              Imprimir
            </SecondaryActionButton>
            <SecondaryActionButton onClick={openNfeModal} disabled={saving || loading}>
              Preparar NF-e
            </SecondaryActionButton>
            <SecondaryActionButton onClick={openSplitModal} disabled={saving || editMode || lockedByLogistics}>
              Gerar pedido parcial
            </SecondaryActionButton>

            {!editMode ? (
              <PrimaryActionButton onClick={() => router.push(`/adm/pedidos/${order.id}?edit=1`)} disabled={saving || lockedByLogistics}>
                Editar itens
              </PrimaryActionButton>
            ) : (
              <>
                <SecondaryActionButton onClick={cancelEdits} disabled={saving}>
                  Cancelar
                </SecondaryActionButton>
                <PrimaryActionButton onClick={saveEdits} disabled={saving || lockedByLogistics}>
                  {saving ? "Salvando..." : "Salvar alterações"}
                </PrimaryActionButton>
              </>
            )}

            <SecondaryActionButton danger onClick={deleteThisOrder} disabled={saving}>
              Excluir
            </SecondaryActionButton>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm text-red-600 whitespace-pre-wrap">{msg}</div>
        </Card>
      ) : null}

      <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-5 shadow-sm md:p-6">
        <SectionTitle
          title="Resumo do pedido"
          subtitle="Visão rápida para operação, financeiro e expedição"
          right={<Badge tone={statusBadgeTone(order.status) as any}>{order.status}</Badge>}
        />

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <SummaryBox title="Itens" value={fmtBRL(totalItens)} />
          <SummaryBox title="Frete" value={fmtBRL(frete)} />
          <SummaryBox title="Crédito abatido" value={`- ${fmtBRL(creditApplied)}`} />
          <SummaryBox title="Total líquido" value={fmtBRL(totalLiquido)} />
          <SummaryBox title="Saldo da loja" value={fmtBRL(creditBalance)} subtitle="Disponível para abatimento" />
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <SectionTitle
          title="NF-e / Focus"
          subtitle="Emissão fiscal vinculada a este pedido"
          right={
            <div className="flex flex-wrap items-center gap-2">
              {focusDoc ? (
                <Badge tone={toneForNfeStatus(focusDoc.status) as any}>
                  {focusDoc.status || "Sem status"}
                </Badge>
              ) : (
                <Badge tone="neutral">Sem NF-e</Badge>
              )}

              <SecondaryActionButton onClick={refreshFocusStatus} disabled={!focusDoc?.reference || focusRefreshing}>
                {focusRefreshing ? "Consultando..." : "Consultar status"}
              </SecondaryActionButton>

              <PrimaryActionButton onClick={emitFocusNfe} disabled={focusEmitting || !storeInfo || items.length === 0}>
                {focusEmitting ? "Emitindo..." : "Emitir NF-e"}
              </PrimaryActionButton>
            </div>
          }
        />

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
            <div className="space-y-3">
              <InfoPair label="Status" value={focusDoc?.status || "-"} />
              <InfoPair label="Referência" value={focusDoc?.reference || `PED-${order.id}`} />
              <InfoPair label="Número" value={focusDoc?.numero || "-"} />
              <InfoPair label="Série" value={focusDoc?.serie || nfeSerie || "-"} />
              <InfoPair label="Chave" value={focusDoc?.chave || "-"} />
              <InfoPair label="Protocolo" value={focusDoc?.protocolo || "-"} />
              <InfoPair label="Criado em" value={fmtDT(focusDoc?.created_at)} />
              <InfoPair label="Atualizado em" value={fmtDT(focusDoc?.updated_at)} />
            </div>
          </div>

          <div className="rounded-[22px] border border-slate-200 bg-white p-4">
            <div className="space-y-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Links do documento</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {focusDoc?.url_danfe ? (
                    <a
                      href={focusDoc.url_danfe}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] hover:bg-slate-50"
                    >
                      Abrir DANFE
                    </a>
                  ) : (
                    <Badge tone="neutral">DANFE indisponível</Badge>
                  )}

                  {focusDoc?.url_xml ? (
                    <a
                      href={focusDoc.url_xml}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] hover:bg-slate-50"
                    >
                      Abrir XML
                    </a>
                  ) : (
                    <Badge tone="neutral">XML indisponível</Badge>
                  )}
                </div>
              </div>

              <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Erro / retorno Focus</div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  {focusDoc?.error_message || "Sem mensagem de erro."}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <SectionTitle title="Status e operação" subtitle="Controle rápido do fluxo do pedido" />

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Select
              label="Status"
              value={order.status}
              onChange={(v) => updateOrder({ status: v })}
              options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
            />

            <Select
              label="Logística"
              value={(order.logistic_status ?? "RECEBIDO") as any}
              onChange={(v) => updateOrder({ logistic_status: v as any })}
              options={LOG_OPTIONS.map((s) => ({ value: s, label: s }))}
            />

            <Select
              label="Entrega"
              value={(order.delivery_mode ?? "RETIRADA") as any}
              onChange={(v) => updateOrder({ delivery_mode: v as any })}
              options={DELIVERY_OPTIONS.map((s) => ({ value: s, label: s }))}
            />

            <Input
              label="Frete (R$)"
              value={String(Number(order.freight_fee ?? 0))}
              onChange={(v) => updateOrder({ freight_fee: Number(v) })}
              type="number"
            />

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pagamento</div>
              <PrimaryActionButton onClick={onTogglePaid} disabled={saving} fullWidth>
                {order.is_paid ? "Pago" : "Marcar como pago"}
              </PrimaryActionButton>
              <div className="text-xs text-slate-500">{order.paid_at ? `Pago em: ${fmtDT(order.paid_at)}` : "Não pago"}</div>
            </div>

            <div className="grid gap-2">
              <Input
                label="Data pagamento"
                type="date"
                value={isoToDateInput(order.paid_at)}
                onChange={(v) =>
                  updateOrder({
                    paid_at: v ? dateInputToISO(v) : null,
                    is_paid: v ? true : false,
                  })
                }
              />

              <Select
                label="Forma"
                value={order.payment_method ?? "PIX"}
                onChange={(v) => updateOrder({ payment_method: v as any })}
                options={PAY_METHODS.map((m) => ({ value: m, label: m }))}
              />
            </div>
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <SectionTitle
            title="Prazos e crédito"
            subtitle="Vencimento, previsão de entrega e crédito da loja"
            right={
              <div className="flex flex-wrap items-center gap-2">
                {order.due_date ? (
                  overdue ? <Badge tone="red">Vencido</Badge> : <Badge tone="green">OK</Badge>
                ) : (
                  <Badge tone="neutral">Sem vencimento</Badge>
                )}

                {!order.delivery_forecast ? (
                  <Badge tone="neutral">Sem previsão</Badge>
                ) : forecastOverdue ? (
                  <Badge tone="red">Entrega atrasada</Badge>
                ) : (
                  <Badge tone="green">Previsão OK</Badge>
                )}
              </div>
            }
          />

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Data de vencimento
              </label>
              <input
                className="h-11 w-full rounded-[18px] border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-300 disabled:bg-slate-50"
                type="date"
                value={order.due_date ?? ""}
                disabled={saving}
                onChange={(e) => updateOrder({ due_date: e.target.value || null })}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Previsão de entrega
              </label>
              <input
                className="h-11 w-full rounded-[18px] border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-300 disabled:bg-slate-50"
                type="date"
                value={order.delivery_forecast ?? ""}
                disabled={saving}
                onChange={(e) => updateOrder({ delivery_forecast: e.target.value || null })}
              />
            </div>
          </div>

          <div className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Crédito da loja
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{fmtBRL(creditBalance)}</div>
                <div className="mt-1 text-xs text-slate-500">Abatido neste pedido: {fmtBRL(Number(order.credit_applied ?? 0))}</div>
              </div>

              <PrimaryActionButton onClick={openCreditModal} disabled={saving || creditBalance <= 0}>
                Abater crédito
              </PrimaryActionButton>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <SectionTitle title="Informações da loja" subtitle="Dados do destinatário para conferência e emissão" />

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <InfoPair label="Loja" value={storeInfo?.name ?? "-"} />
          <InfoPair label="Razão social" value={storeInfo?.legal_name ?? "-"} />
          <InfoPair label="CNPJ" value={fmtCNPJ(storeInfo?.cnpj)} />
          <InfoPair label="IE" value={storeInfo?.ie ?? "-"} />
          <InfoPair label="Indicador IE destinatário" value={storeInfo?.ind_ie_dest ?? "-"} />
          <InfoPair label="E-mail NF-e" value={storeInfo?.email_nf ?? "-"} />
          <InfoPair label="Telefone NF-e" value={storeInfo?.phone_nf ?? "-"} />
          <InfoPair label="CEP" value={storeInfo?.address_zip ?? "-"} />
          <InfoPair
            label="Endereço"
            value={
              [storeInfo?.address_street, storeInfo?.address_number, storeInfo?.address_complement]
                .filter(Boolean)
                .join(", ") || "-"
            }
          />
          <InfoPair label="Cidade/UF" value={[storeInfo?.city, storeInfo?.state].filter(Boolean).join("/") || "-"} />
        </div>
      </div>

      <Card title="Observações">
        <textarea
          className="w-full min-h-[110px] rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          value={order.notes ?? ""}
          disabled={saving}
          onChange={(e) => updateOrder({ notes: e.target.value })}
          placeholder="Observações do pedido..."
        />
        <div className="mt-3 text-xs text-slate-500">
          Criado: {fmtDT(order.created_at)} · Enviado: {fmtDT(order.submitted_at)} · Aprovado: {fmtDT(order.approved_at)}
        </div>
      </Card>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <SectionTitle
          title="Itens do pedido (atual)"
          subtitle={
            editMode
              ? "Modo edição: ajuste quantidades e remova itens. Depois clique em Salvar alterações."
              : `${items.length} item(ns)`
          }
          right={
            lockedByLogistics ? (
              <Badge tone="red">ENTREGUE (itens bloqueados)</Badge>
            ) : editMode ? (
              <Badge tone="blue">EDITANDO</Badge>
            ) : null
          }
        />

        <div className="mt-6">
          <Table headers={["SKU", "Produto", "Unid.", "Preço", "Qtd", "Qtd/Caixa", "Total"]} rows={itemsRows} />
        </div>
      </div>

      {originalItems && originalItems.length > 0 ? (
        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <SectionTitle
            title="Pedido original do franqueado"
            subtitle={order.edited_at ? `Snapshot salvo em ${fmtDT(order.edited_at)}` : "Snapshot salvo"}
            right={<Badge tone="neutral">ORIGINAL</Badge>}
          />
          <div className="mt-6">
            <Table headers={["SKU", "Produto", "Unid.", "Preço", "Qtd", "Qtd/Caixa", "Total"]} rows={originalRows} />
          </div>
        </div>
      ) : null}

      {creditModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={closeCreditModal}>
          <div
            className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-slate-900">Abater crédito</div>
                <div className="mt-1 text-xs text-slate-500">
                  Saldo: <b>{fmtBRL(creditBalance)}</b> · Já abatido: <b>{fmtBRL(creditApplied)}</b>
                </div>
              </div>
              <SecondaryActionButton onClick={closeCreditModal} disabled={saving}>
                Fechar
              </SecondaryActionButton>
            </div>

            <div className="mt-4 grid gap-3">
              <Input label="Valor (opcional)" placeholder="Vazio = abater o máximo possível" value={creditAmount} onChange={setCreditAmount} />
              <Input label="Observação (opcional)" placeholder="Ex.: abatimento parcial" value={creditNote} onChange={setCreditNote} />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <PrimaryActionButton onClick={applyCredit} disabled={saving}>
                {saving ? "Aplicando..." : "Aplicar crédito"}
              </PrimaryActionButton>
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Regra: abate até o limite do saldo e até o limite do total do pedido.
            </div>
          </div>
        </div>
      ) : null}

      {nfeModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={closeNfeModal}>
          <div
            className="w-full max-w-5xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-slate-900">Preparar NF-e (rascunho)</div>
                <div className="mt-1 text-xs text-slate-500">
                  Preencha dados fiscais e copie o JSON para plugar na API de emissão.
                </div>
              </div>
              <SecondaryActionButton onClick={closeNfeModal}>Fechar</SecondaryActionButton>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Input label="Natureza da operação" value={nfeNatureza} onChange={setNfeNatureza} />
              <Input label="Série" value={nfeSerie} onChange={setNfeSerie} />
              <Input label="Número (opcional)" value={nfeNumero} onChange={setNfeNumero} placeholder="deixe vazio se a API gerar" />
            </div>

            <div className="mt-4 rounded-xl border border-slate-200">
              <div className="grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                <div className="col-span-4">Produto</div>
                <div className="col-span-1 text-right">Qtd</div>
                <div className="col-span-1 text-right">Vlr</div>
                <div className="col-span-1">NCM</div>
                <div className="col-span-1">CFOP</div>
                <div className="col-span-1">CEST</div>
                <div className="col-span-1">EAN</div>
                <div className="col-span-1">Orig</div>
                <div className="col-span-1">CST</div>
              </div>

              <div className="max-h-[320px] overflow-auto">
                {items.map((it) => {
                  const d = nfeItems[it.id];
                  if (!d) return null;
                  return (
                    <div key={it.id} className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-sm">
                      <div className="col-span-4">
                        <div className="text-slate-900">{d.name || "-"}</div>
                        <div className="font-mono text-xs text-slate-500">{d.sku || "-"}</div>
                      </div>
                      <div className="col-span-1 text-right font-semibold">{d.qty}</div>
                      <div className="col-span-1 text-right">{fmtBRL(d.unit_cost)}</div>
                      <div className="col-span-1">
                        <input className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm" value={d.ncm} onChange={(e) => setNfeItemField(it.id, "ncm", e.target.value)} />
                      </div>
                      <div className="col-span-1">
                        <input className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm" value={d.cfop} onChange={(e) => setNfeItemField(it.id, "cfop", e.target.value)} />
                      </div>
                      <div className="col-span-1">
                        <input className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm" value={d.cest} onChange={(e) => setNfeItemField(it.id, "cest", e.target.value)} />
                      </div>
                      <div className="col-span-1">
                        <input className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm" value={d.ean} onChange={(e) => setNfeItemField(it.id, "ean", e.target.value)} />
                      </div>
                      <div className="col-span-1">
                        <input className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm" value={d.origin} onChange={(e) => setNfeItemField(it.id, "origin", e.target.value)} placeholder="0" />
                      </div>
                      <div className="col-span-1">
                        <input className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm" value={d.icms_cst} onChange={(e) => setNfeItemField(it.id, "icms_cst", e.target.value)} placeholder="ICMS" />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
                * PIS/COFINS CST ficam dentro do JSON.
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <div className="font-semibold text-slate-700">Totais</div>
                <div className="mt-1">Itens: <b>{fmtBRL(totalItens)}</b></div>
                <div>Frete: <b>{fmtBRL(frete)}</b></div>
                <div>Total bruto: <b>{fmtBRL(totalComFrete)}</b></div>
                <div>Crédito: <b>- {fmtBRL(creditApplied)}</b></div>
                <div className="mt-1">Total líquido: <b>{fmtBRL(totalLiquido)}</b></div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-600">JSON (rascunho)</div>
                  <div className="flex items-center gap-2">
                    {nfeCopyMsg ? <span className="text-xs text-slate-600">{nfeCopyMsg}</span> : null}
                    <SecondaryActionButton onClick={copyNfeJson}>Copiar JSON</SecondaryActionButton>
                  </div>
                </div>

                <textarea
                  className="mt-2 min-h-[220px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900 outline-none"
                  readOnly
                  value={nfeDraftPayload ? JSON.stringify(nfeDraftPayload, null, 2) : ""}
                />
              </div>
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Isso não emite NF-e ainda pelo modal. A emissão agora está no quadro fixo “NF-e / Focus”.
            </div>
          </div>
        </div>
      ) : null}

      {splitModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={closeSplitModal}>
          <div
            className="w-full max-w-3xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-slate-900">Gerar pedido parcial</div>
                <div className="mt-1 text-xs text-slate-500">
                  Selecione os itens e informe a quantidade que será enviada nesta remessa.
                </div>
              </div>
              <SecondaryActionButton onClick={closeSplitModal} disabled={splitCreating}>
                Fechar
              </SecondaryActionButton>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-slate-200">
                <div className="grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                  <div className="col-span-1">OK</div>
                  <div className="col-span-6">Produto</div>
                  <div className="col-span-2 text-right">Qtd pedido</div>
                  <div className="col-span-3 text-right">Qtd remessa</div>
                </div>

                <div className="max-h-[360px] overflow-auto">
                  {items.map((it) => {
                    const st = splitItems[it.id] ?? { include: true, qty: String(Number(it.qty ?? 0)) };
                    const name = it.products?.name ?? "-";
                    return (
                      <div key={it.id} className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-sm">
                        <div className="col-span-1">
                          <input type="checkbox" checked={!!st.include} onChange={(e) => setSplitInclude(it.id, e.target.checked)} />
                        </div>
                        <div className="col-span-6">
                          <div className="text-slate-900">{name}</div>
                          <div className="text-xs text-slate-500">{it.products?.sku ?? "-"}</div>
                        </div>
                        <div className="col-span-2 text-right font-semibold">{Number(it.qty ?? 0)}</div>
                        <div className="col-span-3 text-right">
                          <input
                            className="w-28 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-sm outline-none focus:border-slate-300 disabled:bg-slate-50"
                            type="number"
                            min={0}
                            step={1}
                            value={st.qty}
                            disabled={!st.include || splitCreating}
                            onChange={(e) => setSplitQty(it.id, e.target.value)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Observação da remessa (opcional)</label>
                  <textarea
                    className="w-full min-h-[90px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    value={splitNotes}
                    disabled={splitCreating}
                    onChange={(e) => setSplitNotes(e.target.value)}
                    placeholder="Ex.: enviado parcial por falta de estoque no CD..."
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <div className="font-semibold text-slate-700">Importante</div>
                  <div className="mt-1">• O botão cria um novo pedido com itens selecionados.</div>
                  <div>• O pedido original permanece igual.</div>
                  <div>• Cada remessa pode ter cobrança separada.</div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <PrimaryActionButton onClick={createPartialShipment} disabled={splitCreating}>
                {splitCreating ? "Gerando..." : "Gerar remessa"}
              </PrimaryActionButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}