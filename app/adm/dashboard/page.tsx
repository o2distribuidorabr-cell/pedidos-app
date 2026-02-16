"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";
import { PageHeader, Card, Button, Select, StatCard, Table, Badge } from "@/app/components/ui";

type StoreRow = { id: string; name: string };

type StoreStatusMonthlyRow = {
  store_id: string;
  status: string;
  month_ref: string;
  orders_count: number;
  total_qty: number;
  total_value: number;
};

type ItemTotalRow = {
  store_id: string;
  product_id: string;
  sku: string | null;
  product_name: string | null;
  unit: string | null;
  month_ref: string;
  total_qty: number;
  total_value: number;
  orders_count: number;
};

function money(v: number) {
  try {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${v}`;
  }
}

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function monthStartFromYM(ym: string) {
  const [y, m] = ym.split("-").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, 1);
}

function currentYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function AdmDashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [monthYM, setMonthYM] = useState<string>(currentYM());
  const [storeId, setStoreId] = useState<string>("all");

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [statusMonthly, setStatusMonthly] = useState<StoreStatusMonthlyRow[]>([]);
  const [items, setItems] = useState<ItemTotalRow[]>([]);

  async function bootstrap() {
    setLoading(true);
    setMsg("");

    const ok = await requireAdminOrRedirect(router);
    if (!ok) {
      setLoading(false);
      return;
    }

    const { data: st, error: stErr } = await supabase
      .from("stores")
      .select("id,name")
      .order("name", { ascending: true });

    if (stErr) {
      setMsg(stErr.message);
      setStores([]);
    } else {
      setStores((st ?? []) as StoreRow[]);
    }

    await loadAll(monthYM, storeId);
    setLoading(false);
  }

  async function loadAll(ym: string, store: string) {
    setMsg("");
    const monthStart = monthStartFromYM(ym);
    const monthRef = toISODate(monthStart);

    // Status (rede ou loja)
    let q1 = supabase
      .from("v_store_status_monthly")
      .select("store_id,status,month_ref,orders_count,total_qty,total_value")
      .eq("month_ref", monthRef);

    if (store !== "all") q1 = q1.eq("store_id", store);

    const { data: sm, error: smErr } = await q1;

    if (smErr) {
      setMsg(smErr.message);
      setStatusMonthly([]);
    } else {
      setStatusMonthly((sm ?? []) as StoreStatusMonthlyRow[]);
    }

    // Itens do mês (rede ou loja)
    let q2 = supabase
      .from("v_item_totals")
      .select("store_id,product_id,sku,product_name,unit,month_ref,total_qty,total_value,orders_count")
      .eq("month_ref", monthRef);

    if (store !== "all") q2 = q2.eq("store_id", store);

    const { data: it, error: itErr } = await q2.order("total_value", { ascending: false }).limit(500);

    if (itErr) {
      setMsg(itErr.message);
      setItems([]);
    } else {
      setItems((it ?? []) as ItemTotalRow[]);
    }
  }

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadAll(monthYM, storeId);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthYM, storeId]);

  const storeNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stores) m.set(s.id, s.name);
    return m;
  }, [stores]);

  const kpis = useMemo(() => {
    const total = statusMonthly.reduce((acc, r) => acc + (Number(r.total_value) || 0), 0);
    const pedidos = statusMonthly.reduce((acc, r) => acc + (Number(r.orders_count) || 0), 0);

    const emAbertoStatuses = new Set(["submitted", "approved"]);
    const emAberto = statusMonthly
      .filter((r) => emAbertoStatuses.has(r.status))
      .reduce((acc, r) => acc + (Number(r.total_value) || 0), 0);

    return { total, pedidos, emAberto };
  }, [statusMonthly]);

  const topStores = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of statusMonthly) {
      map.set(r.store_id, (map.get(r.store_id) ?? 0) + (Number(r.total_value) || 0));
    }
    const arr = Array.from(map.entries())
      .map(([store_id, total_value]) => ({ store_id, total_value }))
      .sort((a, b) => b.total_value - a.total_value);

    return arr.slice(0, 10);
  }, [statusMonthly]);

  const topItems = useMemo(() => {
    const map = new Map<
      string,
      { product_name: string; sku: string; unit: string; total_value: number; total_qty: number; orders: number }
    >();

    for (const r of items) {
      const key = r.product_id;
      const cur =
        map.get(key) ??
        {
          product_name: r.product_name ?? "-",
          sku: r.sku ?? "",
          unit: r.unit ?? "",
          total_value: 0,
          total_qty: 0,
          orders: 0,
        };

      cur.total_value += Number(r.total_value) || 0;
      cur.total_qty += Number(r.total_qty) || 0;
      cur.orders += Number(r.orders_count) || 0;

      map.set(key, cur);
    }

    return Array.from(map.entries())
      .map(([product_id, v]) => ({ product_id, ...v }))
      .sort((a, b) => b.total_value - a.total_value)
      .slice(0, 30);
  }, [items]);

  async function refresh() {
    setLoading(true);
    await loadAll(monthYM, storeId);
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard (Admin)"
        subtitle="Visão geral da rede e filtros por loja"
        right={
          <>
            <Select
              value={monthYM}
              onChange={setMonthYM}
              options={Array.from({ length: 12 }).map((_, i) => {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                return { value: ym, label: ym };
              })}
            />

            <Select
              value={storeId}
              onChange={setStoreId}
              options={[
                { value: "all", label: "Todas as lojas" },
                ...stores.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />

            <Button variant="secondary" onClick={refresh} disabled={loading}>
              Atualizar
            </Button>
          </>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm text-red-600">{msg}</div>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Total (mês)" value={money(kpis.total)} subtitle={`Ref: ${monthYM}`} />
        <StatCard title="Em aberto (por status)" value={money(kpis.emAberto)} subtitle="submitted/approved" />
        <StatCard title="Qtd. pedidos (mês)" value={kpis.pedidos} subtitle="Somatório por status" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Top lojas (valor no mês)">
          {storeId !== "all" ? (
            <div className="text-sm text-slate-600">Filtrado por loja: este ranking só faz sentido em “Todas as lojas”.</div>
          ) : topStores.length === 0 ? (
            <div className="text-sm text-slate-600">Sem dados no período.</div>
          ) : (
            <div className="space-y-2">
              {topStores.map((s) => (
                <div
                  key={s.store_id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2"
                >
                  <div className="text-sm text-slate-800">
                    <span className="font-semibold text-slate-900">{storeNameMap.get(s.store_id) ?? s.store_id}</span>
                  </div>
                  <Badge tone="blue">{money(s.total_value)}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Top itens (valor no mês)">
          {topItems.length === 0 ? (
            <div className="text-sm text-slate-600">Sem itens no período.</div>
          ) : (
            <Table
              headers={["Item", "Qtd", "Pedidos", "Valor"]}
              rows={topItems.map((r) => [
                <div key={`${r.product_id}-name`} className="min-w-[260px]">
                  <div className="font-semibold text-slate-900">{r.product_name}</div>
                  <div className="text-xs text-slate-500">
                    {r.sku ? `SKU: ${r.sku}` : ""} {r.unit ? ` • Un: ${r.unit}` : ""}
                  </div>
                </div>,
                <div key={`${r.product_id}-qty`}>{Number(r.total_qty).toLocaleString("pt-BR")}</div>,
                <div key={`${r.product_id}-orders`}>{Number(r.orders).toLocaleString("pt-BR")}</div>,
                <div key={`${r.product_id}-value`} className="font-semibold">{money(r.total_value)}</div>,
              ])}
            />
          )}
        </Card>
      </div>

      <Card title="Status do mês">
        {statusMonthly.length === 0 ? (
          <div className="text-sm text-slate-600">Sem dados no período.</div>
        ) : (
          <Table
            headers={["Loja", "Status", "Pedidos", "Qtd Itens", "Valor"]}
            rows={statusMonthly
              .slice()
              .sort((a, b) => (Number(b.total_value) || 0) - (Number(a.total_value) || 0))
              .map((r, idx) => [
                <div key={`lo-${idx}`} className="font-semibold text-slate-900">
                  {storeNameMap.get(r.store_id) ?? r.store_id}
                </div>,
                <div key={`st-${idx}`}>{r.status}</div>,
                <div key={`od-${idx}`}>{Number(r.orders_count || 0)}</div>,
                <div key={`qt-${idx}`}>{Number(r.total_qty || 0).toLocaleString("pt-BR")}</div>,
                <div key={`vl-${idx}`} className="font-semibold">{money(Number(r.total_value || 0))}</div>,
              ])}
          />
        )}
      </Card>
    </div>
  );
}