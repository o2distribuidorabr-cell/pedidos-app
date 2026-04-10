"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";
import { PageHeader, Card, Input, Select, Badge } from "@/app/components/ui";

type ProductRow = {
  id: string;
  sku: string | null;
  name: string | null;

  unit: string | null;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  origin: string | null;

  icms_cst: string | null;
  pis_cst: string | null;
  cofins_cst: string | null;

  icms_percent: number | null;
  sit_trib: string | null;
  pis_percent: number | null;
  cofins_percent: number | null;
  aliq_mun: number | null;
  aliq_est: number | null;
  aliq_fed: number | null;
  aliq_csosn: number | null;
  csosn: string | null;
  base_reduction_percent: number | null;
  benefit_fiscal: string | null;
  desoneration_percent: number | null;
  red_base_effective_percent: number | null;
  icms_effective_percent: number | null;
  last_fiscal_change_at: string | null;
  cst_rt: string | null;
  cod_class_trib_rt: string | null;
  cbs_rt_percent: number | null;
  ibs_uf_rt_percent: number | null;
  ibs_mun_rt_percent: number | null;
  red_cbs_rt_percent: number | null;
  red_ibs_uf_rt_percent: number | null;
  red_ibs_mun_rt_percent: number | null;

  // ICMS-ST retida anteriormente (CSOSN 500)
  icms_st_ret_base: number | null;
  icms_st_ret_aliquota: number | null;
  icms_st_ret_vlr_substituto: number | null;
  icms_st_ret_valor: number | null;
  conversion_factor: number | null;
};

type DraftRow = {
  id: string;
  sku: string;
  name: string;

  unit: string;
  ncm: string;
  cest: string;
  cfop: string;
  origin: string;

  icms_cst: string;
  pis_cst: string;
  cofins_cst: string;

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
  last_fiscal_change_at: string;
  cst_rt: string;
  cod_class_trib_rt: string;
  cbs_rt_percent: string;
  ibs_uf_rt_percent: string;
  ibs_mun_rt_percent: string;
  red_cbs_rt_percent: string;
  red_ibs_uf_rt_percent: string;
  red_ibs_mun_rt_percent: string;

  // ICMS-ST retida anteriormente (CSOSN 500)
  icms_st_ret_base: string;
  icms_st_ret_aliquota: string;
  icms_st_ret_vlr_substituto: string;
  icms_st_ret_valor: string;
  conversion_factor: string;
};

