"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";
import { PageHeader, Card, Input, Select, Badge, Table, StatCard } from "@/app/components/ui";

type FiscalRuleRow = {
  id: string;
  name: string;
  is_active: boolean;
  priority: number;
  operation_scope: string | null;
  customer_taxpayer_type: string | null;
  operation_type: string | null;
  cfop: string | null;
  icms_code: string | null;
  pis_cst: string | null;
  cofins_cst: string | null;
  icms_st_enabled: boolean;
  freight_mode: string | null;
  updated_at: string | null;
  products: { id: string; name: string | null; sku: string | null } | null;
  emitters: { id: string; name: string | null } | null;
};

function fmtDT(v: string | null | undefined) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("pt-BR");
  } catch {
    return v;
  }
}

export default function AdmRegrasFiscaisPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [rules, setRules] = useState<FiscalRuleRow[]>([]);

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [stFilter, setStFilter] = useState("all");

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

    const { data, error } = await supabase
      .from("fiscal_rules")
      .select(`
        id,
        name,
        is_active,
        priority,
        operation_scope,
        customer_taxpayer_type,
        operation_type,
        cfop,
        icms_code,
        pis_cst,
        cofins_cst,
        icms_st_enabled,
        freight_mode,
        updated_at,
        products:products (id,name,sku),
        emitters:emitters (id,name)
      `)
      .order("priority", { ascending: true })
      .order("updated_at", { ascending: false });

    if (error) {
      setMsg(error.message);
      setRules([]);
      return;
    }

    const normalized = (data ?? []).map((row: any) => ({
      ...row,
      products: Array.isArray(row.products) ? row.products[0] ?? null : row.products ?? null,
      emitters: Array.isArray(row.emitters) ? row.emitters[0] ?? null : row.emitters ?? null,
    })) as FiscalRuleRow[];

    setRules(normalized);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rules.filter((rule) => {
      const matchesText =
        !q ||
        String(rule.name || "").toLowerCase().includes(q) ||
        String(rule.products?.name || "").toLowerCase().includes(q) ||
        String(rule.products?.sku || "").toLowerCase().includes(q) ||
        String(rule.cfop || "").toLowerCase().includes(q) ||
        String(rule.icms_code || "").toLowerCase().includes(q);

      const matchesActive =
        activeFilter === "all"
          ? true
          : activeFilter === "active"
          ? rule.is_active
          : !rule.is_active;

      const matchesST =
        stFilter === "all"
          ? true
          : stFilter === "st"
          ? rule.icms_st_enabled
          : !rule.icms_st_enabled;

      return matchesText && matchesActive && matchesST;
    });
  }, [rules, search, activeFilter, stFilter]);

  const stats = useMemo(() => {
    return {
      total: rules.length,
      active: rules.filter((r) => r.is_active).length,
      st: rules.filter((r) => r.icms_st_enabled).length,
      inactive: rules.filter((r) => !r.is_active).length,
    };
  }, [rules]);

  const rows = filtered.map((rule) => [
    <div key="regra">
      <div className="font-semibold text-slate-900">{rule.name}</div>
      <div className="text-xs text-slate-500">Prioridade: {rule.priority}</div>
    </div>,
    <div key="produto">
      <div className="font-semibold text-slate-900">{rule.products?.name || "Geral"}</div>
      <div className="text-xs text-slate-500">{rule.products?.sku || "-"}</div>
    </div>,
    <div key="operacao">
      <div className="text-slate-900">{rule.operation_type || "-"}</div>
      <div className="text-xs text-slate-500">
        {rule.operation_scope || "-"} • {rule.customer_taxpayer_type || "-"}
      </div>
    </div>,
    <div key="tributacao">
      <div className="text-slate-900">CFOP {rule.cfop || "-"}</div>
      <div className="text-xs text-slate-500">
        ICMS {rule.icms_code || "-"} • PIS {rule.pis_cst || "-"} • COFINS {rule.cofins_cst || "-"}
      </div>
    </div>,
    <div key="flags" className="flex flex-wrap gap-2">
      {rule.is_active ? <Badge tone="green">Ativa</Badge> : <Badge tone="red">Inativa</Badge>}
      {rule.icms_st_enabled ? <Badge tone="yellow">ST</Badge> : <Badge tone="neutral">Sem ST</Badge>}
    </div>,
    <div key="updated">
      <div className="text-slate-900">{fmtDT(rule.updated_at)}</div>
      <div className="text-xs text-slate-500">{rule.freight_mode || "-"}</div>
    </div>,
    <div key="acao" className="flex justify-end">
      <button
        type="button"
        onClick={() => router.push(`/adm/regras-fiscais/${rule.id}`)}
        className="inline-flex h-10 items-center justify-center rounded-[16px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50"
      >
        Editar
      </button>
    </div>,
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Regras fiscais"
        subtitle="Cadastro tributário completo por operação"
        right={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push("/adm/regras-fiscais/nova")}
              className="inline-flex h-11 items-center justify-center rounded-[18px] bg-cyan-600 px-4 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(8,145,178,0.22)] transition hover:bg-cyan-700"
            >
              Nova regra
            </button>
            <button
              type="button"
              onClick={loadData}
              className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50"
            >
              Recarregar
            </button>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm text-red-600">{msg}</div>
        </Card>
      ) : null}

      <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-5 shadow-sm md:p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total" value={String(stats.total)} />
          <StatCard label="Ativas" value={String(stats.active)} />
          <StatCard label="Com ST" value={String(stats.st)} />
          <StatCard label="Inativas" value={String(stats.inactive)} />
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Input
            label="Buscar"
            placeholder="Nome, produto, SKU, CFOP, ICMS..."
            value={search}
            onChange={setSearch}
          />
          <Select
            label="Status"
            value={activeFilter}
            onChange={setActiveFilter}
            options={[
              { value: "all", label: "Todas" },
              { value: "active", label: "Ativas" },
              { value: "inactive", label: "Inativas" },
            ]}
          />
          <Select
            label="ST"
            value={stFilter}
            onChange={setStFilter}
            options={[
              { value: "all", label: "Todas" },
              { value: "st", label: "Com ST" },
              { value: "no_st", label: "Sem ST" },
            ]}
          />
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <Table
          headers={["Regra", "Produto", "Operação", "Tributação", "Flags", "Atualizado", "Ação"]}
          rows={rows}
        />
      </div>

      {loading ? (
        <Card>
          <div className="text-sm text-slate-600">Carregando...</div>
        </Card>
      ) : null}
    </div>
  );
}