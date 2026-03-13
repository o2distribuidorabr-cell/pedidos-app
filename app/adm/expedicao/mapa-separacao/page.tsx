"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";
import { PageHeader, Card, Input, Badge, Select } from "@/app/components/ui";

type OrderRow = {
  id: string;
  delivery_forecast: string | null;
  logistic_status: "RECEBIDO" | "EM_SEPARACAO" | "ENTREGUE" | null;
  stores?: {
    id: string;
    name: string | null;
  } | null;
};

type OrderItemRow = {
  order_id: string;
  qty: number;
  unit: string | null;
  products?: {
    id?: string | null;
    sku?: string | null;
    name?: string | null;
    unit?: string | null;
  } | null;
};

type PackInfo = {
  perPack?: number;
  perPackKg?: number;
  packLabel: string;
  unitLabel: string;
};

type SeparationAgg = {
  product_key: string;
  sku: string;
  name: string;
  unit: string;
  qty_total: number;
  packs_total: number | null;
  pack_label: string | null;
  pack_base_text: string | null;
  orders_count: number;
  stores_count: number;
};

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

function ceilPacks(qty: number, pack: PackInfo) {
  const q = Number(qty) || 0;
  if (pack.perPackKg && pack.perPackKg > 0) return Math.ceil(q / pack.perPackKg);
  if (pack.perPack && pack.perPack > 0) return Math.ceil(q / pack.perPack);
  return 0;
}

function packBaseText(pack: PackInfo) {
  if (pack.perPackKg && pack.perPackKg > 0) {
    return `${fmtNumBR(pack.perPackKg)}${pack.unitLabel}/${pack.packLabel}`;
  }
  if (pack.perPack && pack.perPack > 0) {
    return `${fmtNumBR(pack.perPack)}${pack.unitLabel}/${pack.packLabel}`;
  }
  return `-${pack.unitLabel}/${pack.packLabel}`;
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

function SecondaryActionButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 items-center justify-center rounded-[18px] px-4 text-sm font-semibold transition border border-slate-200 bg-white text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] hover:bg-slate-50"
    >
      {children}
    </button>
  );
}

export default function AdmMapaSeparacaoPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [items, setItems] = useState<OrderItemRow[]>([]);

  const [dateMode, setDateMode] = useState<"today" | "custom">("today");
  const [selectedDate, setSelectedDate] = useState(todayYMD());
  const [search, setSearch] = useState("");
  const [onlyWithPackRule, setOnlyWithPackRule] = useState(false);

  useEffect(() => {
    (async () => {
      const ok = await requireAdminOrRedirect(router);
      if (!ok) return;
      await loadData();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    setMsg("");

    const { data: ordersData, error: ordersError } = await supabase
      .from("orders")
      .select(`
        id,
        delivery_forecast,
        logistic_status,
        stores:stores (
          id,
          name
        )
      `)
      .neq("logistic_status", "ENTREGUE");

    if (ordersError) {
      setMsg(ordersError.message);
      setOrders([]);
      setItems([]);
      return;
    }

    const normalizedOrders: OrderRow[] = (ordersData ?? []).map((row: any) => ({
      id: row.id,
      delivery_forecast: row.delivery_forecast ?? null,
      logistic_status: row.logistic_status ?? "RECEBIDO",
      stores: Array.isArray(row.stores) ? row.stores[0] ?? null : row.stores ?? null,
    }));

    setOrders(normalizedOrders);

    const orderIds = normalizedOrders.map((o) => o.id);
    if (orderIds.length === 0) {
      setItems([]);
      return;
    }

    const { data: itemsData, error: itemsError } = await supabase
      .from("order_items")
      .select(`
        order_id,
        qty,
        unit,
        products:products (
          id,
          sku,
          name,
          unit
        )
      `)
      .in("order_id", orderIds);

    if (itemsError) {
      setMsg(itemsError.message);
      setItems([]);
      return;
    }

    const normalizedItems: OrderItemRow[] = (itemsData ?? []).map((row: any) => ({
      order_id: row.order_id,
      qty: Number(row.qty ?? 0),
      unit: row.unit ?? null,
      products: Array.isArray(row.products) ? row.products[0] ?? null : row.products ?? null,
    }));

    setItems(normalizedItems);
  }

  const targetDate = dateMode === "today" ? todayYMD() : selectedDate;

  const targetOrderIds = useMemo(() => {
    return new Set(
      orders
        .filter((o) => o.delivery_forecast === targetDate)
        .map((o) => o.id)
    );
  }, [orders, targetDate]);

  const consolidated = useMemo<SeparationAgg[]>(() => {
    const map = new Map<
      string,
      SeparationAgg & { orderSet: Set<string>; storeSet: Set<string> }
    >();

    for (const row of items) {
      if (!targetOrderIds.has(row.order_id)) continue;

      const order = orders.find((o) => o.id === row.order_id);
      const storeName = order?.stores?.name || "";

      const sku = row.products?.sku || "";
      const name = row.products?.name || "Produto sem nome";
      const unit = row.products?.unit || row.unit || "UN";
      const key = `${sku}::${name}`;

      if (!map.has(key)) {
        map.set(key, {
          product_key: key,
          sku,
          name,
          unit,
          qty_total: 0,
          packs_total: null,
          pack_label: null,
          pack_base_text: null,
          orders_count: 0,
          stores_count: 0,
          orderSet: new Set<string>(),
          storeSet: new Set<string>(),
        });
      }

      const current = map.get(key)!;
      current.qty_total += Number(row.qty ?? 0);
      current.orderSet.add(row.order_id);
      if (storeName) current.storeSet.add(storeName);
    }

    const list = Array.from(map.values()).map((item) => {
      const pack = getPackInfo(item.name);

      return {
        product_key: item.product_key,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        qty_total: item.qty_total,
        packs_total: pack ? ceilPacks(item.qty_total, pack) : null,
        pack_label: pack ? pack.packLabel : null,
        pack_base_text: pack ? packBaseText(pack) : null,
        orders_count: item.orderSet.size,
        stores_count: item.storeSet.size,
      };
    });

    const q = search.trim().toLowerCase();

    const filtered = list.filter((item) => {
      const matchText =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q);

      const matchPack = onlyWithPackRule ? item.packs_total !== null : true;

      return matchText && matchPack;
    });

    return filtered.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [items, targetOrderIds, orders, search, onlyWithPackRule]);

  const summary = useMemo(() => {
    return {
      products: consolidated.length,
      totalQty: consolidated.reduce((acc, item) => acc + item.qty_total, 0),
      totalPacks: consolidated.reduce((acc, item) => acc + Number(item.packs_total ?? 0), 0),
      orders: orders.filter((o) => o.delivery_forecast === targetDate).length,
    };
  }, [consolidated, orders, targetDate]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mapa de separação"
        subtitle="Consolidação dos itens a separar por data"
        right={
          <div className="flex flex-wrap gap-2">
            <SecondaryActionButton onClick={() => router.push("/adm/expedicao")}>
              Voltar para expedição
            </SecondaryActionButton>
            <SecondaryActionButton onClick={loadData}>Atualizar</SecondaryActionButton>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm text-slate-700 whitespace-pre-wrap">{msg}</div>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryBox title="Produtos" value={String(summary.products)} />
        <SummaryBox title="Pedidos" value={String(summary.orders)} />
        <SummaryBox title="Quantidade total" value={fmtNumBR(summary.totalQty)} />
        <SummaryBox title="Volumes" value={fmtNumBR(summary.totalPacks)} subtitle="Somente itens com conversão" />
      </div>

      <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Select
            label="Base"
            value={dateMode}
            onChange={(v) => setDateMode(v as "today" | "custom")}
            options={[
              { value: "today", label: "Hoje" },
              { value: "custom", label: "Escolher data" },
            ]}
          />

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Data
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              disabled={dateMode !== "custom"}
              className="h-11 w-full rounded-[18px] border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-300 disabled:bg-slate-50"
            />
          </div>

          <Input
            label="Buscar item"
            placeholder="SKU ou produto"
            value={search}
            onChange={setSearch}
          />

          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={onlyWithPackRule}
                onChange={(e) => setOnlyWithPackRule(e.target.checked)}
              />
              Só itens com conversão de caixa/pacote
            </label>
          </div>
        </div>
      </div>

      {loading ? (
        <Card>Carregando...</Card>
      ) : consolidated.length === 0 ? (
        <Card>
          <div className="text-sm text-slate-600">
            Nenhum item encontrado para a data {targetDate}.
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {consolidated.map((item) => (
            <div
              key={item.product_key}
              className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">{item.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.sku || "Sem SKU"}</div>
                </div>

                {item.packs_total !== null ? (
                  <Badge tone="blue">{fmtNumBR(item.packs_total)} {item.pack_label}</Badge>
                ) : (
                  <Badge tone="neutral">{item.unit}</Badge>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-[18px] bg-slate-50 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Total a separar
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {fmtNumBR(item.qty_total)} {item.unit}
                  </div>
                </div>

                <div className="rounded-[18px] bg-slate-50 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Pedidos / lojas
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {item.orders_count} / {item.stores_count}
                  </div>
                </div>
              </div>

              {item.packs_total !== null && item.pack_base_text ? (
                <div className="mt-3 rounded-[18px] border border-cyan-100 bg-cyan-50 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">
                    Conversão operacional
                  </div>
                  <div className="mt-1 text-sm font-semibold text-cyan-900">
                    Base: {item.pack_base_text}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-cyan-900">
                    Separar: {fmtNumBR(item.packs_total)} {item.pack_label}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}