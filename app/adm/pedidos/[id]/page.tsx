"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import {
  PageHeader,
  Card,
  Input,
  Select,
  Badge,
  Table,
} from "@/app/components/ui";

type UnifiedLogisticStatus =
  | "RECEBIDO"
  | "EM_SEPARACAO"
  | "SAIU_PARA_ENTREGA"
  | "ENTREGUE";

type OrderRow = {
  id: string;
  store_id: string | null;
  status: string;
  notes: string | null;

  created_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;

  logistic_status: UnifiedLogisticStatus | null;

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

  delivered_at: string | null;
  delivery_dispute_deadline: string | null;
  delivery_confirmation_status: string | null;
  delivery_disputed_at: string | null;
  delivery_dispute_reason: string | null;
  delivery_dispute_notes: string | null;
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
  pack_qty: number | null;
  pack_unit: string | null;
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
const LOG_OPTIONS: UnifiedLogisticStatus[] = [
  "RECEBIDO",
  "EM_SEPARACAO",
  // "SAIU_PARA_ENTREGA" — só via botão de dispatch (modal de provedor)
  // "ENTREGUE" — só via código de confirmação ou Lalamove automático
];
const PAY_METHODS = ["PIX", "CARTAO", "BOLETO"] as const;
const DELIVERY_OPTIONS = ["RETIRADA", "FRETE"] as const;

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
    : rounded.toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
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
        fullWidth ? "w-full" : "w-full sm:w-auto",
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
        fullWidth ? "w-full" : "w-full sm:w-auto",
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
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
      </div>
      {right ? <div className="w-full sm:w-auto">{right}</div> : null}
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
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="break-words text-sm font-semibold text-slate-900 sm:text-right">{value}</span>
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

function HeaderActionPanel({
  title,
  accent = "neutral",
  children,
}: {
  title: string;
  accent?: "neutral" | "cyan";
  children: React.ReactNode;
}) {
  const tone =
    accent === "cyan"
      ? {
          panel:
            "border-cyan-100 bg-[linear-gradient(180deg,rgba(236,254,255,0.98)_0%,rgba(255,255,255,0.98)_100%)] shadow-[0_18px_38px_rgba(8,145,178,0.10)]",
          dot: "bg-cyan-500",
        }
      : {
          panel:
            "border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.98)_100%)] shadow-[0_16px_34px_rgba(15,23,42,0.06)]",
          dot: "bg-slate-400",
        };

  return (
    <div className={["rounded-[26px] border p-3 backdrop-blur", tone.panel].join(" ")}>
      <div className="mb-2 flex items-center gap-2">
        <span className={["h-2 w-2 rounded-full", tone.dot].join(" ")} />
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {title}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {children}
      </div>
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

function logisticLabel(v: OrderRow["logistic_status"]) {
  if (v === "RECEBIDO") return "Recebido";
  if (v === "EM_SEPARACAO") return "Em separação";
  if (v === "SAIU_PARA_ENTREGA") return "Saiu para entrega";
  if (v === "ENTREGUE") return "Entregue";
  return "—";
}

function logisticTone(v: OrderRow["logistic_status"]) {
  if (v === "ENTREGUE") return "green" as const;
  if (v === "SAIU_PARA_ENTREGA") return "blue" as const;
  if (v === "EM_SEPARACAO") return "yellow" as const;
  return "neutral" as const;
}

function paymentTone(order: Pick<OrderRow, "is_paid" | "due_date">) {
  if (order.is_paid) return "green" as const;
  if (order.due_date && order.due_date < todayYMD()) return "red" as const;
  return "yellow" as const;
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

  // Dispatch — modal de escolha de provedor (igual à expedição)
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [dispatchSaving, setDispatchSaving] = useState(false);
  const [splitCreating, setSplitCreating] = useState(false);

  const [focusDoc, setFocusDoc] = useState<FocusNfeDocRow | null>(null);
  const [focusLoading, setFocusLoading] = useState(false);
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
        "id,store_id,status,notes,created_at,submitted_at,approved_at,logistic_status,is_paid,paid_at,payment_method,delivery_mode,freight_fee,credit_applied,due_date,delivery_forecast,edited_by_admin,edited_at,original_items,delivered_at,delivery_dispute_deadline,delivery_confirmation_status,delivery_disputed_at,delivery_dispute_reason,delivery_dispute_notes"
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
        "id,qty,unit,unit_cost,product_id, products:products (sku,name,unit,pack_qty,pack_unit,ncm,cest,cfop,cfop_default,ean,origin,icms_cst,pis_cst,cofins_cst)"
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

    // Se está alterando logistic_status, passa pela API com validações de bloqueio
    if (patch.logistic_status !== undefined) {
      if (patch.logistic_status === "ENTREGUE") {
        setMsg("O status 'Entregue' só pode ser marcado automaticamente via código de confirmação ou pela Lalamove.");
        setSaving(false);
        return;
      }
      if (patch.logistic_status === "SAIU_PARA_ENTREGA") {
        setMsg("Use o botão 'Saída para entrega' para escolher o provedor (motorista autônomo ou Lalamove).");
        setSaving(false);
        return;
      }
      const response = await fetch(`/api/logistica/admin/order/${order.id}/set-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryStatus: patch.logistic_status }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setMsg(data.message || "Erro ao atualizar status.");
        setSaving(false);
        return;
      }
      // Recarrega o pedido para refletir o novo status
      const { data: refreshed, error: rErr } = await supabase
        .from("orders")
        .select("id,store_id,status,notes,created_at,submitted_at,approved_at,logistic_status,is_paid,paid_at,payment_method,delivery_mode,freight_fee,credit_applied,due_date,delivery_forecast,edited_by_admin,edited_at,original_items")
        .eq("id", order.id)
        .single();
      if (!rErr && refreshed) {
        const ord = refreshed as OrderRow;
        setOrder(ord);
        setOriginalItems((ord.original_items ?? null) as any);
      }
      setSaving(false);
      return;
    }

    // Para outros campos, atualiza diretamente
    const prevStatus = order.status;

    if (patch.status === "approved" && prevStatus !== "approved") {
      patch = { ...patch, approved_at: new Date().toISOString() };
    } else if (patch.status && patch.status !== "approved") {
      patch = { ...patch, approved_at: null };
    }

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

    // Baixa / estorno de estoque ao mudar status
    if (patch.status !== undefined) {
      const wasApproved = prevStatus === "approved";
      const nowApproved = ord.status === "approved";

      if (nowApproved && !wasApproved) {
        fetch("/api/estoque/baixa-pedido", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: ord.id }),
        }).catch((e) => console.error("[baixa-pedido]", e));
      } else if (wasApproved && !nowApproved) {
        fetch("/api/estoque/estorno-pedido", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: ord.id }),
        }).catch((e) => console.error("[estorno-pedido]", e));
      }
    }

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
    setMsg(
      applied > 0
        ? `Crédito abatido: ${fmtBRL(applied)}.`
        : "Nenhum crédito abatido (sem saldo ou pedido já quitado)."
    );
  }

  async function deleteThisOrder() {
    if (!order) return;
    const ok = window.confirm(
      "Tem certeza que deseja excluir este pedido? Isso remove do Admin e do Cliente."
    );
    if (!ok) return;

    setSaving(true);
    setMsg("");

    const res = await fetch(`/api/adm/orders/${order.id}/delete`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSaving(false);
      setMsg(`Erro ao excluir pedido: ${json.error ?? res.statusText}`);
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
    setTimeout(() => window.print(), 80);
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

      // Se o pedido original tinha crédito aplicado, redistribui proporcionalmente
      if (newOrderId && (order.credit_applied ?? 0) > 0) {
        const totalCredito = Number(order.credit_applied);

        // Busca os totais de itens dos dois pedidos
        const { data: totais } = await supabase
          .from("v_order_totals")
          .select("order_id,total_cost")
          .in("order_id", [order.id, newOrderId]);

        if (totais && totais.length === 2) {
          const parentTotais = (totais as any[]).find((t) => t.order_id === order.id);
          const childTotais  = (totais as any[]).find((t) => t.order_id === newOrderId);

          const { data: parentOrder } = await supabase
            .from("orders")
            .select("freight_fee")
            .eq("id", order.id)
            .maybeSingle();
          const { data: childOrder } = await supabase
            .from("orders")
            .select("freight_fee")
            .eq("id", newOrderId)
            .maybeSingle();

          const parentTotal = (Number(parentTotais?.total_cost) || 0) + (Number(parentOrder?.freight_fee) || 0);
          const childTotal  = (Number(childTotais?.total_cost)  || 0) + (Number(childOrder?.freight_fee)  || 0);

          // Crédito do pedido original: cobre o quanto precisar (sem exceder o total)
          const parentCredit = Math.min(totalCredito, parentTotal);
          const childCredit  = Math.max(0, totalCredito - parentCredit);

          await supabase.from("orders").update({ credit_applied: parentCredit }).eq("id", order.id);

          if (childCredit > 0) {
            await supabase.from("orders").update({
              credit_applied: childCredit,
              payment_method: "PREPAGO",
            }).eq("id", newOrderId);
          }
        }
      }

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

      if (!res.ok || !data?.ok) {
        setMsg(data?.error || "Erro ao consultar status da NF-e.");
        return;
      }

      await loadFocusDoc(order.id);
      setMsg("Status da NF-e atualizado.");
    } catch (e: any) {
      setMsg(e?.message || "Erro ao consultar status da NF-e.");
    } finally {
      setFocusRefreshing(false);
    }
  }

  if (loading) {
    return <Card>Carregando...</Card>;
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Pedido"
          subtitle="Não foi possível carregar"
          right={
            <SecondaryActionButton onClick={() => router.push("/adm/pedidos")}>
              Voltar
            </SecondaryActionButton>
          }
        />
        <Card>
          <div className="text-sm text-red-600">{msg || "Pedido não encontrado."}</div>
        </Card>
      </div>
    );
  }

  const edited = !!order.edited_by_admin;
  async function goToLogisticsWithProvider(provider: "autonomo" | "lalamove") {
    if (!order) return;
    setDispatchSaving(true);
    try {
      // Se ainda está como Recebido, avança para Em separação antes de abrir logística
      if ((order.logistic_status ?? "RECEBIDO") === "RECEBIDO") {
        await fetch(`/api/logistica/admin/order/${order.id}/set-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliveryStatus: "EM_SEPARACAO" }),
        });
        setOrder((prev) => prev ? { ...prev, logistic_status: "EM_SEPARACAO" } : prev);
      }
      setDispatchModalOpen(false);
      router.push(`/adm/logistica/${order.id}?mode=dispatch&provider=${provider}`);
    } finally {
      setDispatchSaving(false);
    }
  }

  const logisticsHref = `/adm/logistica/${order.id}`;
  const fiscalHref = `/adm/emissao-fiscal/${order.id}`;

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

    const dbPackQty = Number(it.products?.pack_qty ?? 0);
    let packCell: React.ReactNode;
    if (dbPackQty > 0) {
      const numPacks = Math.ceil(qtyNum / dbPackQty);
      const unitLbl = (it.products?.unit ?? it.unit ?? "").toLowerCase().includes("kg") ? "kg" : "u";
      const packUnit = it.products?.pack_unit || "cx";
      packCell = (
        <div className="leading-tight">
          <div className="font-semibold text-slate-800">{fmtNumBR(dbPackQty)}{unitLbl}/{packUnit}</div>
          <div className="text-xs text-slate-500">{packUnit.toUpperCase()}: {fmtNumBR(numPacks)}</div>
        </div>
      );
    } else {
      const pack = getPackInfo(name);
      const packsQty = pack ? ceilPacks(qtyNum, pack) : null;
      packCell = !pack ? (
        <span className="text-slate-500">-</span>
      ) : (
        <div className="leading-tight">
          <div className="font-semibold text-slate-800">{packBaseText(pack)}</div>
          <div className="text-xs text-slate-500">
            {pack.packLabel.toUpperCase()}: {fmtNumBR(packsQty ?? 0)}
          </div>
        </div>
      );
    }

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
      <div key="qty" className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          className="w-full rounded-[14px] border border-slate-200 bg-white px-2 py-2 text-sm outline-none focus:border-slate-300 disabled:bg-slate-50 sm:w-24"
          type="number"
          value={qtyStr}
          disabled={saving || lockedByLogistics || removed}
          onChange={(e) => setItemQty(it.id, e.target.value)}
          min={0}
          step={1}
        />
        <SecondaryActionButton
          danger={!removed}
          fullWidth
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
    <div className="space-y-4 sm:space-y-6">
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 10mm;
        }

        .print-only {
          display: none;
        }

        @media print {
          html,
          body {
            background: #ffffff !important;
          }

          body * {
            visibility: hidden;
          }

          #print-area,
          #print-area * {
            visibility: visible;
          }

          #print-area {
            position: absolute;
            inset: 0;
            width: 100%;
            margin: 0;
            padding: 0;
            background: #ffffff !important;
          }

          .no-print {
            display: none !important;
          }

          #print-area > *:not(.print-only) {
            display: none !important;
          }

          .print-only {
            display: block !important;
          }

          .print-section {
            break-inside: avoid;
            page-break-inside: avoid;
            border: 1px solid #000 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #fff !important;
            margin-bottom: 10px !important;
            padding: 10px !important;
          }

          .print-grid-2 {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
          }

          .print-grid-3 {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 8px !important;
          }

          .print-grid-4 {
            display: grid !important;
            grid-template-columns: repeat(4, 1fr) !important;
            gap: 8px !important;
          }

          .print-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            font-size: 11px;
          }

          .print-table th,
          .print-table td {
            border: 1px solid #000;
            padding: 6px 7px;
            vertical-align: top;
            text-align: left;
            word-break: break-word;
          }

          .print-table th {
            background: #f1f5f9 !important;
            font-weight: 700;
          }

          .print-label {
            font-size: 10px;
            line-height: 1.2;
            font-weight: 700;
            color: #475569 !important;
            text-transform: uppercase;
          }

          .print-value {
            margin-top: 2px;
            font-size: 12px;
            line-height: 1.35;
            color: #0f172a !important;
            font-weight: 600;
            word-break: break-word;
          }

          .print-title {
            font-size: 18px;
            font-weight: 800;
            color: #000 !important;
            letter-spacing: 0.02em;
          }

          .print-subtitle {
            font-size: 11px;
            color: #334155 !important;
          }

          .print-box {
            border: 1px solid #000;
            padding: 8px;
            min-height: 54px;
          }

          .print-total-box {
            border: 1.5px solid #000;
            padding: 8px;
            background: #fff !important;
          }

          .print-total-label {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            color: #334155 !important;
          }

          .print-total-value {
            margin-top: 4px;
            font-size: 16px;
            font-weight: 800;
            color: #000 !important;
          }

          .print-note-box {
            min-height: 58px;
            border: 1px solid #000;
            padding: 8px;
            white-space: pre-wrap;
            font-size: 11px;
          }

          .screen-table-wrap {
            display: none !important;
          }
        }
      `}</style>

      <div className="no-print">
        <PageHeader
          title="Detalhe do pedido"
          subtitle={`ID: ${order.id}`}
          right={
            <div className="w-full lg:min-w-[860px] xl:min-w-[980px]">
              <div className="grid gap-3 lg:grid-cols-2">
                <HeaderActionPanel title="Navegação e utilidades">
                  <div className="flex items-center">
                    {edited ? (
                      <Badge tone="blue">
                        EDITADO {order.edited_at ? `• ${fmtDT(order.edited_at)}` : ""}
                      </Badge>
                    ) : (
                      <Badge tone="neutral">ORIGINAL</Badge>
                    )}
                  </div>

                  <Link href={logisticsHref} className="block">
                    <SecondaryActionButton fullWidth={false}>
                      Ir para logística
                    </SecondaryActionButton>
                  </Link>

                  <Link href={fiscalHref} className="block">
                    <SecondaryActionButton fullWidth={false}>
                      Ir para emissão fiscal
                    </SecondaryActionButton>
                  </Link>

                  <SecondaryActionButton
                    fullWidth={false}
                    onClick={() => router.push("/adm/pedidos")}
                  >
                    Voltar
                  </SecondaryActionButton>

                  <SecondaryActionButton
                    fullWidth={false}
                    onClick={() => loadAll(order.id)}
                    disabled={saving}
                  >
                    Recarregar
                  </SecondaryActionButton>

                  <SecondaryActionButton fullWidth={false} onClick={handlePrint}>
                    Imprimir
                  </SecondaryActionButton>
                </HeaderActionPanel>

                <HeaderActionPanel
                  title={editMode ? "Edição do pedido" : "Ações do pedido"}
                  accent="cyan"
                >
                  <SecondaryActionButton
                    fullWidth={false}
                    onClick={openSplitModal}
                    disabled={saving || editMode || lockedByLogistics}
                  >
                    Gerar pedido parcial
                  </SecondaryActionButton>

                  {!editMode ? (
                    <PrimaryActionButton
                      fullWidth={false}
                      onClick={() => router.push(`/adm/pedidos/${order.id}?edit=1`)}
                      disabled={saving || lockedByLogistics}
                    >
                      Editar itens
                    </PrimaryActionButton>
                  ) : (
                    <>
                      <SecondaryActionButton
                        fullWidth={false}
                        onClick={cancelEdits}
                        disabled={saving}
                      >
                        Cancelar
                      </SecondaryActionButton>

                      <PrimaryActionButton
                        fullWidth={false}
                        onClick={saveEdits}
                        disabled={saving || lockedByLogistics}
                      >
                        {saving ? "Salvando..." : "Salvar alterações"}
                      </PrimaryActionButton>
                    </>
                  )}

                  <SecondaryActionButton
                    fullWidth={false}
                    danger
                    onClick={deleteThisOrder}
                    disabled={saving}
                  >
                    Excluir
                  </SecondaryActionButton>
                </HeaderActionPanel>
              </div>
            </div>
          }
        />
      </div>

      {msg ? (
        <div className="no-print">
          <Card>
            <div className="whitespace-pre-wrap text-sm text-red-600">{msg}</div>
          </Card>
        </div>
      ) : null}

      {/* Alerta de entrega contestada */}
      {order?.delivery_confirmation_status === "CONTESTADA" ? (
        <div className="no-print rounded-[24px] border border-orange-300 bg-orange-50 p-4 shadow-sm sm:rounded-[30px] sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100">
              <span className="text-lg">⚠️</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-orange-900">
                  Entrega contestada pelo franqueado
                </span>
                <Badge tone="red">Entrega contestada</Badge>
              </div>
              <div className="mt-2 grid gap-1.5 text-sm text-orange-800">
                <div>
                  <span className="font-semibold">Motivo:</span>{" "}
                  {order.delivery_dispute_reason ?? "—"}
                </div>
                {order.delivery_dispute_notes ? (
                  <div>
                    <span className="font-semibold">Observação:</span>{" "}
                    {order.delivery_dispute_notes}
                  </div>
                ) : null}
                <div>
                  <span className="font-semibold">Contestado em:</span>{" "}
                  {fmtDT(order.delivery_disputed_at)}
                </div>
                <div>
                  <span className="font-semibold">Entregue em:</span>{" "}
                  {fmtDT(order.delivered_at)}
                </div>
              </div>
              <div className="mt-3 text-xs text-orange-700">
                O status logístico permanece como <strong>ENTREGUE</strong>. Esta é uma divergência registrada para análise manual.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div id="print-area" className={printMode ? "print-mode" : ""}>
        <div className="print-only">
          <div className="print-section">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="print-title">PEDIDO</div>
                <div className="print-value">{storeInfo?.name ?? "-"}</div>
                {storeInfo?.legal_name && storeInfo.legal_name !== storeInfo?.name ? (
                  <div className="print-subtitle">{storeInfo.legal_name}</div>
                ) : null}
              </div>
              <div className="text-right">
                <div className="print-label">Nº do pedido</div>
                <div style={{ fontSize: 10 }}>{order.id}</div>
                <div className="mt-2 print-label">Data</div>
                <div className="print-value">{order.submitted_at ? fmtDT(order.submitted_at) : fmtDT(order.created_at)}</div>
                {order.delivery_forecast ? (
                  <>
                    <div className="mt-1 print-label">Previsão de entrega</div>
                    <div className="print-value">{order.delivery_forecast}</div>
                  </>
                ) : null}
                {order.payment_method ? (
                  <>
                    <div className="mt-1 print-label">Forma de pagamento</div>
                    <div className="print-value">{order.payment_method === "PIX" ? "PIX" : order.payment_method === "CARTAO" ? "Cartão" : order.payment_method === "BOLETO" ? "Boleto" : order.payment_method}</div>
                  </>
                ) : null}
                {order.due_date ? (
                  <>
                    <div className="mt-1 print-label">Vencimento</div>
                    <div className="print-value">{order.due_date}</div>
                  </>
                ) : null}
              </div>
            </div>
            {(storeInfo?.address_street || storeInfo?.city) ? (
              <div className="mt-3" style={{ borderTop: "1px solid #ccc", paddingTop: 6 }}>
                <div className="print-label">Endereço de entrega</div>
                <div className="print-value">
                  {[storeInfo?.address_street, storeInfo?.address_number, storeInfo?.address_complement, storeInfo?.address_neighborhood, storeInfo?.city, storeInfo?.state, storeInfo?.address_zip ? `CEP ${storeInfo.address_zip}` : null].filter(Boolean).join(", ")}
                </div>
              </div>
            ) : null}
          </div>

          <div className="print-section">
            <table className="print-table">
              <thead>
                <tr>
                  <th style={{ width: "12%" }}>SKU</th>
                  <th style={{ width: "36%" }}>Produto</th>
                  <th style={{ width: "8%" }}>Unid.</th>
                  <th style={{ width: "11%" }}>Preço</th>
                  <th style={{ width: "8%" }}>Qtd</th>
                  <th style={{ width: "13%" }}>Qtd/Emb.</th>
                  <th style={{ width: "12%" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const sku = it.products?.sku ?? "-";
                  const name = it.products?.name ?? "-";
                  const unit = it.products?.unit ?? it.unit ?? "-";
                  const unitCost = Number(it.unit_cost ?? 0);
                  const qtyNum = Number(it.qty ?? 0);
                  const line = qtyNum * unitCost;

                  const dbPackQty = Number(it.products?.pack_qty ?? 0);
                  let printPackCell: string;
                  if (dbPackQty > 0) {
                    const numPacks = Math.ceil(qtyNum / dbPackQty);
                    const unitLbl = unit.toLowerCase().includes("kg") ? "kg" : "u";
                    const packUnit = it.products?.pack_unit || "cx";
                    printPackCell = `${fmtNumBR(dbPackQty)}${unitLbl}/${packUnit} • ${packUnit.toUpperCase()}: ${fmtNumBR(numPacks)}`;
                  } else {
                    const pack = getPackInfo(name);
                    const packsQty = pack ? ceilPacks(qtyNum, pack) : null;
                    printPackCell = !pack ? "-" : `${packBaseText(pack)} • ${pack.packLabel.toUpperCase()}: ${fmtNumBR(packsQty ?? 0)}`;
                  }

                  return (
                    <tr key={it.id}>
                      <td>{sku}</td>
                      <td>{name}</td>
                      <td>{unit}</td>
                      <td>{fmtBRL(unitCost)}</td>
                      <td>{fmtNumBR(qtyNum)}</td>
                      <td>{printPackCell}</td>
                      <td>{fmtBRL(line)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="print-section">
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              {frete > 0 && (
                <div className="print-total-box" style={{ minWidth: 120 }}>
                  <div className="print-total-label">Frete</div>
                  <div className="print-total-value">{fmtBRL(frete)}</div>
                </div>
              )}
              {creditApplied > 0 && (
                <div className="print-total-box" style={{ minWidth: 120 }}>
                  <div className="print-total-label">Crédito abatido</div>
                  <div className="print-total-value">- {fmtBRL(creditApplied)}</div>
                </div>
              )}
              <div className="print-total-box" style={{ minWidth: 140 }}>
                <div className="print-total-label">Total</div>
                <div className="print-total-value">{fmtBRL(totalLiquido)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-4 shadow-sm sm:rounded-[30px] sm:p-5 md:p-6 print-section">
          <SectionTitle
            title="Resumo do pedido"
            subtitle="Visão rápida para operação, financeiro e expedição"
            right={
              <div className="no-print">
                <Badge tone={statusBadgeTone(order.status) as any}>{order.status}</Badge>
              </div>
            }
          />

          <div className="no-print mt-4 flex flex-wrap gap-2">
            <Badge tone={logisticTone(order.logistic_status)}>
              {logisticLabel(order.logistic_status)}
            </Badge>

            {order.delivery_confirmation_status === "CONTESTADA" ? (
              <Badge tone="red">Entrega contestada</Badge>
            ) : lockedByLogistics ? (
              <Badge tone="green">Fluxo concluído</Badge>
            ) : order.logistic_status === "SAIU_PARA_ENTREGA" ? (
              <Badge tone="blue">Em rota</Badge>
            ) : order.logistic_status === "EM_SEPARACAO" ? (
              <Badge tone="yellow">Operação em andamento</Badge>
            ) : (
              <Badge tone="neutral">Aguardando operação</Badge>
            )}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SummaryBox title="Itens" value={fmtBRL(totalItens)} />
            <SummaryBox title="Frete" value={fmtBRL(frete)} />
            <SummaryBox title="Crédito abatido" value={`- ${fmtBRL(creditApplied)}`} />
            <SummaryBox title="Total líquido" value={fmtBRL(totalLiquido)} />
            <SummaryBox
              title="Saldo da loja"
              value={fmtBRL(creditBalance)}
              subtitle="Disponível para abatimento"
            />
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[30px] sm:p-5 md:p-6 print-section">
          <SectionTitle
            title="NF-e / Focus"
            subtitle="Acompanhe a emissão já iniciada e navegue para a área fiscal"
            right={
              <div className="no-print flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                {focusDoc ? (
                  <Badge tone={toneForNfeStatus(focusDoc.status) as any}>
                    {focusDoc.status || "Sem status"}
                  </Badge>
                ) : (
                  <Badge tone="neutral">Sem NF-e</Badge>
                )}

                <SecondaryActionButton
                  fullWidth
                  onClick={refreshFocusStatus}
                  disabled={!focusDoc?.reference || focusRefreshing}
                >
                  {focusRefreshing ? "Consultando..." : "Consultar status"}
                </SecondaryActionButton>

                <Link href={fiscalHref} className="w-full sm:w-auto">
                  <PrimaryActionButton fullWidth>Ir para emissão fiscal</PrimaryActionButton>
                </Link>
              </div>
            }
          />

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
              <div className="space-y-3">
                <InfoPair label="Status" value={focusDoc?.status || "-"} />
                <InfoPair label="Referência" value={focusDoc?.reference || `PED-${order.id}`} />
                <InfoPair label="Número" value={focusDoc?.numero || "-"} />
                <InfoPair label="Série" value={focusDoc?.serie || "-"} />
                <InfoPair label="Chave" value={focusDoc?.chave || "-"} />
                <InfoPair label="Protocolo" value={focusDoc?.protocolo || "-"} />
                <InfoPair label="Criado em" value={fmtDT(focusDoc?.created_at)} />
                <InfoPair label="Atualizado em" value={fmtDT(focusDoc?.updated_at)} />
              </div>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-white p-4">
              <div className="space-y-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Links do documento
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {focusDoc?.url_danfe ? (
                      <a
                        href={focusDoc.url_danfe}
                        target="_blank"
                        rel="noreferrer"
                        className="no-print inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] hover:bg-slate-50"
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
                        className="no-print inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] hover:bg-slate-50"
                      >
                        Abrir XML
                      </a>
                    ) : (
                      <Badge tone="neutral">XML indisponível</Badge>
                    )}
                  </div>
                </div>

                <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Erro / retorno Focus
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                    {focusDoc?.error_message || "Sem mensagem de erro."}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[30px] sm:p-5 md:p-6 print-section">
            <SectionTitle title="Status e operação" subtitle="Controle rápido do fluxo do pedido" />

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Select
                label="Status"
                value={order.status}
                onChange={(v) => updateOrder({ status: v })}
                options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
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

                <Input
                  label="Vencimento"
                  type="date"
                  value={order.due_date ?? ""}
                  onChange={(v) => updateOrder({ due_date: v || null })}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Pagamento
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <Badge tone={paymentTone(order)}>
                    {order.is_paid ? "Pago" : overdue ? "Pendente vencido" : "Pendente"}
                  </Badge>

                  <div className="no-print">
                    <PrimaryActionButton fullWidth onClick={onTogglePaid} disabled={saving}>
                      {order.is_paid ? "Marcar como não pago" : "Marcar como pago"}
                    </PrimaryActionButton>
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  {order.paid_at ? `Pago em: ${fmtDT(order.paid_at)}` : "Não pago"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[30px] sm:p-5 md:p-6 print-section">
            <SectionTitle
              title="Prazos, crédito e logística"
              subtitle="Vencimento, previsão de entrega e atalho da operação logística"
              right={
                <div className="no-print flex flex-wrap items-center gap-2">
                  {order.due_date ? (
                    overdue ? <Badge tone="red">Vencido</Badge> : <Badge tone="green">Financeiro OK</Badge>
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

                  <Badge tone={logisticTone(order.logistic_status)}>
                    {logisticLabel(order.logistic_status)}
                  </Badge>
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
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Crédito da loja
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {fmtBRL(creditBalance)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Abatido neste pedido: {fmtBRL(Number(order.credit_applied ?? 0))}
                  </div>
                </div>

                <div className="no-print w-full sm:w-auto">
                  <PrimaryActionButton fullWidth onClick={openCreditModal} disabled={saving || creditBalance <= 0}>
                    Abater crédito
                  </PrimaryActionButton>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[22px] border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Operação logística
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {order.logistic_status === "ENTREGUE" || order.logistic_status === "SAIU_PARA_ENTREGA" ? (
                  <div className={["rounded-[18px] border p-4", order.logistic_status === "ENTREGUE" ? "border-green-200 bg-green-50" : "border-blue-200 bg-blue-50"].join(" ")}>
                    <div className={["text-sm font-semibold", order.logistic_status === "ENTREGUE" ? "text-green-700" : "text-blue-700"].join(" ")}>
                      🔒 Status bloqueado
                    </div>
                    <div className={["mt-1 text-xs", order.logistic_status === "ENTREGUE" ? "text-green-600" : "text-blue-600"].join(" ")}>
                      {order.logistic_status === "ENTREGUE"
                        ? "Este pedido foi entregue. O status não pode mais ser alterado manualmente."
                        : "Este pedido saiu para entrega. O status não pode mais ser alterado manualmente."}
                    </div>
                  </div>
                ) : (
                  <Select
                    label="Status logístico"
                    value={(order.logistic_status ?? "RECEBIDO") as UnifiedLogisticStatus}
                    onChange={(v) => updateOrder({ logistic_status: v as UnifiedLogisticStatus })}
                    options={LOG_OPTIONS.map((s) => ({
                      value: s,
                      label: s === "RECEBIDO" ? "Recebido" : "Em separação",
                    }))}
                  />
                )}

                <div className="grid gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Ações
                  </div>
                  <div className="no-print flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Link href={logisticsHref} className="w-full sm:w-auto">
                      <SecondaryActionButton fullWidth>Ir para logística</SecondaryActionButton>
                    </Link>

                    {order.logistic_status !== "ENTREGUE" && order.logistic_status !== "SAIU_PARA_ENTREGA" ? (
                      <>
                        <SecondaryActionButton
                          fullWidth
                          onClick={() => updateOrder({ logistic_status: "EM_SEPARACAO" })}
                          disabled={saving || order.logistic_status === "EM_SEPARACAO"}
                        >
                          Marcar em separação
                        </SecondaryActionButton>

                        {order.delivery_mode !== "RETIRADA" ? (
                          <SecondaryActionButton
                            fullWidth
                            onClick={() => setDispatchModalOpen(true)}
                            disabled={saving}
                          >
                            Saída para entrega
                          </SecondaryActionButton>
                        ) : null}
                      </>
                    ) : null}

                    {/* "Marcar entregue" removido — só via código de confirmação ou Lalamove automático */}
                    <div className="rounded-[14px] border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
                      🔒 <b>Entregue</b> só é marcado automaticamente — via código do cliente ou Lalamove.
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 text-xs text-slate-500">
                Esta página e a tela de logística devem usar o mesmo status operacional do pedido.
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[30px] sm:p-5 md:p-6 print-section">
          <SectionTitle
            title="Informações da loja"
            subtitle="Dados do destinatário para conferência e emissão"
          />

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
            <InfoPair
              label="Cidade/UF"
              value={[storeInfo?.city, storeInfo?.state].filter(Boolean).join("/") || "-"}
            />
          </div>
        </div>

        <div className="print-section">
          <Card title="Observações">
            <textarea
              className="min-h-[110px] w-full rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              value={order.notes ?? ""}
              disabled={saving}
              onChange={(e) => updateOrder({ notes: e.target.value })}
              placeholder="Observações do pedido..."
            />
            <div className="mt-3 text-xs text-slate-500">
              Criado: {fmtDT(order.created_at)} · Enviado: {fmtDT(order.submitted_at)} · Aprovado:{" "}
              {fmtDT(order.approved_at)}
            </div>
          </Card>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[30px] sm:p-5 md:p-6 print-section">
          <SectionTitle
            title="Itens do pedido (atual)"
            subtitle={
              editMode
                ? "Modo edição: ajuste quantidades e remova itens. Depois clique em Salvar alterações."
                : `${items.length} item(ns)`
            }
            right={
              <div className="no-print">
                {lockedByLogistics ? (
                  <Badge tone="red">ENTREGUE (itens bloqueados)</Badge>
                ) : editMode ? (
                  <Badge tone="blue">EDITANDO</Badge>
                ) : null}
              </div>
            }
          />

          <div className="screen-table-wrap mt-6">
            <Table
              headers={["SKU", "Produto", "Unid.", "Preço", "Qtd", "Qtd/Caixa", "Total"]}
              rows={itemsRows}
            />
          </div>
        </div>

        {originalItems && originalItems.length > 0 ? (
          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[30px] sm:p-5 md:p-6 print-section">
            <SectionTitle
              title="Pedido original do cliente"
              subtitle={order.edited_at ? `Snapshot salvo em ${fmtDT(order.edited_at)}` : "Snapshot salvo"}
              right={
                <div className="no-print">
                  <Badge tone="neutral">ORIGINAL</Badge>
                </div>
              }
            />
            <div className="screen-table-wrap mt-6">
              <Table
                headers={["SKU", "Produto", "Unid.", "Preço", "Qtd", "Qtd/Caixa", "Total"]}
                rows={originalRows}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Modal: escolha de provedor para saída para entrega */}
      {dispatchModalOpen && order ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 p-3 sm:items-center"
          onClick={() => { if (!dispatchSaving) setDispatchModalOpen(false); }}>
          <div className="w-full max-w-2xl rounded-[30px] border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Saída para entrega</div>
                <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-slate-900">Escolha como este pedido será despachado</h3>
                <div className="mt-2 text-sm text-slate-600"><b>Pedido:</b> {order.id}</div>
              </div>
              <button type="button" onClick={() => setDispatchModalOpen(false)} disabled={dispatchSaving}
                className="rounded-[14px] border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Fechar
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <button type="button" disabled={dispatchSaving}
                onClick={() => goToLogisticsWithProvider("autonomo")}
                className="w-full rounded-[24px] border border-cyan-200 bg-cyan-50 p-4 text-left transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50">
                <div className="text-sm font-semibold text-slate-900">Motorista autônomo</div>
                <div className="mt-1 text-sm text-slate-600">Abre a logística para preencher motorista, gerar link de rastreio e código de entrega.</div>
              </button>
              <button type="button" disabled={dispatchSaving}
                onClick={() => goToLogisticsWithProvider("lalamove")}
                className="w-full rounded-[24px] border border-violet-200 bg-violet-50 p-4 text-left transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50">
                <div className="text-sm font-semibold text-slate-900">Chamar Lalamove</div>
                <div className="mt-1 text-sm text-slate-600">Abre a logística preparada para cotação, chamada da corrida e acompanhamento.</div>
              </button>
            </div>

            <div className="mt-5 flex justify-end">
              <button type="button" disabled={dispatchSaving} onClick={() => setDispatchModalOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {creditModalOpen ? (
        <div className="no-print fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={closeCreditModal}>
          <div
            className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-base font-semibold text-slate-900">Abater crédito</div>
                <div className="mt-1 text-xs text-slate-500">
                  Saldo: <b>{fmtBRL(creditBalance)}</b> · Já abatido: <b>{fmtBRL(creditApplied)}</b>
                </div>
              </div>
              <SecondaryActionButton fullWidth onClick={closeCreditModal} disabled={saving}>
                Fechar
              </SecondaryActionButton>
            </div>

            <div className="mt-4 grid gap-3">
              <Input
                label="Valor (opcional)"
                placeholder="Vazio = abater o máximo possível"
                value={creditAmount}
                onChange={setCreditAmount}
              />
              <Input
                label="Observação (opcional)"
                placeholder="Ex.: abatimento parcial"
                value={creditNote}
                onChange={setCreditNote}
              />
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

      {splitModalOpen ? (
        <div className="no-print fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={closeSplitModal}>
          <div
            className="w-full max-w-3xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-base font-semibold text-slate-900">Gerar pedido parcial</div>
                <div className="mt-1 text-xs text-slate-500">
                  Selecione os itens e informe a quantidade que será enviada nesta remessa.
                </div>
              </div>
              <SecondaryActionButton fullWidth onClick={closeSplitModal} disabled={splitCreating}>
                Fechar
              </SecondaryActionButton>
            </div>

            <div className="mt-4 space-y-3">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                  <div className="col-span-2 sm:col-span-1">OK</div>
                  <div className="col-span-5 sm:col-span-6">Produto</div>
                  <div className="col-span-2 text-right sm:col-span-2">Qtd pedido</div>
                  <div className="col-span-3 text-right">Qtd remessa</div>
                </div>

                <div className="max-h-[360px] overflow-auto">
                  {items.map((it) => {
                    const st = splitItems[it.id] ?? { include: true, qty: String(Number(it.qty ?? 0)) };
                    const name = it.products?.name ?? "-";
                    return (
                      <div key={it.id} className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-sm">
                        <div className="col-span-2 sm:col-span-1">
                          <input
                            type="checkbox"
                            checked={!!st.include}
                            onChange={(e) => setSplitInclude(it.id, e.target.checked)}
                          />
                        </div>
                        <div className="col-span-5 sm:col-span-6">
                          <div className="text-slate-900">{name}</div>
                          <div className="break-all text-xs text-slate-500">{it.products?.sku ?? "-"}</div>
                        </div>
                        <div className="col-span-2 text-right font-semibold">{Number(it.qty ?? 0)}</div>
                        <div className="col-span-3 text-right">
                          <input
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-sm outline-none focus:border-slate-300 disabled:bg-slate-50 sm:w-28"
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
                  <label className="mb-1 block text-xs text-slate-500">
                    Observação da remessa (opcional)
                  </label>
                  <textarea
                    className="min-h-[90px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
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