function toInput(v: number | string | null | undefined) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function TextCell({
  value,
  onChange,
  width = "w-24",
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  width?: string;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${width} rounded-[10px] border border-slate-200 bg-white px-2 py-2 text-xs text-slate-900 outline-none transition focus:border-slate-300`}
    />
  );
}

export default function AdmFiscalProdutosPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [draft, setDraft] = useState<Record<string, DraftRow>>({});

  const [search, setSearch] = useState("");
  const [filterIcms, setFilterIcms] = useState("all");
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [showReforma, setShowReforma] = useState(true);
  const [showUnused, setShowUnused] = useState(true);

  useEffect(() => {
    (async () => {
      const ok = await requireAdminOrRedirect(router);
      if (!ok) return;
      await loadProducts();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProducts() {
    setMsg("");

    const { data, error } = await supabase
      .from("products")
      .select(`
        id,
        sku,
        name,
        unit,
        ncm,
        cest,
        cfop,
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
        icms_st_ret_valor,
        conversion_factor
      `)
      .order("name", { ascending: true });

    if (error) {
      setMsg(error.message);
      setProducts([]);
      setDraft({});
      return;
    }

    const rows = (data ?? []) as ProductRow[];
    setProducts(rows);

    const nextDraft: Record<string, DraftRow> = {};
    for (const p of rows) {
      nextDraft[p.id] = {
        id: p.id,
        sku: p.sku || "",
        name: p.name || "",

        unit: p.unit || "",
        ncm: p.ncm || "",
        cest: p.cest || "",
        cfop: p.cfop || "",
        origin: p.origin || "",

        icms_cst: p.icms_cst || "",
        pis_cst: p.pis_cst || "",
        cofins_cst: p.cofins_cst || "",

        icms_percent: toInput(p.icms_percent),
        sit_trib: p.sit_trib || "",
        pis_percent: toInput(p.pis_percent),
        cofins_percent: toInput(p.cofins_percent),
        aliq_mun: toInput(p.aliq_mun),
        aliq_est: toInput(p.aliq_est),
        aliq_fed: toInput(p.aliq_fed),
        aliq_csosn: toInput(p.aliq_csosn),
        csosn: p.csosn || "",
        base_reduction_percent: toInput(p.base_reduction_percent),
        benefit_fiscal: p.benefit_fiscal || "",
        desoneration_percent: toInput(p.desoneration_percent),
        red_base_effective_percent: toInput(p.red_base_effective_percent),
        icms_effective_percent: toInput(p.icms_effective_percent),
        last_fiscal_change_at: p.last_fiscal_change_at || "",
        cst_rt: p.cst_rt || "",
        cod_class_trib_rt: p.cod_class_trib_rt || "",
        cbs_rt_percent: toInput(p.cbs_rt_percent),
        ibs_uf_rt_percent: toInput(p.ibs_uf_rt_percent),
        ibs_mun_rt_percent: toInput(p.ibs_mun_rt_percent),
        red_cbs_rt_percent: toInput(p.red_cbs_rt_percent),
        red_ibs_uf_rt_percent: toInput(p.red_ibs_uf_rt_percent),
        red_ibs_mun_rt_percent: toInput(p.red_ibs_mun_rt_percent),

        icms_st_ret_base: toInput(p.icms_st_ret_base),
        icms_st_ret_aliquota: toInput(p.icms_st_ret_aliquota),
        icms_st_ret_vlr_substituto: toInput(p.icms_st_ret_vlr_substituto),
        icms_st_ret_valor: toInput(p.icms_st_ret_valor),
        conversion_factor: toInput(p.conversion_factor ?? 1),
      };
    }

    setDraft(nextDraft);
  }

  function setField(id: string, field: keyof DraftRow, value: string) {
    setDraft((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return products.filter((p) => {
      const row = draft[p.id];
      if (!row) return false;

      const hasFiscalData =
        row.ncm ||
        row.cest ||
        row.cfop ||
        row.icms_cst ||
        row.pis_cst ||
        row.cofins_cst ||
        row.csosn;

      const matchUnused = showUnused ? true : !!hasFiscalData;

      const matchText =
        !q ||
        row.name.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q) ||
        row.ncm.toLowerCase().includes(q) ||
        row.cfop.toLowerCase().includes(q);

      const matchIcms =
        filterIcms === "all"
          ? true
          : row.icms_cst === filterIcms || row.csosn === filterIcms;

      return matchUnused && matchText && matchIcms;
    });
  }, [products, draft, search, filterIcms, showUnused]);

  async function saveAll() {
    setSaving(true);
    setMsg("");

    try {
      const payload = filtered.map((p) => {
        const row = draft[p.id];
        return {
          id: row.id,
          unit: row.unit,
          ncm: row.ncm,
          cest: row.cest,
          cfop: row.cfop,
          origin: row.origin,
          icms_cst: row.icms_cst,
          pis_cst: row.pis_cst,
          cofins_cst: row.cofins_cst,
          icms_percent: row.icms_percent,
          sit_trib: row.sit_trib,
          pis_percent: row.pis_percent,
          cofins_percent: row.cofins_percent,
          aliq_mun: row.aliq_mun,
          aliq_est: row.aliq_est,
          aliq_fed: row.aliq_fed,
          aliq_csosn: row.aliq_csosn,
          csosn: row.csosn,
          base_reduction_percent: row.base_reduction_percent,
          benefit_fiscal: row.benefit_fiscal,
          desoneration_percent: row.desoneration_percent,
          red_base_effective_percent: row.red_base_effective_percent,
          icms_effective_percent: row.icms_effective_percent,
          cst_rt: row.cst_rt,
          cod_class_trib_rt: row.cod_class_trib_rt,
          cbs_rt_percent: row.cbs_rt_percent,
          ibs_uf_rt_percent: row.ibs_uf_rt_percent,
          ibs_mun_rt_percent: row.ibs_mun_rt_percent,
          red_cbs_rt_percent: row.red_cbs_rt_percent,
          red_ibs_uf_rt_percent: row.red_ibs_uf_rt_percent,
          red_ibs_mun_rt_percent: row.red_ibs_mun_rt_percent,
          icms_st_ret_base: row.icms_st_ret_base || null,
          icms_st_ret_aliquota: row.icms_st_ret_aliquota || null,
          icms_st_ret_vlr_substituto: row.icms_st_ret_vlr_substituto || null,
          icms_st_ret_valor: row.icms_st_ret_valor || null,
          conversion_factor: row.conversion_factor || "1",
        };
      });

      const res = await fetch("/api/fiscal-products/batch-update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items: payload }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        setMsg(data?.error || "Erro ao salvar dados fiscais.");
        setSaving(false);
        return;
      }

      setMsg(`Dados fiscais salvos. Atualizados: ${data.updated ?? 0}.`);
      await loadProducts();
    } catch (e: any) {
      setMsg(e?.message || "Erro ao salvar dados fiscais.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fiscal de produtos"
        subtitle="Grade completa com scroll horizontal e vertical"
        right={
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/fiscal-products/template"
              className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50"
            >
              Baixar modelo
            </a>
            <button
              type="button"
              onClick={() => router.push("/adm/fiscal-produtos/importacao")}
              className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50"
            >
              Importar planilha
            </button>
            <button
              type="button"
              onClick={saveAll}
              disabled={saving}
              className="inline-flex h-11 items-center justify-center rounded-[18px] bg-cyan-600 px-4 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(8,145,178,0.22)] transition hover:bg-cyan-700 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar tabela"}
            </button>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm whitespace-pre-wrap text-slate-700">{msg}</div>
        </Card>
      ) : null}

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Input
            label="Buscar"
            placeholder="SKU, produto, NCM, CFOP..."
            value={search}
            onChange={setSearch}
          />
          <Select
            label="ICMS / CSOSN"
            value={filterIcms}
            onChange={setFilterIcms}
            options={[
              { value: "all", label: "Todos" },
              { value: "102", label: "CSOSN 102" },
              { value: "400", label: "CSOSN 400" },
              { value: "500", label: "CSOSN 500" },
              { value: "900", label: "CSOSN 900" },
              { value: "00", label: "CST 00" },
              { value: "60", label: "CST 60" },
            ]}
          />
          <div className="flex items-end gap-6 pb-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={showUnused}
                onChange={(e) => setShowUnused(e.target.checked)}
              />
              Carregar prod. não utilizados
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={showAdvanced}
                onChange={(e) => setShowAdvanced(e.target.checked)}
              />
              Exibir campos avançados
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={showReforma}
                onChange={(e) => setShowReforma(e.target.checked)}
              />
              Exibir campos reforma tributária
            </label>
          </div>
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="min-w-[3200px] w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">SKU</th>
                  <th className="sticky left-[120px] z-20 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Produto</th>

                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Unid.</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">NCM</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">CEST</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">CFOP</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">ICMS CST</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% ICMS</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Sit. Trib</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% PIS</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% COFINS</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">CST PIS</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">CST COFINS</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Alíq. mun</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Alíq. est</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Alíq. fed</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Origem</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Alíq. CSOSN</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">CSOSN</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% Base Red</th>

                  {showAdvanced ? (
                    <>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Benef. Fiscal</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% Deson.</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% Red. Base efet.</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% ICMS efetiva</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Data últ. alteração</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">CST RT</th>
                    </>
                  ) : null}

                  {showReforma ? (
                    <>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Cod. Class. Trib RT</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% CBS RT</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% IBS UF RT</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% IBS Mun RT</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% Red CBS RT</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% Red IBS UF RT</th>
                      <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">% Red IBS Mun RT</th>
                    </>
                  ) : null}

                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-blue-600 bg-blue-50">Fator Conversão</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-amber-600 bg-amber-50">ST Base Ret. (R$)</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-amber-600 bg-amber-50">ST Alíq. (%)</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-amber-600 bg-amber-50">ST Vlr Subst. (R$)</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-amber-600 bg-amber-50">ST Vlr Ret. (R$)</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={40} className="px-4 py-6 text-sm text-slate-600">
                      Carregando...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={40} className="px-4 py-6 text-sm text-slate-600">
                      Nenhum produto encontrado.
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => {
                    const row = draft[p.id];
                    return (
                      <tr key={p.id} className="border-b border-slate-100 align-top">
                        <td className="sticky left-0 z-10 bg-white px-4 py-3">
                          <div className="w-[120px] font-mono text-xs text-slate-700">{row.sku || "-"}</div>
                        </td>
                        <td className="sticky left-[120px] z-10 bg-white px-4 py-3">
                          <div className="w-[320px] text-sm font-semibold text-slate-900">{row.name || "-"}</div>
                        </td>

                        <td className="px-3 py-3"><TextCell value={row.unit} onChange={(v) => setField(p.id, "unit", v)} width="w-20" /></td>
                        <td className="px-3 py-3"><TextCell value={row.ncm} onChange={(v) => setField(p.id, "ncm", v)} width="w-24" /></td>
                        <td className="px-3 py-3"><TextCell value={row.cest} onChange={(v) => setField(p.id, "cest", v)} width="w-24" /></td>
                        <td className="px-3 py-3"><TextCell value={row.cfop} onChange={(v) => setField(p.id, "cfop", v)} width="w-20" /></td>
                        <td className="px-3 py-3"><TextCell value={row.icms_cst} onChange={(v) => setField(p.id, "icms_cst", v)} width="w-20" /></td>
                        <td className="px-3 py-3"><TextCell value={row.icms_percent} onChange={(v) => setField(p.id, "icms_percent", v)} width="w-20" /></td>
                        <td className="px-3 py-3"><TextCell value={row.sit_trib} onChange={(v) => setField(p.id, "sit_trib", v)} width="w-20" /></td>
                        <td className="px-3 py-3"><TextCell value={row.pis_percent} onChange={(v) => setField(p.id, "pis_percent", v)} width="w-20" /></td>
                        <td className="px-3 py-3"><TextCell value={row.cofins_percent} onChange={(v) => setField(p.id, "cofins_percent", v)} width="w-20" /></td>
                        <td className="px-3 py-3"><TextCell value={row.pis_cst} onChange={(v) => setField(p.id, "pis_cst", v)} width="w-20" /></td>
                        <td className="px-3 py-3"><TextCell value={row.cofins_cst} onChange={(v) => setField(p.id, "cofins_cst", v)} width="w-20" /></td>
                        <td className="px-3 py-3"><TextCell value={row.aliq_mun} onChange={(v) => setField(p.id, "aliq_mun", v)} width="w-20" /></td>
                        <td className="px-3 py-3"><TextCell value={row.aliq_est} onChange={(v) => setField(p.id, "aliq_est", v)} width="w-20" /></td>
                        <td className="px-3 py-3"><TextCell value={row.aliq_fed} onChange={(v) => setField(p.id, "aliq_fed", v)} width="w-20" /></td>
                        <td className="px-3 py-3"><TextCell value={row.origin} onChange={(v) => setField(p.id, "origin", v)} width="w-20" /></td>
                        <td className="px-3 py-3"><TextCell value={row.aliq_csosn} onChange={(v) => setField(p.id, "aliq_csosn", v)} width="w-20" /></td>
                        <td className="px-3 py-3"><TextCell value={row.csosn} onChange={(v) => setField(p.id, "csosn", v)} width="w-20" /></td>
                        <td className="px-3 py-3"><TextCell value={row.base_reduction_percent} onChange={(v) => setField(p.id, "base_reduction_percent", v)} width="w-20" /></td>

                        {showAdvanced ? (
                          <>
                            <td className="px-3 py-3"><TextCell value={row.benefit_fiscal} onChange={(v) => setField(p.id, "benefit_fiscal", v)} width="w-24" /></td>
                            <td className="px-3 py-3"><TextCell value={row.desoneration_percent} onChange={(v) => setField(p.id, "desoneration_percent", v)} width="w-20" /></td>
                            <td className="px-3 py-3"><TextCell value={row.red_base_effective_percent} onChange={(v) => setField(p.id, "red_base_effective_percent", v)} width="w-20" /></td>
                            <td className="px-3 py-3"><TextCell value={row.icms_effective_percent} onChange={(v) => setField(p.id, "icms_effective_percent", v)} width="w-20" /></td>
                            <td className="px-3 py-3">
                              <div className="w-28 text-xs text-slate-600">
                                {row.last_fiscal_change_at ? new Date(row.last_fiscal_change_at).toLocaleDateString("pt-BR") : "-"}
                              </div>
                            </td>
                            <td className="px-3 py-3"><TextCell value={row.cst_rt} onChange={(v) => setField(p.id, "cst_rt", v)} width="w-28" /></td>
                          </>
                        ) : null}

                        {showReforma ? (
                          <>
                            <td className="px-3 py-3"><TextCell value={row.cod_class_trib_rt} onChange={(v) => setField(p.id, "cod_class_trib_rt", v)} width="w-24" /></td>
                            <td className="px-3 py-3"><TextCell value={row.cbs_rt_percent} onChange={(v) => setField(p.id, "cbs_rt_percent", v)} width="w-20" /></td>
                            <td className="px-3 py-3"><TextCell value={row.ibs_uf_rt_percent} onChange={(v) => setField(p.id, "ibs_uf_rt_percent", v)} width="w-20" /></td>
                            <td className="px-3 py-3"><TextCell value={row.ibs_mun_rt_percent} onChange={(v) => setField(p.id, "ibs_mun_rt_percent", v)} width="w-20" /></td>
                            <td className="px-3 py-3"><TextCell value={row.red_cbs_rt_percent} onChange={(v) => setField(p.id, "red_cbs_rt_percent", v)} width="w-20" /></td>
                            <td className="px-3 py-3"><TextCell value={row.red_ibs_uf_rt_percent} onChange={(v) => setField(p.id, "red_ibs_uf_rt_percent", v)} width="w-20" /></td>
                            <td className="px-3 py-3"><TextCell value={row.red_ibs_mun_rt_percent} onChange={(v) => setField(p.id, "red_ibs_mun_rt_percent", v)} width="w-20" /></td>
                          </>
                        ) : null}

                        <td className="px-3 py-3 bg-blue-50">
                          <TextCell
                            value={row.conversion_factor}
                            onChange={(v) => setField(p.id, "conversion_factor", v)}
                            width="w-24"
                            placeholder="ex: 6.6667"
                          />
                          <div className="mt-1 text-xs text-blue-500">
                            {row.csosn === "500" || row.icms_cst === "500" ? "⚠️ obrigatório" : ""}
                          </div>
                        </td>
                        <td className="px-3 py-3 bg-amber-50"><TextCell value={row.icms_st_ret_base} onChange={(v) => setField(p.id, "icms_st_ret_base", v)} width="w-28" placeholder="ex: 4262.60" /></td>
                        <td className="px-3 py-3 bg-amber-50"><TextCell value={row.icms_st_ret_aliquota} onChange={(v) => setField(p.id, "icms_st_ret_aliquota", v)} width="w-20" placeholder="ex: 18.00" /></td>
                        <td className="px-3 py-3 bg-amber-50"><TextCell value={row.icms_st_ret_vlr_substituto} onChange={(v) => setField(p.id, "icms_st_ret_vlr_substituto", v)} width="w-28" placeholder="ex: 568.35" /></td>
                        <td className="px-3 py-3 bg-amber-50"><TextCell value={row.icms_st_ret_valor} onChange={(v) => setField(p.id, "icms_st_ret_valor", v)} width="w-28" placeholder="ex: 198.92" /></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-5 shadow-sm md:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="blue">{filtered.length} produto(s) na grade</Badge>
          <span className="text-sm text-slate-600">
            Grade completa com rolagem horizontal e vertical. Os campos já podem ser usados pela emissão fiscal nas próximas etapas.
          </span>
        </div>
      </div>
    </div>
  );
}