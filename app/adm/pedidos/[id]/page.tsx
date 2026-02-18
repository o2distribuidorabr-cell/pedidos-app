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

  due_date: string | null; // DATE => "YYYY-MM-DD"

  // ✅ NOVO: previsão de entrega (DATE => "YYYY-MM-DD")
  delivery_forecast: string | null;

  // ✅ Auditoria
  edited_by_admin: boolean | null;
  edited_at: string | null;
  original_items: any[] | null;
};

type StoreInfo = {
  id: string;
  name: string | null;

  // (se existirem no seu schema)
  legal_name?: string | null;
  cnpj?: string | null;

  address_zip?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;

  city?: string | null;
  state?: string | null;
};

type ProductEmbed = { sku: string | null; name: string | null; unit: string | null };

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

function fmtYMD(ymd: string | null | undefined) {
  if (!ymd) return "-";
  try {
    // input "YYYY-MM-DD"
    const [y, m, d] = ymd.split("-").map(Number);
    if (!y || !m || !d) return ymd;
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    return dt.toLocaleDateString("pt-BR");
  } catch {
    return String(ymd);
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

/** ✅ NOVO (apenas helpers): regras de caixa/pct/rolo/etc */
type PackInfo = {
  perPack?: number; // ex.: 120 (u por cx)
  perPackKg?: number; // ex.: 3.5 (kg por balde)
  packLabel: string; // ex.: "cx" | "pct" | "rolo" | "balde" | "frasco" | "fardo"
  unitLabel: string; // ex.: "u" | "kg"
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

  // ✅ Ajuste: Etiqueta (aceita "Etiqueta de identificação", "Etiqueta identificação", etc.)
  { match: "etiqueta de identificacao", info: { perPack: 1000, packLabel: "rolo", unitLabel: "u" } },
  { match: "etiqueta identificacao", info: { perPack: 1000, packLabel: "rolo", unitLabel: "u" } },
  { match: "etiqueta identific", info: { perPack: 1000, packLabel: "rolo", unitLabel: "u" } },

  // ✅ Ajuste: Molho American Burger (3,5kg por balde)
  { match: "molho american burger", info: { perPackKg: 3.5, packLabel: "balde", unitLabel: "kg" } },
  { match: "molho american", info: { perPackKg: 3.5, packLabel: "balde", unitLabel: "kg" } },

  // ✅ Ajuste: Molho Barbecue com Whisky (0,397kg por frasco)
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
  // 2 casas quando precisa, senão inteiro
  const rounded = Math.round((v + Number.EPSILON) * 100) / 100;
  const isInt = Math.abs(rounded - Math.round(rounded)) < 1e-9;
  return isInt
    ? String(Math.round(rounded))
    : rounded.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function ceilPacks(qty: number, pack: PackInfo) {
  const q = Number(qty) || 0;

  if (pack.perPackKg && pack.perPackKg > 0) {
    return Math.ceil(q / pack.perPackKg);
  }
  if (pack.perPack && pack.perPack > 0) {
    return Math.ceil(q / pack.perPack);
  }
  return 0;
}

function packBaseText(pack: PackInfo) {
  if (pack.perPackKg && pack.perPackKg > 0) return `${fmtNumBR(pack.perPackKg)}${pack.unitLabel}/${pack.packLabel}`;
  if (pack.perPack && pack.perPack > 0) return `${fmtNumBR(pack.perPack)}${pack.unitLabel}/${pack.packLabel}`;
  return `-${pack.unitLabel}/${pack.packLabel}`;
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

  // ✅ DANFE print
  const [printMode, setPrintMode] = useState(false);
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);

  // ✅ auditoria visível
  const [originalItems, setOriginalItems] = useState<OriginalItem[] | null>(null);

  // ✅ edição
  const [itemEdits, setItemEdits] = useState<Record<string, ItemEdit>>({});

  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState<string>("");
  const [creditNote, setCreditNote] = useState<string>("");

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

  // ✅ NOVO: atraso da previsão (somente se não entregue)
  const forecastOverdue = useMemo(() => {
    if (!order?.delivery_forecast) return false;
    if ((order.logistic_status ?? null) === "ENTREGUE") return false;
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

  // inicializa rascunho ao entrar no modo edição
  useEffect(() => {
    if (!editMode) return;

    const draft: Record<string, ItemEdit> = {};
    for (const it of items) {
      draft[it.id] = { qty: String(it.qty ?? 0), removed: false };
    }
    setItemEdits(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, order?.id]);

  // ✅ restaura UI após impressão
  useEffect(() => {
    const onAfterPrint = () => setPrintMode(false);
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);

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
    // mantém resiliente: se alguma coluna não existir no seu schema, ajuste aqui.
    const { data, error } = await supabase
      .from("stores")
      .select("id,name,legal_name,cnpj,address_zip,address_street,address_number,address_complement,address_neighborhood,city,state")
      .eq("id", storeId)
      .maybeSingle();

    if (error) {
      // não derruba a página
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
      return;
    }

    const ord = o as OrderRow;
    setOrder(ord);

    // ✅ snapshot original
    const snap = (ord.original_items ?? null) as OriginalItem[] | null;
    setOriginalItems(snap);

    if (ord.store_id) {
      await Promise.all([loadCreditBalance(ord.store_id), loadStoreInfo(ord.store_id)]);
    } else {
      setCreditBalance(0);
      setStoreInfo(null);
    }

    const { data: it, error: itErr } = await supabase
      .from("order_items")
      .select("id,qty,unit,unit_cost,product_id, products:products (sku,name,unit)")
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

  // ✅ AJUSTE AQUI:
  // - Ao desmarcar pago, NÃO apagar payment_method.
  // - Ao marcar pago, mantém a forma atual (ou PIX como padrão).
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

  // ✅ Salvar via RPC (já está funcionando no seu ambiente)
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
    // deixa DANFE visível só no print (via CSS) e chama print
    setPrintMode(true);
    setTimeout(() => window.print(), 50);
  }

  if (loading) return <Card>Carregando...</Card>;

  if (!order) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Pedido"
          subtitle="Não foi possível carregar"
          right={
            <Button variant="secondary" onClick={() => router.push("/adm/pedidos")}>
              Voltar
            </Button>
          }
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

    // ✅ NOVO: calcula caixa/pct/rolo/balde/frasco
    const pack = getPackInfo(name);
    const packsQty = pack ? ceilPacks(qtyNum, pack) : null;

    const packCell = !pack ? (
      <span className="text-slate-500">-</span>
    ) : (
      <div className="leading-tight">
        <div className="text-slate-800 font-semibold">{packBaseText(pack)}</div>
        <div className="text-xs text-slate-500">
          {pack.packLabel.toUpperCase()}: {fmtNumBR(packsQty ?? 0)}
        </div>
      </div>
    );

    if (!editMode) {
      return [
        <span key="sku" className="font-mono text-xs">
          {sku}
        </span>,
        <span key="name" className="text-slate-900">
          {name}
        </span>,
        <span key="unit" className="text-slate-700">
          {unit}
        </span>,
        <span key="price" className="font-semibold">
          {fmtBRL(unitCost)}
        </span>,
        <span key="qty" className="font-semibold">
          {it.qty}
        </span>,

        // ✅ NOVO (1 coluna)
        <div key="pack">{packCell}</div>,

        <span key="total" className="font-semibold">
          {fmtBRL(line)}
        </span>,
      ];
    }

    return [
      <span key="sku" className="font-mono text-xs">
        {sku}
      </span>,
      <span key="name" className="text-slate-900">
        <div className="flex items-center gap-2">
          <span>{name}</span>
          {removed ? <Badge tone="red">Removido</Badge> : null}
        </div>
      </span>,
      <span key="unit" className="text-slate-700">
        {unit}
      </span>,
      <span key="price" className="font-semibold">
        {fmtBRL(unitCost)}
      </span>,
      <div key="qty" className="flex items-center gap-2">
        <input
          className="w-24 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-slate-300 disabled:bg-slate-50"
          type="number"
          value={qtyStr}
          disabled={saving || lockedByLogistics || removed}
          onChange={(e) => setItemQty(it.id, e.target.value)}
          min={0}
          step={1}
        />
        <Button
          variant={removed ? "secondary" : "danger"}
          disabled={saving || lockedByLogistics}
          onClick={() => toggleRemoveItem(it.id)}
        >
          {removed ? "Desfazer" : "Remover"}
        </Button>
      </div>,

      // ✅ NOVO (1 coluna)
      <div key="pack">{packCell}</div>,

      <span key="total" className="font-semibold">
        {fmtBRL(line)}
      </span>,
    ];
  });

  const originalRows =
    originalItems?.map((it) => {
      const unitCost = Number(it.unit_cost ?? 0);
      const line = Number(it.qty ?? 0) * unitCost;

      // ✅ NOVO: calcula caixa/pct/rolo no snapshot original
      const name = it.name ?? "-";
      const pack = getPackInfo(name);
      const qtyNum = Number(it.qty ?? 0);
      const packsQty = pack ? ceilPacks(qtyNum, pack) : null;

      const packCell = !pack ? (
        <span className="text-slate-500">-</span>
      ) : (
        <div className="leading-tight">
          <div className="text-slate-800 font-semibold">{packBaseText(pack)}</div>
          <div className="text-xs text-slate-500">
            {pack.packLabel.toUpperCase()}: {fmtNumBR(packsQty ?? 0)}
          </div>
        </div>
      );

      return [
        <span key="sku" className="font-mono text-xs">
          {it.sku ?? "-"}
        </span>,
        <span key="name" className="text-slate-900">
          {it.name ?? "-"}
        </span>,
        <span key="unit" className="text-slate-700">
          {it.product_unit ?? it.unit ?? "-"}
        </span>,
        <span key="price" className="font-semibold">
          {fmtBRL(unitCost)}
        </span>,
        <span key="qty" className="font-semibold">
          {it.qty}
        </span>,

        // ✅ NOVO (1 coluna)
        <div key="pack">{packCell}</div>,

        <span key="total" className="font-semibold">
          {fmtBRL(line)}
        </span>,
      ];
    }) ?? [];

  // ✅ dados para impressão (DANFE-like)
  const s = storeInfo;
  const emitName = "O2 Distribuidora";
  const emitDoc = "-";
  const emitAddr = "-";

  const destName = s?.name ?? "-";
  const destLegal = s?.legal_name ?? null;
  const destCnpj = s?.cnpj ?? null;
  const destZip = s?.address_zip ?? null;
  const destStreet = s?.address_street ?? null;
  const destNumber = s?.address_number ?? null;
  const destComp = s?.address_complement ?? null;
  const destNeigh = s?.address_neighborhood ?? null;
  const destCity = s?.city ?? null;
  const destState = s?.state ?? null;

  const destAddrLine1 = [destStreet, destNumber ? `nº ${destNumber}` : null, destComp ? `(${destComp})` : null]
    .filter(Boolean)
    .join(", ");
  const destAddrLine2 = [
    destNeigh,
    destCity ? `${destCity}${destState ? `/${destState}` : ""}` : null,
    destZip ? `CEP ${destZip}` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  const entregaTxt = order.delivery_mode === "FRETE" ? "FRETE" : "RETIRADA";
  const logTxt =
    order.logistic_status === "RECEBIDO"
      ? "RECEBIDO"
      : order.logistic_status === "EM_SEPARACAO"
      ? "EM SEPARAÇÃO"
      : order.logistic_status === "ENTREGUE"
      ? "ENTREGUE"
      : "-";

  return (
    <div className="space-y-6">
      {/* ✅ CSS somente para impressão (não altera o restante da UI) */}
      <style jsx global>{`
        #print-danfe {
          display: none;
        }
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          /* esconde tudo */
          body * {
            visibility: hidden !important;
          }
          /* mostra só DANFE */
          #print-danfe,
          #print-danfe * {
            visibility: visible !important;
          }
          #print-danfe {
            display: block !important;
            position: fixed;
            left: 0;
            top: 0;
            width: 100%;
            padding: 12mm;
            background: #fff;
            color: #111;
          }
          .danfe-box {
            border: 1px solid #111;
          }
          .danfe-row {
            display: grid;
            gap: 0;
          }
          .danfe-cell {
            border-right: 1px solid #111;
            border-bottom: 1px solid #111;
            padding: 6px 8px;
            font-size: 11px;
            line-height: 1.25;
          }
          .danfe-cell:last-child {
            border-right: 0;
          }
          .danfe-title {
            font-weight: 700;
            font-size: 12px;
            text-transform: uppercase;
          }
          .danfe-muted {
            color: #444;
          }
          .danfe-kv {
            display: grid;
            grid-template-columns: 1fr;
            gap: 2px;
          }
          .danfe-k {
            font-size: 10px;
            text-transform: uppercase;
          }
          .danfe-v {
            font-size: 12px;
            font-weight: 700;
          }
          table.danfe-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
          }
          table.danfe-table th,
          table.danfe-table td {
            border: 1px solid #111;
            padding: 6px 6px;
            vertical-align: top;
          }
          table.danfe-table th {
            font-size: 10px;
            text-transform: uppercase;
            background: #f3f3f3;
          }
          .danfe-right {
            text-align: right;
          }
          .danfe-center {
            text-align: center;
          }
          .danfe-big {
            font-size: 16px;
            font-weight: 800;
          }
        }
      `}</style>

      {/* ✅ Área de impressão DANFE-like */}
      <div id="print-danfe" aria-hidden={!printMode}>
        <div className="danfe-box">
          {/* Cabeçalho */}
          <div className="danfe-row" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
            <div className="danfe-cell">
              <div className="danfe-title">Documento Auxiliar - Pedido</div>
              <div className="danfe-muted" style={{ marginTop: 2 }}>
                Layout estilo DANFE (informativo)
              </div>
              <div style={{ marginTop: 8 }}>
                <div className="danfe-k">Emitente</div>
                <div className="danfe-v">{emitName}</div>
                <div className="danfe-muted">{emitDoc}</div>
                <div className="danfe-muted">{emitAddr}</div>
              </div>
            </div>

            <div className="danfe-cell">
              <div className="danfe-kv">
                <div className="danfe-k">Número do pedido</div>
                <div className="danfe-v" style={{ wordBreak: "break-all" }}>
                  {order.id}
                </div>
              </div>
              <div className="danfe-kv" style={{ marginTop: 8 }}>
                <div className="danfe-k">Emissão</div>
                <div className="danfe-v">{fmtDT(order.created_at)}</div>
              </div>
            </div>

            <div className="danfe-cell">
              <div className="danfe-kv">
                <div className="danfe-k">Status</div>
                <div className="danfe-v">{String(order.status ?? "-").toUpperCase()}</div>
              </div>
              <div className="danfe-kv" style={{ marginTop: 8 }}>
                <div className="danfe-k">Operação</div>
                <div className="danfe-v">{logTxt}</div>
              </div>
            </div>
          </div>

          {/* Destinatário + Entrega/Pagamento */}
          <div className="danfe-row" style={{ gridTemplateColumns: "2fr 1fr" }}>
            <div className="danfe-cell">
              <div className="danfe-title">Destinatário</div>
              <div style={{ marginTop: 6 }}>
                <div className="danfe-v">{destLegal ?? destName}</div>
                <div className="danfe-muted">{destLegal ? destName : ""}</div>
                <div className="danfe-muted">CNPJ: {fmtCNPJ(destCnpj)}</div>
                <div className="danfe-muted">{destAddrLine1 || "-"}</div>
                <div className="danfe-muted">{destAddrLine2 || "-"}</div>
              </div>
            </div>

            <div className="danfe-cell">
              <div className="danfe-title">Entrega / Pagamento</div>

              <div className="danfe-kv" style={{ marginTop: 6 }}>
                <div className="danfe-k">Modalidade</div>
                <div className="danfe-v">{entregaTxt}</div>
              </div>

              <div className="danfe-kv" style={{ marginTop: 6 }}>
                <div className="danfe-k">Frete</div>
                <div className="danfe-v">{order.delivery_mode === "FRETE" ? fmtBRL(Number(order.freight_fee ?? 0)) : "-"}</div>
              </div>

              <div className="danfe-kv" style={{ marginTop: 6 }}>
                <div className="danfe-k">Previsão de entrega</div>
                <div className="danfe-v">{fmtYMD(order.delivery_forecast)}</div>
              </div>

              <div className="danfe-kv" style={{ marginTop: 6 }}>
                <div className="danfe-k">Forma</div>
                <div className="danfe-v">{order.payment_method ?? "-"}</div>
              </div>

              <div className="danfe-kv" style={{ marginTop: 6 }}>
                <div className="danfe-k">Vencimento</div>
                <div className="danfe-v">{fmtYMD(order.due_date)}</div>
              </div>

              <div className="danfe-kv" style={{ marginTop: 6 }}>
                <div className="danfe-k">Pago</div>
                <div className="danfe-v">{order.is_paid ? `SIM (${fmtDT(order.paid_at)})` : "NÃO"}</div>
              </div>
            </div>
          </div>

          {/* Itens */}
          <div className="danfe-cell" style={{ borderRight: 0 }}>
            <div className="danfe-title">Itens</div>
            <div style={{ marginTop: 8 }}>
              <table className="danfe-table">
                <thead>
                  <tr>
                    <th className="danfe-center" style={{ width: 40 }}>
                      #
                    </th>
                    <th style={{ width: 110 }}>SKU</th>
                    <th>Descrição</th>
                    <th className="danfe-center" style={{ width: 70 }}>
                      Unid.
                    </th>
                    <th className="danfe-right" style={{ width: 70 }}>
                      Qtd
                    </th>

                    {/* ✅ NOVO: coluna na impressão */}
                    <th className="danfe-center" style={{ width: 110 }}>
                      Qtd/Caixa
                    </th>

                    <th className="danfe-right" style={{ width: 110 }}>
                      Vlr Unit.
                    </th>
                    <th className="danfe-right" style={{ width: 110 }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const sku = it.products?.sku ?? "-";
                    const name = it.products?.name ?? "-";
                    const unit = it.products?.unit ?? it.unit ?? "-";
                    const unitCost = Number(it.unit_cost ?? 0);
                    const qty = Number(it.qty ?? 0);
                    const line = qty * unitCost;

                    const pack = getPackInfo(name);
                    const packsQty = pack ? ceilPacks(qty, pack) : null;

                    return (
                      <tr key={it.id}>
                        <td className="danfe-center">{idx + 1}</td>
                        <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>{sku}</td>
                        <td>{name}</td>
                        <td className="danfe-center">{unit}</td>
                        <td className="danfe-right">{qty}</td>

                        {/* ✅ NOVO */}
                        <td className="danfe-center">
                          {!pack ? (
                            "-"
                          ) : (
                            <div style={{ lineHeight: 1.15 }}>
                              <div>{packBaseText(pack)}</div>
                              <div style={{ fontSize: 10, color: "#444" }}>
                                {pack.packLabel.toUpperCase()}: {fmtNumBR(packsQty ?? 0)}
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="danfe-right">{fmtBRL(unitCost)}</td>
                        <td className="danfe-right">{fmtBRL(line)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totais */}
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
              <div>
                <div className="danfe-title">Observações</div>
                <div className="danfe-muted" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                  {order.notes ?? "-"}
                </div>
                <div className="danfe-muted" style={{ marginTop: 8 }}>
                  Criado: {fmtDT(order.created_at)} • Enviado: {fmtDT(order.submitted_at)} • Aprovado: {fmtDT(order.approved_at)}
                </div>
              </div>

              <div>
                <table className="danfe-table">
                  <tbody>
                    <tr>
                      <th style={{ width: "60%" }}>Subtotal itens</th>
                      <td className="danfe-right">{fmtBRL(totalItens)}</td>
                    </tr>
                    <tr>
                      <th>Frete</th>
                      <td className="danfe-right">{fmtBRL(frete)}</td>
                    </tr>
                    <tr>
                      <th>Total bruto</th>
                      <td className="danfe-right">{fmtBRL(totalComFrete)}</td>
                    </tr>
                    <tr>
                      <th>Crédito abatido</th>
                      <td className="danfe-right">- {fmtBRL(creditApplied)}</td>
                    </tr>
                    <tr>
                      <th className="danfe-big">Total líquido</th>
                      <td className="danfe-right danfe-big">{fmtBRL(totalLiquido)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="danfe-muted" style={{ marginTop: 10, fontSize: 10 }}>
              Documento informativo para conferência/expedição (não é NF-e).
            </div>
          </div>
        </div>
      </div>

      <PageHeader
        title="Detalhe do pedido"
        subtitle={`ID: ${order.id}`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            {edited ? <Badge tone="blue">EDITADO {order.edited_at ? `• ${fmtDT(order.edited_at)}` : ""}</Badge> : <Badge tone="neutral">ORIGINAL</Badge>}

            <Button variant="secondary" onClick={() => router.push("/adm/pedidos")}>
              Voltar
            </Button>
            <Button variant="secondary" onClick={() => loadAll(order.id)} disabled={saving}>
              Recarregar
            </Button>
            <Button variant="secondary" onClick={handlePrint}>
              Imprimir
            </Button>

            {!editMode ? (
              <Button variant="primary" onClick={() => router.push(`/adm/pedidos/${order.id}?edit=1`)} disabled={saving || lockedByLogistics}>
                Editar itens
              </Button>
            ) : (
              <>
                <Button variant="secondary" onClick={cancelEdits} disabled={saving}>
                  Cancelar
                </Button>
                <Button onClick={saveEdits} disabled={saving || lockedByLogistics}>
                  {saving ? "Salvando..." : "Salvar alterações"}
                </Button>
              </>
            )}

            <Button variant="danger" onClick={deleteThisOrder} disabled={saving}>
              Excluir
            </Button>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm text-red-600">{msg}</div>
        </Card>
      ) : null}

      <Card
        title="Vencimento"
        right={
          <div className="flex items-center gap-2">
            {order.due_date ? (overdue ? <Badge tone="red">Vencido</Badge> : <Badge tone="green">OK</Badge>) : <Badge tone="neutral">Sem vencimento</Badge>}
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Data de vencimento</label>
            <input
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300 disabled:bg-slate-50"
              type="date"
              value={order.due_date ?? ""}
              disabled={saving}
              onChange={(e) => updateOrder({ due_date: e.target.value || null })}
            />
          </div>
        </div>
      </Card>

      {/* ✅ NOVO: Previsão de entrega (mantendo o resto idêntico) */}
      <Card
        title="Previsão de entrega"
        right={
          <div className="flex items-center gap-2">
            {!order.delivery_forecast ? <Badge tone="neutral">Sem previsão</Badge> : forecastOverdue ? <Badge tone="red">Atrasado</Badge> : <Badge tone="green">OK</Badge>}
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Previsão de entrega</label>
            <input
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-300 disabled:bg-slate-50"
              type="date"
              value={order.delivery_forecast ?? ""}
              disabled={saving}
              onChange={(e) => updateOrder({ delivery_forecast: e.target.value || null })}
            />
          </div>
        </div>
      </Card>

      <Card
        title="Crédito da loja"
        right={
          <div className="flex items-center gap-3">
            <Badge tone="blue">Saldo: {fmtBRL(creditBalance)}</Badge>
            <Badge tone="neutral">Abatido: {fmtBRL(Number(order.credit_applied ?? 0))}</Badge>
            <Button onClick={openCreditModal} disabled={saving || creditBalance <= 0}>
              Abater crédito
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">Itens</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{fmtBRL(totalItens)}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">Frete</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{fmtBRL(frete)}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">Crédito abatido</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">- {fmtBRL(creditApplied)}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold text-slate-500">Total líquido</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{fmtBRL(totalLiquido)}</div>
          </div>
        </div>
      </Card>

      <Card title="Status, logística, entrega e pagamento" right={<Badge tone={statusBadgeTone(order.status) as any}>{order.status}</Badge>}>
        <div className="grid gap-4 md:grid-cols-3">
          <Select label="Status" value={order.status} onChange={(v) => updateOrder({ status: v })} options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))} />

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

          <Input label="Frete (R$)" value={String(Number(order.freight_fee ?? 0))} onChange={(v) => updateOrder({ freight_fee: Number(v) })} type="number" />

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-600">Pagamento</div>
            <Button variant={order.is_paid ? "secondary" : "primary"} onClick={onTogglePaid} disabled={saving}>
              {order.is_paid ? "Pago" : "Marcar como pago"}
            </Button>
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
      </Card>

      <Card title="Observações">
        <textarea
          className="w-full min-h-[110px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          value={order.notes ?? ""}
          disabled={saving}
          onChange={(e) => updateOrder({ notes: e.target.value })}
          placeholder="Observações do pedido..."
        />
        <div className="mt-3 text-xs text-slate-500">
          Criado: {fmtDT(order.created_at)} · Enviado: {fmtDT(order.submitted_at)} · Aprovado: {fmtDT(order.approved_at)}
        </div>
      </Card>

      <Card
        title="Itens do pedido (atual)"
        subtitle={editMode ? "Modo edição: ajuste quantidades e remova itens. Depois clique em Salvar alterações." : `${items.length} item(ns)`}
        right={lockedByLogistics ? <Badge tone="red">ENTREGUE (itens bloqueados)</Badge> : editMode ? <Badge tone="blue">EDITANDO</Badge> : null}
      >
        {/* ✅ NOVO: adiciona 1 coluna mantendo layout */}
        <Table headers={["SKU", "Produto", "Unid.", "Preço", "Qtd", "Qtd/Caixa", "Total"]} rows={itemsRows} />
      </Card>

      {originalItems && originalItems.length > 0 ? (
        <Card title="Pedido original do franqueado" subtitle={order.edited_at ? `Snapshot salvo em ${fmtDT(order.edited_at)}` : "Snapshot salvo"} right={<Badge tone="neutral">ORIGINAL</Badge>}>
          {/* ✅ NOVO: adiciona 1 coluna mantendo layout */}
          <Table headers={["SKU", "Produto", "Unid.", "Preço", "Qtd", "Qtd/Caixa", "Total"]} rows={originalRows} />
        </Card>
      ) : null}

      {creditModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={closeCreditModal}>
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-slate-900">Abater crédito</div>
                <div className="mt-1 text-xs text-slate-500">
                  Saldo: <b>{fmtBRL(creditBalance)}</b> · Já abatido: <b>{fmtBRL(creditApplied)}</b>
                </div>
              </div>
              <Button variant="secondary" onClick={closeCreditModal} disabled={saving}>
                Fechar
              </Button>
            </div>

            <div className="mt-4 grid gap-3">
              <Input label="Valor (opcional)" placeholder="Vazio = abater o máximo possível" value={creditAmount} onChange={setCreditAmount} />
              <Input label="Observação (opcional)" placeholder="Ex.: abatimento parcial" value={creditNote} onChange={setCreditNote} />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={applyCredit} disabled={saving}>
                {saving ? "Aplicando..." : "Aplicar crédito"}
              </Button>
            </div>

            <div className="mt-3 text-xs text-slate-500">Regra: abate até o limite do saldo e até o limite do total do pedido.</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}