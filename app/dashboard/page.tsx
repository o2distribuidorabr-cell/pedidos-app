"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PortalShell from "@/app/components/PortalShell";
import { PageHeader, Card, Button, Select, StatCard, Table, Badge } from "@/app/components/ui";

type ProfileRow = {
  id: string;
  role: string | null;
  approved: boolean | null;
  store_id: string | null;
};

type ItemTotalRow = {
  store_id: string;
  product_id: string;
  sku: string | null;
  product_name: string | null;
  unit: string | null;
  month_ref: string; // date
  total_qty: number;
  total_value: number;
  orders_count: number;
};

type ItemWeeklyRow = {
  store_id: string;
  product_id: string;
  sku: string | null;
  product_name: string | null;
  unit: string | null;
  week_ref: string; // date
  total_qty: number;
  total_value: number;
  orders_count: number;
  avg_qty_per_order: number | null;
  avg_value_per_order: number | null;
};

type StoreStatusMonthlyRow = {
  store_id: string;
  status: string;
  month_ref: string; // date
  orders_count: number;
  total_qty: number;
  total_value: number;
};

function money(v: number) {
  try {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${v}`;
  }
}

function toISODate(d: Date) {
  // YYYY-MM-DD
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function monthStartFromYM(ym: string) {
  // ym = "2026-02"
  const [y, m] = ym.split("-").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, 1);
}

function currentYM() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default function DashboardFranqueadoPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [monthYM, setMonthYM] = useState<string>(currentYM());

  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const [topItems, setTopItems] = useState<ItemTotalRow[]>([]);
  const [weekly, setWeekly] = useState<ItemWeeklyRow[]>([]);
  const [statusMonthly, setStatusMonthly] = useState<StoreStatusMonthlyRow[]>([]);

  async function ensureFranchisee() {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;

    if (!userId) {
      router.push("/login");
      return null;
    }

    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("id,role,approved,store_id")
      .eq("id", userId)
      .single();

    if (pErr || !prof) {
      setMsg(pErr?.message ?? "Não foi possível carregar seu perfil.");
      return null;
    }

    const pr = prof as ProfileRow;

    if (!pr.approved) {
      setMsg("Seu acesso ainda está pendente de aprovação.");
      return null;
    }

    if (!pr.store_id) {
      setMsg("Seu usuário não está vinculado a uma loja.");
      return null;
    }

    // Se for admin, manda para /adm
    if (pr.role === "admin") {
      router.push("/adm");
      return null;
    }

    setProfile(pr);
    return pr;
  }

  async function loadAll(storeId: string, ym: string) {
    setMsg("");

    const monthStart = monthStartFromYM(ym);
    const monthRef = toISODate(monthStart); // YYYY-MM-01

    // Top itens do mês
    const { data: it, error: itErr } = await supabase
      .from("v_item_totals")
      .select("store_id,product_id,sku,product_name,unit,month_ref,total_qty,total_value,orders_count")
      .eq("store_id", storeId)
      .eq("month_ref", monthRef)
      .order("total_value", { ascending: false })
      .limit(30);

    if (itErr) {
      setMsg(itErr.message);
      setTopItems([]);
    } else {
      setTopItems((it ?? []) as ItemTotalRow[]);
    }

    // Status do mês (em aberto / pendente / etc)
    const { data: sm, error: smErr } = await supabase
      .from("v_store_status_monthly")
      .select("store_id,status,month_ref,orders_count,total_qty,total_value")
      .eq("store_id", storeId)
      .eq("month_ref", monthRef);

    if (smErr) {
      setMsg(smErr.message);
      setStatusMonthly([]);
    } else {
      setStatusMonthly((sm ?? []) as StoreStatusMonthlyRow[]);
    }

    // Semanas (últimas 8 semanas)
    const start = new Date();
    start.setDate(start.getDate() - 7 * 8);
    const startISO = toISODate(start);

    const { data: wk, error: wkErr } = await supabase
      .from("v_item_weekly")
      .select(
        "store_id,product_id,sku,product_name,unit,week_ref,total_qty,total_value,orders_count,avg_qty_per_order,avg_value_per_order"
      )
      .eq("store_id", storeId)
      .gte("week_ref", startISO)
      .order("week_ref", { ascending: true });

    if (wkErr) {
      setMsg(wkErr.message);
      setWeekly([]);
    } else {
      setWeekly((wk ?? []) as ItemWeeklyRow[]);
    }
  }

  async function bootstrap() {
    setLoading(true);
    const pr = await ensureFranchisee();
    if (!pr?.store_id) {
      setLoading(false);
      return;
    }
    await loadAll(pr.store_id, monthYM);
    setLoading(false);
  }

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    if (!profile?.store_id) return;
    setLoading(true);
    await loadAll(profile.store_id, monthYM);
    setLoading(false);
  }

  useEffect(() => {
    // ao mudar o mês
    if (!profile?.store_id) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthYM]);

  const kpis = useMemo(() => {
    const totalMes = statusMonthly.reduce((acc, r) => acc + (Number(r.total_value) || 0), 0);

    // Ajuste aqui conforme seu fluxo de status
    const emAbertoStatuses = new Set(["submitted", "approved"]);
    const emAberto = statusMonthly
      .filter((r) => emAbertoStatuses.has(r.status))
      .reduce((acc, r) => acc + (Number(r.total_value) || 0), 0);

    const pedidosMes = statusMonthly.reduce((acc, r) => acc + (Number(r.orders_count) || 0), 0);

    return { totalMes, emAberto, pedidosMes };
  }, [statusMonthly]);

  const tableTopItems = useMemo(() => {
    const rows = topItems.map((r) => [
      <div key={`${r.product_id}-name`} className="min-w-[260px]">
        <div className="font-semibold text-slate-900">{r.product_name ?? "-"}</div>
        <div className="text-xs text-slate-500">
          {r.sku ? `SKU: ${r.sku}` : ""} {r.unit ? ` • Un: ${r.unit}` : ""}
        </div>
      </div>,
      <div key={`${r.product_id}-qty`} className="text-slate-900">
        {Number(r.total_qty || 0).toLocaleString("pt-BR")}
      </div>,
      <div key={`${r.product_id}-orders`} className="text-slate-900">
        {Number(r.orders_count || 0)}
      </div>,
      <div key={`${r.product_id}-value`} className="font-semibold text-slate-900">
        {money(Number(r.total_value || 0))}
      </div>,
    ]);

    return rows;
  }, [topItems]);

  const weeklySummary = useMemo(() => {
    const map = new Map<string, { value: number }>();

    for (const r of weekly) {
      const wk = r.week_ref;
      const cur = map.get(wk) ?? { value: 0 };
      cur.value += Number(r.total_value || 0);
      map.set(wk, cur);
    }

    const items = Array.from(map.entries())
      .map(([week_ref, v]) => ({ week_ref, total_value: v.value }))
      .sort((a, b) => a.week_ref.localeCompare(b.week_ref));

    return items.slice(-8);
  }, [weekly]);

  return (
    <PortalShell title="Dashboard" subtitle="Resumo de compras, itens e valores do período">
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          subtitle="Resumo de compras, itens e valores do período"
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
          <StatCard title="Compras no mês" value={money(kpis.totalMes)} subtitle={`Referência: ${monthYM}`} />
          <StatCard title="Em aberto (por status)" value={money(kpis.emAberto)} subtitle="Considerando submitted/approved" />
          <StatCard title="Qtd. de pedidos (mês)" value={kpis.pedidosMes} subtitle="Total de pedidos por status" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Top itens do mês (valor)">
            {loading ? (
              <div className="text-sm text-slate-600">Carregando...</div>
            ) : topItems.length === 0 ? (
              <div className="text-sm text-slate-600">Nenhum item encontrado para este mês.</div>
            ) : (
              <Table headers={["Item", "Qtd", "Pedidos", "Valor"]} rows={tableTopItems} />
            )}
          </Card>

          <Card title="Compras por semana (últimas 8)">
            {weeklySummary.length === 0 ? (
              <div className="text-sm text-slate-600">Sem dados semanais ainda.</div>
            ) : (
              <div className="space-y-2">
                {weeklySummary.map((w) => (
                  <div
                    key={w.week_ref}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2"
                  >
                    <div className="text-sm text-slate-700">
                      <span className="font-semibold text-slate-900">{w.week_ref}</span>
                      <span className="text-slate-500"> (semana)</span>
                    </div>
                    <Badge tone="blue">{money(w.total_value)}</Badge>
                  </div>
                ))}
                <div className="text-xs text-slate-500">Dica: depois colocamos um gráfico (sem depender de biblioteca externa).</div>
              </div>
            )}
          </Card>
        </div>

        <Card title="Status do mês">
          {statusMonthly.length === 0 ? (
            <div className="text-sm text-slate-600">Sem status para este mês.</div>
          ) : (
            <Table
              headers={["Status", "Pedidos", "Qtd Itens", "Valor"]}
              rows={statusMonthly
                .slice()
                .sort((a, b) => (Number(b.total_value) || 0) - (Number(a.total_value) || 0))
                .map((r, idx) => [
                  <div key={`st-${idx}`} className="font-semibold text-slate-900">
                    {r.status}
                  </div>,
                  <div key={`od-${idx}`}>{Number(r.orders_count || 0)}</div>,
                  <div key={`qt-${idx}`}>{Number(r.total_qty || 0).toLocaleString("pt-BR")}</div>,
                  <div key={`vl-${idx}`} className="font-semibold">
                    {money(Number(r.total_value || 0))}
                  </div>,
                ])}
            />
          )}
        </Card>
      </div>
    </PortalShell>
  );
}