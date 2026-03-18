"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";
import { PageHeader, Card, Input, Badge, Select } from "@/app/components/ui";

type UnifiedLogisticStatus =
  | "RECEBIDO"
  | "EM_SEPARACAO"
  | "SAIU_PARA_ENTREGA"
  | "ENTREGUE";

type OrderRow = {
  id: string;
  store_id: string | null;
  status: string;
  logistic_status: UnifiedLogisticStatus | null;
  delivery_forecast: string | null;
  created_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  notes: string | null;
  delivery_mode: "RETIRADA" | "FRETE" | null;
  freight_fee: number | null;
  is_paid: boolean | null;
  paid_at: string | null;
  payment_method: "PIX" | "CARTAO" | "BOLETO" | null;
  credit_applied: number | null;
  stores?: {
    id: string;
    name: string | null;
  } | null;
};

type OrderItemAgg = {
  order_id: string;
  lines: number;
  qty_total: number;
  value_total: number;
};

type PrintStoreInfo = {
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

type PrintProductEmbed = {
  sku: string | null;
  name: string | null;
  unit: string | null;
};

type PrintItemRow = {
  id: string;
  qty: number;
  unit: string | null;
  unit_cost: number | null;
  product_id: string;
  products: PrintProductEmbed | null;
};

type PrintPayload = {
  order: OrderRow;
  storeInfo: PrintStoreInfo | null;
  items: PrintItemRow[];
  totalItens: number;
  frete: number;
  creditApplied: number;
  totalLiquido: number;
};

type PackInfo = {
  perPack?: number;
  perPackKg?: number;
  packLabel: string;
  unitLabel: string;
};

const LOGISTIC_OPTIONS: Array<{ value: UnifiedLogisticStatus; label: string }> = [
  { value: "RECEBIDO", label: "Recebido" },
  { value: "EM_SEPARACAO", label: "Em separação" },
  { value: "SAIU_PARA_ENTREGA", label: "Saiu para entrega" },
  { value: "ENTREGUE", label: "Entregue" },
];

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

function fmtDT(v: string | null | undefined) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("pt-BR");
  } catch {
    return String(v);
  }
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "-";
  try {
    const d = new Date(`${v}T12:00:00`);
    return d.toLocaleDateString("pt-BR");
  } catch {
    return String(v);
  }
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtBRL(v: number | null | undefined) {
  return Number(v ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function onlyDigits(v: string | null | undefined) {
  return (v ?? "").replace(/\D/g, "");
}

function fmtCNPJ(v: string | null | undefined) {
  const d = onlyDigits(v);
  if (d.length !== 14) return v ?? "-";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
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

function normTxt(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getPackInfo(productName: string | null | undefined): PackInfo | null {
  const n = normTxt(productName || "");
  if (!n) return null;
  const rule = PACK_RULES.find((r) => n.includes(r.match));
  return rule?.info ?? null;
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

function logisticTone(status: UnifiedLogisticStatus | null) {
  if (status === "ENTREGUE") return "green" as const;
  if (status === "SAIU_PARA_ENTREGA") return "blue" as const;
  if (status === "EM_SEPARACAO") return "yellow" as const;
  return "neutral" as const;
}

function logisticLabel(status: UnifiedLogisticStatus | null) {
  if (status === "RECEBIDO") return "Recebido";
  if (status === "EM_SEPARACAO") return "Em separação";
  if (status === "SAIU_PARA_ENTREGA") return "Saiu para entrega";
  if (status === "ENTREGUE") return "Entregue";
  return "—";
}

function deliveryModeLabel(mode: OrderRow["delivery_mode"]) {
  if (mode === "FRETE") return "Frete";
  if (mode === "RETIRADA") return "Retirada";
  return "-";
}

function paymentLabel(method: OrderRow["payment_method"]) {
  if (method === "PIX") return "PIX";
  if (method === "CARTAO") return "Cartão";
  if (method === "BOLETO") return "Boleto";
  return "-";
}

function sortOrdersForExpedition(a: OrderRow, b: OrderRow) {
  const today = todayYMD();

  const aLate = !!a.delivery_forecast && a.delivery_forecast < today;
  const bLate = !!b.delivery_forecast && b.delivery_forecast < today;
  if (aLate !== bLate) return aLate ? -1 : 1;

  const aToday = a.delivery_forecast === today;
  const bToday = b.delivery_forecast === today;
  if (aToday !== bToday) return aToday ? -1 : 1;

  const statusWeight = (s: UnifiedLogisticStatus | null) => {
    if (s === "EM_SEPARACAO") return 0;
    if (s === "RECEBIDO") return 1;
    if (s === "SAIU_PARA_ENTREGA") return 2;
    return 3;
  };

  const swA = statusWeight(a.logistic_status ?? "RECEBIDO");
  const swB = statusWeight(b.logistic_status ?? "RECEBIDO");
  if (swA !== swB) return swA - swB;

  const fa = a.delivery_forecast || "9999-12-31";
  const fb = b.delivery_forecast || "9999-12-31";
  if (fa !== fb) return fa.localeCompare(fb);

  const ca = a.created_at || "";
  const cb = b.created_at || "";
  return cb.localeCompare(ca);
}

function PrimaryActionButton({
  children,
  onClick,
  disabled,
  fullWidth,
  tone = "cyan",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  tone?: "cyan" | "amber" | "green";
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-500 hover:bg-amber-600"
      : tone === "green"
      ? "bg-emerald-600 hover:bg-emerald-700"
      : "bg-cyan-600 hover:bg-cyan-700";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-11 items-center justify-center rounded-[18px] px-4 text-sm font-semibold text-white transition",
        toneClass,
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
    <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900">{value}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

export default function AdmExpedicaoPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [itemAggMap, setItemAggMap] = useState<Record<string, OrderItemAgg>>({});

  const [search, setSearch] = useState("");
  const [filterLogistic, setFilterLogistic] = useState("all");
  const [filterDeliveryMode, setFilterDeliveryMode] = useState("all");
  const [filterForecast, setFilterForecast] = useState("all");

  const [printMode, setPrintMode] = useState(false);
  const [printPayload, setPrintPayload] = useState<PrintPayload | null>(null);

  useEffect(() => {
    (async () => {
      const ok = await requireAdminOrRedirect(router);
      if (!ok) return;
      await loadOrders();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onAfterPrint = () => setPrintMode(false);
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);

  async function loadOrders() {
    setMsg("");

    const { data, error } = await supabase
      .from("orders")
      .select(`
        id,
        store_id,
        status,
        logistic_status,
        delivery_forecast,
        created_at,
        submitted_at,
        approved_at,
        notes,
        delivery_mode,
        freight_fee,
        is_paid,
        paid_at,
        payment_method,
        credit_applied,
        stores:stores (
          id,
          name
        )
      `)
      .in("status", ["submitted", "approved"])
      .neq("logistic_status", "ENTREGUE")
      .order("created_at", { ascending: false });

    if (error) {
      setMsg(error.message);
      setOrders([]);
      setItemAggMap({});
      return;
    }

    const normalized: OrderRow[] = (data ?? []).map((row: any) => ({
      id: row.id,
      store_id: row.store_id,
      status: row.status,
      logistic_status: (row.logistic_status ?? "RECEBIDO") as UnifiedLogisticStatus,
      delivery_forecast: row.delivery_forecast ?? null,
      created_at: row.created_at ?? null,
      submitted_at: row.submitted_at ?? null,
      approved_at: row.approved_at ?? null,
      notes: row.notes ?? null,
      delivery_mode: row.delivery_mode ?? null,
      freight_fee: row.freight_fee ?? null,
      is_paid: row.is_paid ?? null,
      paid_at: row.paid_at ?? null,
      payment_method: row.payment_method ?? null,
      credit_applied: row.credit_applied ?? null,
      stores: Array.isArray(row.stores) ? row.stores[0] ?? null : row.stores ?? null,
    }));

    setOrders(normalized);

    const orderIds = normalized.map((o) => o.id);
    if (orderIds.length === 0) {
      setItemAggMap({});
      return;
    }

    const { data: itemsData, error: itemsError } = await supabase
      .from("order_items")
      .select("order_id,qty,unit_cost")
      .in("order_id", orderIds);

    if (itemsError) {
      console.warn("Erro ao carregar agregados de itens:", itemsError.message);
      setItemAggMap({});
      return;
    }

    const map: Record<string, OrderItemAgg> = {};
    for (const row of itemsData ?? []) {
      const orderId = String((row as any).order_id || "");
      if (!orderId) continue;

      if (!map[orderId]) {
        map[orderId] = {
          order_id: orderId,
          lines: 0,
          qty_total: 0,
          value_total: 0,
        };
      }

      map[orderId].lines += 1;
      map[orderId].qty_total += Number((row as any).qty ?? 0);
      map[orderId].value_total +=
        Number((row as any).qty ?? 0) * Number((row as any).unit_cost ?? 0);
    }

    setItemAggMap(map);
  }

  async function updateOrder(
    orderId: string,
    patch: Partial<OrderRow>,
    successMessage?: string
  ) {
    setSavingId(orderId);
    setMsg("");

    const { error } = await supabase.from("orders").update(patch).eq("id", orderId);

    if (error) {
      setMsg(error.message);
      setSavingId(null);
      return;
    }

    const nextStatus = patch.logistic_status ?? null;

    if (nextStatus === "ENTREGUE") {
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setItemAggMap((prev) => {
        const copy = { ...prev };
        delete copy[orderId];
        return copy;
      });
    } else {
      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId
            ? {
                ...order,
                ...patch,
              }
            : order
        )
      );
    }

    setSavingId(null);
    if (successMessage) setMsg(successMessage);
  }

  async function openDeliveryFlow(order: OrderRow) {
    setSavingId(order.id);
    setMsg("");

    try {
      if (order.delivery_mode === "RETIRADA") {
        router.push(`/adm/logistica/${order.id}`);
        return;
      }

      const currentStatus = order.logistic_status ?? "RECEBIDO";

      if (currentStatus === "RECEBIDO") {
        const { error } = await supabase
          .from("orders")
          .update({ logistic_status: "EM_SEPARACAO" })
          .eq("id", order.id);

        if (error) {
          setMsg(error.message);
          return;
        }

        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id ? { ...o, logistic_status: "EM_SEPARACAO" } : o
          )
        );
      }

      router.push(`/adm/logistica/${order.id}?mode=dispatch`);
    } finally {
      setSavingId(null);
    }
  }

  async function handlePrintOrder(order: OrderRow) {
    setPrintingId(order.id);
    setMsg("");

    try {
      let storeInfo: PrintStoreInfo | null = null;

      if (order.store_id) {
        const { data: storeData, error: storeError } = await supabase
          .from("stores")
          .select(
            "id,name,legal_name,cnpj,ie,ind_ie_dest,email_nf,phone_nf,address_zip,address_street,address_number,address_complement,address_neighborhood,city,state"
          )
          .eq("id", order.store_id)
          .maybeSingle();

        if (storeError) {
          throw new Error(storeError.message);
        }

        storeInfo = (storeData ?? null) as PrintStoreInfo | null;
      }

      const { data: itemsData, error: itemsError } = await supabase
        .from("order_items")
        .select(
          "id,qty,unit,unit_cost,product_id, products:products (sku,name,unit)"
        )
        .eq("order_id", order.id);

      if (itemsError) {
        throw new Error(itemsError.message);
      }

      const items: PrintItemRow[] = (itemsData ?? []).map((row: any) => {
        const raw = row?.products;
        const prod: PrintProductEmbed | null = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;

        return {
          id: row.id,
          qty: Number(row.qty ?? 0),
          unit: row.unit ?? null,
          unit_cost: row.unit_cost ?? null,
          product_id: row.product_id,
          products: prod,
        };
      });

      const totalItens = items.reduce((acc, item) => {
        return acc + Number(item.qty ?? 0) * Number(item.unit_cost ?? 0);
      }, 0);

      const frete = order.delivery_mode === "FRETE" ? Number(order.freight_fee ?? 0) : 0;
      const creditApplied = Number(order.credit_applied ?? 0);
      const totalLiquido = Math.max(totalItens + frete - creditApplied, 0);

      setPrintPayload({
        order,
        storeInfo,
        items,
        totalItens,
        frete,
        creditApplied,
        totalLiquido,
      });

      setPrintMode(true);
      setTimeout(() => window.print(), 80);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao preparar impressão do pedido.";
      setMsg(message);
      setPrintMode(false);
    } finally {
      setPrintingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = todayYMD();

    const result = orders.filter((order) => {
      const storeName = (order.stores?.name || "").toLowerCase();

      const matchText =
        !q || order.id.toLowerCase().includes(q) || storeName.includes(q);

      const matchLogistic =
        filterLogistic === "all"
          ? true
          : (order.logistic_status ?? "RECEBIDO") === filterLogistic;

      const matchDeliveryMode =
        filterDeliveryMode === "all"
          ? true
          : (order.delivery_mode ?? "") === filterDeliveryMode;

      const forecast = order.delivery_forecast ?? "";
      const matchForecast =
        filterForecast === "all"
          ? true
          : filterForecast === "today"
          ? forecast === today
          : filterForecast === "late"
          ? !!forecast && forecast < today
          : filterForecast === "empty"
          ? !forecast
          : true;

      return matchText && matchLogistic && matchDeliveryMode && matchForecast;
    });

    return result.sort(sortOrdersForExpedition);
  }, [orders, search, filterLogistic, filterDeliveryMode, filterForecast]);

  const counts = useMemo(() => {
    const today = todayYMD();

    return {
      total: filtered.length,
      recebido: filtered.filter((o) => (o.logistic_status ?? "RECEBIDO") === "RECEBIDO").length,
      separacao: filtered.filter((o) => o.logistic_status === "EM_SEPARACAO").length,
      rota: filtered.filter((o) => o.logistic_status === "SAIU_PARA_ENTREGA").length,
      hoje: filtered.filter((o) => o.delivery_forecast === today).length,
      atrasados: filtered.filter((o) => !!o.delivery_forecast && o.delivery_forecast < today)
        .length,
    };
  }, [filtered]);

  return (
    <div className="space-y-5">
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
        }
      `}</style>

      <PageHeader
        title="Expedição"
        subtitle="Fila operacional simples, rápida e pensada para uso no celular"
        right={
          <div className="flex flex-wrap gap-2">
            <SecondaryActionButton onClick={() => router.push("/adm/expedicao/mapa-separacao")}>
              Mapa de separação
            </SecondaryActionButton>
            <SecondaryActionButton onClick={loadOrders}>Atualizar</SecondaryActionButton>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm text-slate-700 whitespace-pre-wrap">{msg}</div>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryBox title="Fila" value={String(counts.total)} />
        <SummaryBox title="Recebidos" value={String(counts.recebido)} />
        <SummaryBox title="Separação" value={String(counts.separacao)} />
        <SummaryBox title="Em rota" value={String(counts.rota)} />
        <SummaryBox title="Hoje" value={String(counts.hoje)} />
        <SummaryBox title="Atrasados" value={String(counts.atrasados)} />
      </div>

      <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input
            label="Buscar"
            placeholder="Pedido ou loja"
            value={search}
            onChange={setSearch}
          />

          <Select
            label="Status logístico"
            value={filterLogistic}
            onChange={setFilterLogistic}
            options={[
              { value: "all", label: "Todos" },
              { value: "RECEBIDO", label: "Recebido" },
              { value: "EM_SEPARACAO", label: "Em separação" },
              { value: "SAIU_PARA_ENTREGA", label: "Saiu para entrega" },
            ]}
          />

          <Select
            label="Entrega"
            value={filterDeliveryMode}
            onChange={setFilterDeliveryMode}
            options={[
              { value: "all", label: "Todas" },
              { value: "FRETE", label: "Frete" },
              { value: "RETIRADA", label: "Retirada" },
            ]}
          />

          <Select
            label="Previsão"
            value={filterForecast}
            onChange={setFilterForecast}
            options={[
              { value: "all", label: "Todas" },
              { value: "today", label: "Hoje" },
              { value: "late", label: "Atrasadas" },
              { value: "empty", label: "Sem previsão" },
            ]}
          />
        </div>
      </div>

      {loading ? (
        <Card>Carregando...</Card>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="text-sm text-slate-600">
            Nenhum pedido pendente na fila de expedição.
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((order) => {
            const currentStatus = order.logistic_status ?? "RECEBIDO";
            const saving = savingId === order.id;
            const printing = printingId === order.id;
            const agg = itemAggMap[order.id];
            const today = todayYMD();
            const forecastLate =
              !!order.delivery_forecast &&
              order.delivery_forecast < today &&
              currentStatus !== "ENTREGUE";
            const forecastToday = order.delivery_forecast === today;

            return (
              <div
                key={order.id}
                className={[
                  "rounded-[26px] border bg-white p-4 shadow-sm",
                  forecastLate
                    ? "border-red-200"
                    : forecastToday
                    ? "border-cyan-200"
                    : "border-slate-200",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 break-all">
                      Pedido {order.id}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {order.stores?.name || "Loja não identificada"}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <Badge tone={logisticTone(currentStatus)}>
                      {logisticLabel(currentStatus)}
                    </Badge>

                    {forecastLate ? (
                      <Badge tone="red">Atrasado</Badge>
                    ) : forecastToday ? (
                      <Badge tone="blue">Hoje</Badge>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-[18px] bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Criado
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {fmtDT(order.created_at)}
                    </div>
                  </div>

                  <div className="rounded-[18px] bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Aprovado
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {fmtDT(order.approved_at)}
                    </div>
                  </div>

                  <div className="rounded-[18px] bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Tipo entrega
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {deliveryModeLabel(order.delivery_mode)}
                    </div>
                  </div>

                  <div className="rounded-[18px] bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Frete
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {fmtBRL(order.freight_fee)}
                    </div>
                  </div>

                  <div className="rounded-[18px] bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Itens
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {agg?.lines ?? 0} linha(s)
                    </div>
                  </div>

                  <div className="rounded-[18px] bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Quantidade
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {Number(agg?.qty_total ?? 0).toLocaleString("pt-BR")}
                    </div>
                  </div>

                  <div className="rounded-[18px] bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Valor produtos
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {fmtBRL(agg?.value_total ?? 0)}
                    </div>
                  </div>

                  <div className="rounded-[18px] bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Pagamento
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {order.is_paid ? "Pago" : "Pendente"} • {paymentLabel(order.payment_method)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  <Select
                    label="Status da expedição"
                    value={currentStatus}
                    onChange={(v) =>
                      updateOrder(
                        order.id,
                        { logistic_status: v as UnifiedLogisticStatus },
                        "Status logístico atualizado."
                      )
                    }
                    options={LOGISTIC_OPTIONS.filter((o) => o.value !== "ENTREGUE")}
                  />

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Previsão de entrega
                    </label>
                    <input
                      type="date"
                      value={order.delivery_forecast ?? ""}
                      onChange={(e) =>
                        updateOrder(
                          order.id,
                          { delivery_forecast: e.target.value || null },
                          "Previsão de entrega atualizada."
                        )
                      }
                      disabled={saving}
                      className="h-11 w-full rounded-[18px] border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-300 disabled:bg-slate-50"
                    />
                    <div className="mt-2 text-xs text-slate-500">
                      Atual: {fmtDate(order.delivery_forecast)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-[18px] border border-cyan-100 bg-cyan-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
                    Fluxo rápido de entrega
                  </div>
                  <div className="mt-1 text-sm text-cyan-900">
                    Ao tocar em <b>Sair para entrega</b>, abre uma tela curta para preencher
                    motorista, enviar o link de rastreio e concluir a saída.
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
                  <SecondaryActionButton
                    fullWidth
                    disabled={saving}
                    onClick={() => router.push(`/adm/expedicao/pedido/${order.id}`)}
                  >
                    Ver pedido
                  </SecondaryActionButton>

                  <SecondaryActionButton
                    fullWidth
                    disabled={saving || printing}
                    onClick={() => handlePrintOrder(order)}
                  >
                    {printing ? "Preparando..." : "Imprimir pedido"}
                  </SecondaryActionButton>

                  <SecondaryActionButton
                    fullWidth
                    disabled={saving}
                    onClick={() =>
                      updateOrder(
                        order.id,
                        { logistic_status: "RECEBIDO" },
                        "Pedido marcado como recebido."
                      )
                    }
                  >
                    Recebido
                  </SecondaryActionButton>

                  <PrimaryActionButton
                    tone="amber"
                    fullWidth
                    disabled={saving}
                    onClick={() =>
                      updateOrder(
                        order.id,
                        { logistic_status: "EM_SEPARACAO" },
                        "Pedido marcado como em separação."
                      )
                    }
                  >
                    Em separação
                  </PrimaryActionButton>

                  <PrimaryActionButton
                    fullWidth
                    disabled={saving || order.delivery_mode === "RETIRADA"}
                    onClick={() => openDeliveryFlow(order)}
                  >
                    Sair para entrega
                  </PrimaryActionButton>

                  <PrimaryActionButton
                    tone="green"
                    fullWidth
                    disabled={saving}
                    onClick={() =>
                      updateOrder(
                        order.id,
                        { logistic_status: "ENTREGUE" },
                        "Pedido marcado como entregue e removido da fila."
                      )
                    }
                  >
                    Entregue
                  </PrimaryActionButton>
                </div>

                {order.delivery_mode === "RETIRADA" ? (
                  <div className="mt-3 text-xs text-slate-500">
                    Pedido em retirada: a ação de rastreio/saída para entrega não se aplica.
                  </div>
                ) : null}

                {order.notes ? (
                  <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Observações
                    </div>
                    <div className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                      {order.notes}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div id="print-area" className={printMode ? "print-mode" : ""}>
        {printPayload ? (
          <div className="print-only">
            <div className="print-section">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="print-title">ESPELHO DO PEDIDO</div>
                  <div className="print-subtitle">
                    Documento interno para conferência operacional, financeira e logística
                  </div>
                </div>
                <div className="text-right">
                  <div className="print-label">Pedido</div>
                  <div className="print-value">{printPayload.order.id}</div>
                </div>
              </div>

              <div className="mt-3 print-grid-4">
                <div className="print-box">
                  <div className="print-label">Status</div>
                  <div className="print-value">{printPayload.order.status || "-"}</div>
                </div>
                <div className="print-box">
                  <div className="print-label">Status logístico</div>
                  <div className="print-value">
                    {logisticLabel(printPayload.order.logistic_status)}
                  </div>
                </div>
                <div className="print-box">
                  <div className="print-label">Pagamento</div>
                  <div className="print-value">
                    {printPayload.order.is_paid ? "Pago" : "Pendente"}
                  </div>
                </div>
                <div className="print-box">
                  <div className="print-label">Forma / Entrega</div>
                  <div className="print-value">
                    {paymentLabel(printPayload.order.payment_method)} /{" "}
                    {deliveryModeLabel(printPayload.order.delivery_mode)}
                  </div>
                </div>
              </div>
            </div>

            <div className="print-section">
              <div className="print-grid-2">
                <div>
                  <div className="print-label">Destinatário / Loja</div>
                  <div className="print-value">
                    {printPayload.storeInfo?.name || printPayload.order.stores?.name || "-"}
                  </div>

                  <div className="mt-2 print-label">Razão social</div>
                  <div className="print-value">{printPayload.storeInfo?.legal_name || "-"}</div>

                  <div className="mt-2 print-label">CNPJ / IE</div>
                  <div className="print-value">
                    {fmtCNPJ(printPayload.storeInfo?.cnpj)}{" "}
                    {printPayload.storeInfo?.ie ? ` • IE ${printPayload.storeInfo.ie}` : ""}
                  </div>
                </div>

                <div>
                  <div className="print-label">Endereço</div>
                  <div className="print-value">
                    {[
                      printPayload.storeInfo?.address_street,
                      printPayload.storeInfo?.address_number,
                      printPayload.storeInfo?.address_complement,
                      printPayload.storeInfo?.address_neighborhood,
                      printPayload.storeInfo?.city,
                      printPayload.storeInfo?.state,
                      printPayload.storeInfo?.address_zip
                        ? `CEP ${printPayload.storeInfo.address_zip}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(", ") || "-"}
                  </div>

                  <div className="mt-2 print-label">Contato NF-e</div>
                  <div className="print-value">
                    {[printPayload.storeInfo?.email_nf, printPayload.storeInfo?.phone_nf]
                      .filter(Boolean)
                      .join(" • ") || "-"}
                  </div>
                </div>
              </div>
            </div>

            <div className="print-section">
              <table className="print-table">
                <thead>
                  <tr>
                    <th style={{ width: "12%" }}>SKU</th>
                    <th style={{ width: "34%" }}>Produto</th>
                    <th style={{ width: "8%" }}>Unid.</th>
                    <th style={{ width: "11%" }}>Preço</th>
                    <th style={{ width: "8%" }}>Qtd</th>
                    <th style={{ width: "13%" }}>Qtd/Caixa</th>
                    <th style={{ width: "14%" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {printPayload.items.map((item) => {
                    const sku = item.products?.sku ?? "-";
                    const name = item.products?.name ?? "-";
                    const unit = item.products?.unit ?? item.unit ?? "-";
                    const unitCost = Number(item.unit_cost ?? 0);
                    const qtyNum = Number(item.qty ?? 0);
                    const line = qtyNum * unitCost;

                    const pack = getPackInfo(name);
                    const packsQty = pack ? ceilPacks(qtyNum, pack) : null;

                    return (
                      <tr key={item.id}>
                        <td>{sku}</td>
                        <td>{name}</td>
                        <td>{unit}</td>
                        <td>{fmtBRL(unitCost)}</td>
                        <td>{fmtNumBR(qtyNum)}</td>
                        <td>
                          {!pack
                            ? "-"
                            : `${packBaseText(pack)} • ${pack.packLabel.toUpperCase()}: ${fmtNumBR(
                                packsQty ?? 0
                              )}`}
                        </td>
                        <td>{fmtBRL(line)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="print-section">
              <div className="print-grid-4">
                <div className="print-total-box">
                  <div className="print-total-label">Itens</div>
                  <div className="print-total-value">{fmtBRL(printPayload.totalItens)}</div>
                </div>
                <div className="print-total-box">
                  <div className="print-total-label">Frete</div>
                  <div className="print-total-value">{fmtBRL(printPayload.frete)}</div>
                </div>
                <div className="print-total-box">
                  <div className="print-total-label">Crédito abatido</div>
                  <div className="print-total-value">- {fmtBRL(printPayload.creditApplied)}</div>
                </div>
                <div className="print-total-box">
                  <div className="print-total-label">Total líquido</div>
                  <div className="print-total-value">{fmtBRL(printPayload.totalLiquido)}</div>
                </div>
              </div>
            </div>

            <div className="print-section">
              <div className="print-grid-3">
                <div className="print-box">
                  <div className="print-label">Criado em</div>
                  <div className="print-value">{fmtDT(printPayload.order.created_at)}</div>
                </div>
                <div className="print-box">
                  <div className="print-label">Enviado em</div>
                  <div className="print-value">{fmtDT(printPayload.order.submitted_at)}</div>
                </div>
                <div className="print-box">
                  <div className="print-label">Aprovado em</div>
                  <div className="print-value">{fmtDT(printPayload.order.approved_at)}</div>
                </div>
                <div className="print-box">
                  <div className="print-label">Data de vencimento</div>
                  <div className="print-value">-</div>
                </div>
                <div className="print-box">
                  <div className="print-label">Previsão de entrega</div>
                  <div className="print-value">
                    {printPayload.order.delivery_forecast || "-"}
                  </div>
                </div>
                <div className="print-box">
                  <div className="print-label">Pago em</div>
                  <div className="print-value">{fmtDT(printPayload.order.paid_at)}</div>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <div className="print-label">Observações</div>
                <div className="print-note-box">{printPayload.order.notes || "-"}</div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}