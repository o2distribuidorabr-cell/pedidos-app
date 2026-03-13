import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type ItemPayload = {
  id: string;
  unit?: string | null;
  ncm?: string | null;
  cest?: string | null;
  cfop?: string | null;
  origin?: string | null;
  icms_cst?: string | null;
  pis_cst?: string | null;
  cofins_cst?: string | null;

  icms_percent?: string | null;
  sit_trib?: string | null;
  pis_percent?: string | null;
  cofins_percent?: string | null;
  aliq_mun?: string | null;
  aliq_est?: string | null;
  aliq_fed?: string | null;
  aliq_csosn?: string | null;
  csosn?: string | null;
  base_reduction_percent?: string | null;
  benefit_fiscal?: string | null;
  desoneration_percent?: string | null;
  red_base_effective_percent?: string | null;
  icms_effective_percent?: string | null;
  cst_rt?: string | null;
  cod_class_trib_rt?: string | null;
  cbs_rt_percent?: string | null;
  ibs_uf_rt_percent?: string | null;
  ibs_mun_rt_percent?: string | null;
  red_cbs_rt_percent?: string | null;
  red_ibs_uf_rt_percent?: string | null;
  red_ibs_mun_rt_percent?: string | null;
};

function envOrThrow(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

function clean(v: unknown) {
  const s = String(v ?? "").trim();
  return s || null;
}

function cleanNumber(v: unknown) {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items = (body?.items ?? []) as ItemPayload[];

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: false, error: "Nenhum item enviado." }, { status: 400 });
    }

    const supabaseUrl = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRole = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");

    let updated = 0;
    const errors: string[] = [];

    for (const item of items) {
      if (!item?.id) {
        errors.push("Item sem ID.");
        continue;
      }

      const patch = {
        unit: clean(item.unit),
        ncm: clean(item.ncm),
        cest: clean(item.cest),
        cfop: clean(item.cfop),
        origin: clean(item.origin),
        icms_cst: clean(item.icms_cst),
        pis_cst: clean(item.pis_cst),
        cofins_cst: clean(item.cofins_cst),

        icms_percent: cleanNumber(item.icms_percent),
        sit_trib: clean(item.sit_trib),
        pis_percent: cleanNumber(item.pis_percent),
        cofins_percent: cleanNumber(item.cofins_percent),
        aliq_mun: cleanNumber(item.aliq_mun),
        aliq_est: cleanNumber(item.aliq_est),
        aliq_fed: cleanNumber(item.aliq_fed),
        aliq_csosn: cleanNumber(item.aliq_csosn),
        csosn: clean(item.csosn),
        base_reduction_percent: cleanNumber(item.base_reduction_percent),
        benefit_fiscal: clean(item.benefit_fiscal),
        desoneration_percent: cleanNumber(item.desoneration_percent),
        red_base_effective_percent: cleanNumber(item.red_base_effective_percent),
        icms_effective_percent: cleanNumber(item.icms_effective_percent),
        cst_rt: clean(item.cst_rt),
        cod_class_trib_rt: clean(item.cod_class_trib_rt),
        cbs_rt_percent: cleanNumber(item.cbs_rt_percent),
        ibs_uf_rt_percent: cleanNumber(item.ibs_uf_rt_percent),
        ibs_mun_rt_percent: cleanNumber(item.ibs_mun_rt_percent),
        red_cbs_rt_percent: cleanNumber(item.red_cbs_rt_percent),
        red_ibs_uf_rt_percent: cleanNumber(item.red_ibs_uf_rt_percent),
        red_ibs_mun_rt_percent: cleanNumber(item.red_ibs_mun_rt_percent),

        last_fiscal_change_at: new Date().toISOString(),
      };

      const res = await fetch(
        `${supabaseUrl}/rest/v1/products?id=eq.${encodeURIComponent(item.id)}`,
        {
          method: "PATCH",
          headers: {
            apikey: serviceRole,
            Authorization: `Bearer ${serviceRole}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify(patch),
        }
      );

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        errors.push(`Produto ${item.id}: ${txt || res.status}`);
        continue;
      }

      updated++;
    }

    return NextResponse.json({
      ok: true,
      updated,
      errors,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "Erro ao salvar produtos fiscais.",
      },
      { status: 500 }
    );
  }
}