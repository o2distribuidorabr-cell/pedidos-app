"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PortalShell from "@/app/components/PortalShell";
import {
  PageHeader,
  Card,
  Button,
  Select,
  StatCard,
  Table,
  Badge,
} from "@/app/components/ui";

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
  month_ref: string;
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
  week_ref: string;
  total_qty: number;
  total_value: number;
  orders_count: number;
  avg_qty_per_order: number | null;
  avg_value_per_order: number | null;
};

type StoreStatusMonthlyRow = {
  store_id: string;
  status: string;
  month_ref: string;
  orders_count: number;
  total_qty: number;
  total_value: number;
};

function money(v: number) {
  try {
    return (Number(v) || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  } catch {
    return `R$ ${v}`;
  }
}

function integer(v: number) {
  return Number(v || 0).toLocaleString("pt-BR");
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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatYMLabel(ym: string) {
  try {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  } catch {
    return ym;
  }
}

function formatWeekShort(iso: string) {
  try {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch {
    return iso;
  }
}

function pct(value: number, total: number) {
  if (!total) return 0;
  return (value / total) * 100;
}

function variationPct(current: number, previous: number) {
  if (!previous && !current) return 0;
  if (!previous) return 100;
  return ((current - previous) / previous) * 100;
}

function variationTone(v: number): "green" | "red" | "neutral" {
  if (v > 0.001) return "green";
  if (v < -0.001) return "red";
  return "neutral";
}

function variationLabel(v: number) {
  const abs = Math.abs(v);
  return `${v >= 0 ? "+" : "-"}${abs.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function statusTone(status: string): "green" | "red" | "yellow" | "blue" | "neutral" {
  const s = String(status || "").toLowerCase();
  if (s === "approved") return "green";
  if (s === "rejected") return "red";
  if (s === "submitted") return "yellow";
  if (s === "draft") return "blue";
  return "neutral";
}

function MiniKpi({
  label,
  value,
  subtitle,
  badge,
}: {
  label: string;
  value: string;
  subtitle?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900">
            {value}
          </div>
          {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
        </div>
        {badge ? <div>{badge}</div> : null}
      </div>
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
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900">
        {value}
      </div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

function BarsWeeklyChart({
  data,
}: {
  data: Array<{ week_ref: string; total_value: number; orders_count: number }>;
}) {
  const max = Math.max(...data.map((d) => d.total_value), 1);

  return (
    <div className="space-y-3">
      {data.map((d) => {
        const width = Math.max(6, (d.total_value / max) * 100);

        return (
          <div key={d.week_ref} className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-slate-700">
                Semana {formatWeekShort(d.week_ref)}
              </div>
              <div className="text-sm font-semibold text-slate-900">
                {money(d.total_value)}
              </div>
            </div>

            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-cyan-600 transition-all"
                style={{ width: `${width}%` }}
              />
            </div>

            <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
              <span>{integer(d.orders_count)} pedido(s)</span>
              <span>{width.toFixed(0)}% do pico</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SimpleDonutLegend({
  data,
}: {
  data: Array<{ label: string; value: number; tone: "green" | "red" | "yellow" | "blue" | "neutral" }>;
}) {
  const total = data.reduce((acc, d) => acc + d.value, 0);

  return (
    <div className="space-y-3">
      {data.map((d) => {
        const percent = pct(d.value, total);

        return (
          <div key={d.label} className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge tone={d.tone}>{d.label}</Badge>
              </div>
              <div className="text-sm font-semibold text-slate-900">
                {integer(d.value)}
              </div>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={[
                  "h-full rounded-full",
                  d.tone === "green"
                    ? "bg-green-600"
                    : d.tone === "red"
                    ? "bg-red-600"
                    : d.tone === "yellow"
                    ? "bg-amber-500"
                    : d.tone === "blue"
                    ? "bg-blue-600"
                    : "bg-slate-500",
                ].join(" ")}
                style={{ width: `${Math.max(percent, 4)}%` }}
              />
            </div>

            <div className="mt-2 text-xs text-slate-500">
              {percent.toLocaleString("pt-BR", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
              % do total de pedidos do mês
            </div>
          </div>
        );
      })}
    </div>
  );
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
    const monthRef = toISODate(monthStart);

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
    if (!profile?.store_id) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthYM]);

  const kpis = useMemo(() => {
    const totalMes = statusMonthly.reduce((acc, r) => acc + (Number(r.total_value) || 0), 0);

    const emAbertoStatuses = new Set(["submitted", "approved"]);
    const emAberto = statusMonthly
      .filter((r) => emAbertoStatuses.has(String(r.status || "").toLowerCase()))
      .reduce((acc, r) => acc + (Number(r.total_value) || 0), 0);

    const pedidosMes = statusMonthly.reduce((acc, r) => acc + (Number(r.orders_count) || 0), 0);
    const ticketMedio = pedidosMes > 0 ? totalMes / pedidosMes : 0;

    return { totalMes, emAberto, pedidosMes, ticketMedio };
  }, [statusMonthly]);

  const tableTopItems = useMemo(() => {
    return topItems.slice(0, 10).map((r) => [
      <div key={`${r.product_id}-name`} className="min-w-[260px]">
        <div className="font-semibold text-slate-900">{r.product_name ?? "-"}</div>
        <div className="text-xs text-slate-500">
          {r.sku ? `SKU: ${r.sku}` : ""}
          {r.unit ? ` • Un: ${r.unit}` : ""}
        </div>
      </div>,
      <div key={`${r.product_id}-qty`} className="text-slate-900">
        {integer(Number(r.total_qty || 0))}
      </div>,
      <div key={`${r.product_id}-orders`} className="text-slate-900">
        {integer(Number(r.orders_count || 0))}
      </div>,
      <div key={`${r.product_id}-value`} className="font-semibold text-slate-900">
        {money(Number(r.total_value || 0))}
      </div>,
    ]);
  }, [topItems]);

  const weeklySummary = useMemo(() => {
    const map = new Map<string, { value: number; orders: number }>();

    for (const r of weekly) {
      const wk = r.week_ref;
      const cur = map.get(wk) ?? { value: 0, orders: 0 };
      cur.value += Number(r.total_value || 0);
      cur.orders += Number(r.orders_count || 0);
      map.set(wk, cur);
    }

    return Array.from(map.entries())
      .map(([week_ref, v]) => ({
        week_ref,
        total_value: v.value,
        orders_count: v.orders,
      }))
      .sort((a, b) => a.week_ref.localeCompare(b.week_ref))
      .slice(-8);
  }, [weekly]);

  const weeklyTrend = useMemo(() => {
    if (weeklySummary.length < 2) {
      return { value: 0, label: "Sem base comparativa" };
    }

    const last = weeklySummary[weeklySummary.length - 1]?.total_value ?? 0;
    const prev = weeklySummary[weeklySummary.length - 2]?.total_value ?? 0;
    const varPct = variationPct(last, prev);

    return {
      value: varPct,
      label: `Última semana vs anterior`,
    };
  }, [weeklySummary]);

  const topItemsValue = useMemo(() => {
    return topItems.reduce((acc, r) => acc + (Number(r.total_value) || 0), 0);
  }, [topItems]);

  const top5Items = useMemo(() => topItems.slice(0, 5), [topItems]);

  const statusCards = useMemo(() => {
    return statusMonthly
      .slice()
      .sort((a, b) => (Number(b.orders_count) || 0) - (Number(a.orders_count) || 0))
      .map((r) => ({
        label: r.status,
        value: Number(r.orders_count || 0),
        tone: statusTone(r.status),
      }));
  }, [statusMonthly]);

  const monthOptions = useMemo(() => {
    return Array.from({ length: 12 }).map((_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return {
        value: ym,
        label: formatYMLabel(ym),
      };
    });
  }, []);

  return (
    <PortalShell
      title="Dashboard"
      subtitle="Visão analítica das compras e pedidos da sua unidade"
    >
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          subtitle="Acompanhe compras, mix de itens, pedidos e evolução semanal."
          right={
            <div className="flex flex-wrap gap-2">
              <Select value={monthYM} onChange={setMonthYM} options={monthOptions} />
              <Button variant="secondary" onClick={refresh} disabled={loading}>
                Atualizar
              </Button>
            </div>
          }
        />

        {msg ? (
          <Card>
            <div className="text-sm text-red-600 whitespace-pre-wrap">{msg}</div>
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Compras no mês"
            value={money(kpis.totalMes)}
            subtitle={formatYMLabel(monthYM)}
            right={<Badge tone="blue">Mês</Badge>}
          />

          <StatCard
            title="Pedidos no mês"
            value={integer(kpis.pedidosMes)}
            subtitle="Total de pedidos por status"
            right={<Badge tone="green">Pedidos</Badge>}
          />

          <StatCard
            title="Ticket médio"
            value={money(kpis.ticketMedio)}
            subtitle="Valor médio por pedido"
            right={<Badge tone="yellow">Médio</Badge>}
          />

          <StatCard
            title="Em aberto"
            value={money(kpis.emAberto)}
            subtitle="Considerando submitted/approved"
            right={<Badge tone="neutral">Aberto</Badge>}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Card
                title="Compras por semana"
                subtitle="Últimas 8 semanas consolidadas"
                right={
                  <Badge tone={variationTone(weeklyTrend.value)}>
                    {weeklyTrend.label}: {variationLabel(weeklyTrend.value)}
                  </Badge>
                }
              >
                {weeklySummary.length === 0 ? (
                  <div className="text-sm text-slate-600">Sem dados semanais ainda.</div>
                ) : (
                  <BarsWeeklyChart data={weeklySummary} />
                )}
              </Card>

              <Card title="Distribuição por status" subtitle="Pedidos do mês por etapa">
                {statusCards.length === 0 ? (
                  <div className="text-sm text-slate-600">Sem status para este mês.</div>
                ) : (
                  <SimpleDonutLegend data={statusCards} />
                )}
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <MiniKpi
                label="Top 5 itens"
                value={money(
                  top5Items.reduce((acc, r) => acc + (Number(r.total_value) || 0), 0)
                )}
                subtitle="Valor concentrado nos 5 principais itens"
              />

              <MiniKpi
                label="Mix total de itens"
                value={integer(topItems.length)}
                subtitle="Itens com compra no mês"
              />

              <MiniKpi
                label="Concentração"
                value={`${pct(
                  top5Items.reduce((acc, r) => acc + (Number(r.total_value) || 0), 0),
                  topItemsValue
                ).toLocaleString("pt-BR", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}%`}
                subtitle="Participação dos 5 principais itens"
              />
            </div>

            <Card title="Top itens do mês" subtitle="Ranking por valor comprado">
              {loading ? (
                <div className="text-sm text-slate-600">Carregando...</div>
              ) : topItems.length === 0 ? (
                <div className="text-sm text-slate-600">
                  Nenhum item encontrado para este mês.
                </div>
              ) : (
                <Table
                  headers={["Item", "Qtd", "Pedidos", "Valor"]}
                  rows={tableTopItems}
                />
              )}
            </Card>

            <Card title="Itens com maior participação" subtitle="Leitura rápida do mix do mês">
              {top5Items.length === 0 ? (
                <div className="text-sm text-slate-600">Sem dados de itens.</div>
              ) : (
                <div className="space-y-4">
                  {top5Items.map((item) => {
                    const share = pct(Number(item.total_value || 0), topItemsValue);

                    return (
                      <div
                        key={item.product_id}
                        className="rounded-[22px] border border-slate-200 bg-white p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-900">
                              {item.product_name ?? "-"}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {item.sku ? `SKU: ${item.sku}` : ""}
                              {item.unit ? ` • Un: ${item.unit}` : ""}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-sm font-semibold text-slate-900">
                              {money(Number(item.total_value || 0))}
                            </div>
                            <div className="text-xs text-slate-500">
                              {integer(Number(item.orders_count || 0))} pedido(s)
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-cyan-600"
                            style={{ width: `${Math.max(share, 4)}%` }}
                          />
                        </div>

                        <div className="mt-2 text-xs text-slate-500">
                          Participação no mix do mês:{" "}
                          <b>
                            {share.toLocaleString("pt-BR", {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 1,
                            })}
                            %
                          </b>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          <div>
            <div className="xl:sticky xl:top-24">
              <Card title="Resumo executivo" subtitle="Leitura rápida da unidade">
                <div className="space-y-4">
                  <SummaryBox
                    title="Volume comprado"
                    value={money(kpis.totalMes)}
                    subtitle={`Período: ${formatYMLabel(monthYM)}`}
                  />

                  <SummaryBox
                    title="Pedidos"
                    value={integer(kpis.pedidosMes)}
                    subtitle="Quantidade no mês"
                  />

                  <SummaryBox
                    title="Maior item"
                    value={topItems[0]?.product_name ?? "—"}
                    subtitle={
                      topItems[0]
                        ? money(Number(topItems[0].total_value || 0))
                        : "Sem movimentação"
                    }
                  />

                  <SummaryBox
                    title="Última tendência"
                    value={variationLabel(weeklyTrend.value)}
                    subtitle="Comparativo semanal"
                  />

                  <div className="grid gap-3">
                    <Button onClick={() => router.push("/pedido")}>Novo pedido</Button>
                    <Button variant="secondary" onClick={() => router.push("/pedidos")}>
                      Ver histórico
                    </Button>
                    <Button variant="secondary" onClick={() => router.push("/financeiro")}>
                      Financeiro
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>

        <Card title="Status do mês" subtitle="Consolidação por etapa do pedido">
          {statusMonthly.length === 0 ? (
            <div className="text-sm text-slate-600">Sem status para este mês.</div>
          ) : (
            <Table
              headers={["Status", "Pedidos", "Qtd Itens", "Valor"]}
              rows={statusMonthly
                .slice()
                .sort((a, b) => (Number(b.total_value) || 0) - (Number(a.total_value) || 0))
                .map((r, idx) => [
                  <div key={`st-${idx}`} className="flex items-center gap-2">
                    <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  </div>,
                  <div key={`od-${idx}`} className="text-slate-900">
                    {integer(Number(r.orders_count || 0))}
                  </div>,
                  <div key={`qt-${idx}`} className="text-slate-900">
                    {integer(Number(r.total_qty || 0))}
                  </div>,
                  <div key={`vl-${idx}`} className="font-semibold text-slate-900">
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