"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";
import { PageHeader, Card, Input, Select, Badge } from "@/app/components/ui";

type Mode = "create" | "edit";

type ProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
};

type EmitterRow = {
  id: string;
  name: string;
};

type FormState = {
  name: string;
  is_active: boolean;
  priority: string;

  product_id: string;
  emitter_id: string;

  uf_dest: string;
  operation_scope: string;
  customer_taxpayer_type: string;
  operation_type: string;

  cfop: string;
  ncm: string;
  cest: string;
  origin: string;

  icms_code: string;
  icms_modbc: string;
  icms_aliquota: string;
  icms_reduction_percent: string;

  icms_st_enabled: boolean;
  icms_st_mva: string;
  icms_st_aliquota: string;
  icms_st_reduction_percent: string;
  icms_base_calculo_retido_st: string;
  icms_aliquota_final: string;
  icms_valor_substituto: string;
  icms_valor_retido_st: string;

  pis_cst: string;
  pis_aliquota: string;
  cofins_cst: string;
  cofins_aliquota: string;

  ipi_cst: string;
  ipi_aliquota: string;
  ipi_cenq: string;

  freight_mode: string;
  additional_info: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  is_active: true,
  priority: "100",

  product_id: "",
  emitter_id: "",

  uf_dest: "",
  operation_scope: "",
  customer_taxpayer_type: "",
  operation_type: "",

  cfop: "",
  ncm: "",
  cest: "",
  origin: "0",

  icms_code: "",
  icms_modbc: "",
  icms_aliquota: "",
  icms_reduction_percent: "",

  icms_st_enabled: false,
  icms_st_mva: "",
  icms_st_aliquota: "",
  icms_st_reduction_percent: "",
  icms_base_calculo_retido_st: "",
  icms_aliquota_final: "",
  icms_valor_substituto: "",
  icms_valor_retido_st: "",

  pis_cst: "",
  pis_aliquota: "",
  cofins_cst: "",
  cofins_aliquota: "",

  ipi_cst: "",
  ipi_aliquota: "",
  ipi_cenq: "",

  freight_mode: "ZERAR",
  additional_info: "",
};

function toNullableNumber(v: string) {
  const s = String(v || "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export default function FiscalRuleFormPage({
  mode,
  ruleId,
  onSaved,
}: {
  mode: Mode;
  ruleId: string | null;
  onSaved: (id: string) => void;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [emitters, setEmitters] = useState<EmitterRow[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    (async () => {
      const ok = await requireAdminOrRedirect(router);
      if (!ok) return;
      await loadOptions();
      if (mode === "edit" && ruleId) {
        await loadRule(ruleId);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, ruleId]);

  async function loadOptions() {
    const [{ data: prodData }, { data: emitData }] = await Promise.all([
      supabase.from("products").select("id,name,sku").order("name", { ascending: true }),
      supabase.from("emitters").select("id,name").eq("is_active", true).order("name", { ascending: true }),
    ]);

    setProducts((prodData ?? []) as ProductRow[]);
    setEmitters((emitData ?? []) as EmitterRow[]);
  }

  async function loadRule(id: string) {
    const { data, error } = await supabase.from("fiscal_rules").select("*").eq("id", id).maybeSingle();

    if (error || !data) {
      setMsg(error?.message || "Regra não encontrada.");
      return;
    }

    setForm({
      name: data.name || "",
      is_active: !!data.is_active,
      priority: String(data.priority ?? "100"),

      product_id: data.product_id || "",
      emitter_id: data.emitter_id || "",

      uf_dest: data.uf_dest || "",
      operation_scope: data.operation_scope || "",
      customer_taxpayer_type: data.customer_taxpayer_type || "",
      operation_type: data.operation_type || "",

      cfop: data.cfop || "",
      ncm: data.ncm || "",
      cest: data.cest || "",
      origin: data.origin || "0",

      icms_code: data.icms_code || "",
      icms_modbc: data.icms_modbc || "",
      icms_aliquota: data.icms_aliquota != null ? String(data.icms_aliquota) : "",
      icms_reduction_percent: data.icms_reduction_percent != null ? String(data.icms_reduction_percent) : "",

      icms_st_enabled: !!data.icms_st_enabled,
      icms_st_mva: data.icms_st_mva != null ? String(data.icms_st_mva) : "",
      icms_st_aliquota: data.icms_st_aliquota != null ? String(data.icms_st_aliquota) : "",
      icms_st_reduction_percent: data.icms_st_reduction_percent != null ? String(data.icms_st_reduction_percent) : "",
      icms_base_calculo_retido_st: data.icms_base_calculo_retido_st != null ? String(data.icms_base_calculo_retido_st) : "",
      icms_aliquota_final: data.icms_aliquota_final != null ? String(data.icms_aliquota_final) : "",
      icms_valor_substituto: data.icms_valor_substituto != null ? String(data.icms_valor_substituto) : "",
      icms_valor_retido_st: data.icms_valor_retido_st != null ? String(data.icms_valor_retido_st) : "",

      pis_cst: data.pis_cst || "",
      pis_aliquota: data.pis_aliquota != null ? String(data.pis_aliquota) : "",
      cofins_cst: data.cofins_cst || "",
      cofins_aliquota: data.cofins_aliquota != null ? String(data.cofins_aliquota) : "",

      ipi_cst: data.ipi_cst || "",
      ipi_aliquota: data.ipi_aliquota != null ? String(data.ipi_aliquota) : "",
      ipi_cenq: data.ipi_cenq || "",

      freight_mode: data.freight_mode || "ZERAR",
      additional_info: data.additional_info || "",
    });
  }

  async function saveRule() {
    setSaving(true);
    setMsg("");

    try {
      if (!form.name.trim()) {
        setMsg("Nome da regra é obrigatório.");
        setSaving(false);
        return;
      }

      const payload = {
        name: form.name.trim(),
        is_active: form.is_active,
        priority: Number(form.priority || 100),

        product_id: form.product_id || null,
        emitter_id: form.emitter_id || null,

        uf_dest: form.uf_dest.trim().toUpperCase() || null,
        operation_scope: form.operation_scope || null,
        customer_taxpayer_type: form.customer_taxpayer_type || null,
        operation_type: form.operation_type || null,

        cfop: form.cfop.trim() || null,
        ncm: form.ncm.trim() || null,
        cest: form.cest.trim() || null,
        origin: form.origin.trim() || null,

        icms_code: form.icms_code.trim() || null,
        icms_modbc: form.icms_modbc.trim() || null,
        icms_aliquota: toNullableNumber(form.icms_aliquota),
        icms_reduction_percent: toNullableNumber(form.icms_reduction_percent),

        icms_st_enabled: form.icms_st_enabled,
        icms_st_mva: toNullableNumber(form.icms_st_mva),
        icms_st_aliquota: toNullableNumber(form.icms_st_aliquota),
        icms_st_reduction_percent: toNullableNumber(form.icms_st_reduction_percent),
        icms_base_calculo_retido_st: toNullableNumber(form.icms_base_calculo_retido_st),
        icms_aliquota_final: toNullableNumber(form.icms_aliquota_final),
        icms_valor_substituto: toNullableNumber(form.icms_valor_substituto),
        icms_valor_retido_st: toNullableNumber(form.icms_valor_retido_st),

        pis_cst: form.pis_cst.trim() || null,
        pis_aliquota: toNullableNumber(form.pis_aliquota),
        cofins_cst: form.cofins_cst.trim() || null,
        cofins_aliquota: toNullableNumber(form.cofins_aliquota),

        ipi_cst: form.ipi_cst.trim() || null,
        ipi_aliquota: toNullableNumber(form.ipi_aliquota),
        ipi_cenq: form.ipi_cenq.trim() || null,

        freight_mode: form.freight_mode || null,
        additional_info: form.additional_info.trim() || null,
      };

      if (mode === "edit" && ruleId) {
        const { error } = await supabase.from("fiscal_rules").update(payload).eq("id", ruleId);
        if (error) {
          setMsg(error.message);
          setSaving(false);
          return;
        }
        setSaving(false);
        setMsg("Regra fiscal atualizada.");
        onSaved(ruleId);
        return;
      }

      const { data, error } = await supabase.from("fiscal_rules").insert(payload).select("id").single();

      if (error || !data) {
        setMsg(error?.message || "Erro ao criar regra.");
        setSaving(false);
        return;
      }

      setSaving(false);
      setMsg("Regra fiscal criada.");
      onSaved(data.id);
    } catch (e: any) {
      setMsg(e?.message || "Erro ao salvar regra.");
      setSaving(false);
    }
  }

  const title = useMemo(() => (mode === "edit" ? "Editar regra fiscal" : "Nova regra fiscal"), [mode]);

  if (loading) {
    return <Card>Carregando...</Card>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle="Cadastro completo de tributação por operação"
        right={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push("/adm/regras-fiscais")}
              className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={saveRule}
              disabled={saving}
              className="inline-flex h-11 items-center justify-center rounded-[18px] bg-cyan-600 px-4 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(8,145,178,0.22)] transition hover:bg-cyan-700 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar regra"}
            </button>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm text-red-600 whitespace-pre-wrap">{msg}</div>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Identificação</div>
            {form.is_active ? <Badge tone="green">Ativa</Badge> : <Badge tone="red">Inativa</Badge>}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Input label="Nome da regra" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} />
            <Input label="Prioridade" value={form.priority} onChange={(v) => setForm((p) => ({ ...p, priority: v }))} type="number" />
            <Select
              label="Produto"
              value={form.product_id}
              onChange={(v) => setForm((p) => ({ ...p, product_id: v }))}
              options={[
                { value: "", label: "Geral / sem produto fixo" },
                ...products.map((p) => ({ value: p.id, label: `${p.name || "-"}${p.sku ? ` - ${p.sku}` : ""}` })),
              ]}
            />
            <Select
              label="Emitente"
              value={form.emitter_id}
              onChange={(v) => setForm((p) => ({ ...p, emitter_id: v }))}
              options={[
                { value: "", label: "Qualquer emitente" },
                ...emitters.map((e) => ({ value: e.id, label: e.name })),
              ]}
            />
          </div>

          <div className="mt-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
              />
              Regra ativa
            </label>
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="text-sm font-semibold text-slate-900">Contexto da operação</div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Input label="UF destino" value={form.uf_dest} onChange={(v) => setForm((p) => ({ ...p, uf_dest: v.toUpperCase() }))} />
            <Select
              label="Escopo"
              value={form.operation_scope}
              onChange={(v) => setForm((p) => ({ ...p, operation_scope: v }))}
              options={[
                { value: "", label: "Não definido" },
                { value: "INTERNA", label: "Interna" },
                { value: "INTERESTADUAL", label: "Interestadual" },
              ]}
            />
            <Select
              label="Tipo destinatário"
              value={form.customer_taxpayer_type}
              onChange={(v) => setForm((p) => ({ ...p, customer_taxpayer_type: v }))}
              options={[
                { value: "", label: "Não definido" },
                { value: "CONTRIBUINTE", label: "Contribuinte" },
                { value: "NAO_CONTRIBUINTE", label: "Não contribuinte" },
                { value: "ISENTO", label: "Isento" },
              ]}
            />
            <Select
              label="Tipo operação"
              value={form.operation_type}
              onChange={(v) => setForm((p) => ({ ...p, operation_type: v }))}
              options={[
                { value: "", label: "Não definido" },
                { value: "VENDA", label: "Venda" },
                { value: "TRANSFERENCIA", label: "Transferência" },
                { value: "BONIFICACAO", label: "Bonificação" },
                { value: "DEVOLUCAO", label: "Devolução" },
                { value: "OUTRA", label: "Outra" },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="text-sm font-semibold text-slate-900">Base fiscal do item</div>

        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <Input label="CFOP" value={form.cfop} onChange={(v) => setForm((p) => ({ ...p, cfop: v }))} />
          <Input label="NCM" value={form.ncm} onChange={(v) => setForm((p) => ({ ...p, ncm: v }))} />
          <Input label="CEST" value={form.cest} onChange={(v) => setForm((p) => ({ ...p, cest: v }))} />
          <Input label="Origem" value={form.origin} onChange={(v) => setForm((p) => ({ ...p, origin: v }))} />
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="text-sm font-semibold text-slate-900">ICMS</div>

        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <Input label="CSOSN / CST" value={form.icms_code} onChange={(v) => setForm((p) => ({ ...p, icms_code: v }))} />
          <Input label="modBC" value={form.icms_modbc} onChange={(v) => setForm((p) => ({ ...p, icms_modbc: v }))} />
          <Input label="Alíquota ICMS" value={form.icms_aliquota} onChange={(v) => setForm((p) => ({ ...p, icms_aliquota: v }))} />
          <Input label="% Redução BC" value={form.icms_reduction_percent} onChange={(v) => setForm((p) => ({ ...p, icms_reduction_percent: v }))} />
        </div>

        <div className="mt-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.icms_st_enabled}
              onChange={(e) => setForm((p) => ({ ...p, icms_st_enabled: e.target.checked }))}
            />
            Habilitar ST / retenções
          </label>
        </div>

        {form.icms_st_enabled ? (
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <Input label="MVA" value={form.icms_st_mva} onChange={(v) => setForm((p) => ({ ...p, icms_st_mva: v }))} />
            <Input label="Alíquota ST" value={form.icms_st_aliquota} onChange={(v) => setForm((p) => ({ ...p, icms_st_aliquota: v }))} />
            <Input label="% Redução ST" value={form.icms_st_reduction_percent} onChange={(v) => setForm((p) => ({ ...p, icms_st_reduction_percent: v }))} />
            <Input label="Base BC ST retida" value={form.icms_base_calculo_retido_st} onChange={(v) => setForm((p) => ({ ...p, icms_base_calculo_retido_st: v }))} />
            <Input label="Alíquota final" value={form.icms_aliquota_final} onChange={(v) => setForm((p) => ({ ...p, icms_aliquota_final: v }))} />
            <Input label="Valor substituto" value={form.icms_valor_substituto} onChange={(v) => setForm((p) => ({ ...p, icms_valor_substituto: v }))} />
            <Input label="Valor ST retido" value={form.icms_valor_retido_st} onChange={(v) => setForm((p) => ({ ...p, icms_valor_retido_st: v }))} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="text-sm font-semibold text-slate-900">PIS / COFINS</div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Input label="PIS CST" value={form.pis_cst} onChange={(v) => setForm((p) => ({ ...p, pis_cst: v }))} />
            <Input label="PIS alíquota" value={form.pis_aliquota} onChange={(v) => setForm((p) => ({ ...p, pis_aliquota: v }))} />
            <Input label="COFINS CST" value={form.cofins_cst} onChange={(v) => setForm((p) => ({ ...p, cofins_cst: v }))} />
            <Input label="COFINS alíquota" value={form.cofins_aliquota} onChange={(v) => setForm((p) => ({ ...p, cofins_aliquota: v }))} />
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="text-sm font-semibold text-slate-900">IPI</div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Input label="IPI CST" value={form.ipi_cst} onChange={(v) => setForm((p) => ({ ...p, ipi_cst: v }))} />
            <Input label="IPI alíquota" value={form.ipi_aliquota} onChange={(v) => setForm((p) => ({ ...p, ipi_aliquota: v }))} />
            <Input label="cEnq" value={form.ipi_cenq} onChange={(v) => setForm((p) => ({ ...p, ipi_cenq: v }))} />
          </div>
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="text-sm font-semibold text-slate-900">Frete e observações</div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Select
            label="Modo do frete"
            value={form.freight_mode}
            onChange={(v) => setForm((p) => ({ ...p, freight_mode: v }))}
            options={[
              { value: "ZERAR", label: "Zerar na NF-e" },
              { value: "DESTACAR", label: "Destacar" },
              { value: "RATEAR", label: "Ratear" },
            ]}
          />
          <Input
            label="Informação adicional"
            value={form.additional_info}
            onChange={(v) => setForm((p) => ({ ...p, additional_info: v }))}
          />
        </div>
      </div>
    </div>
  );
}