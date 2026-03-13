import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

function envOrThrow(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function cleanNumber(v: unknown) {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo não enviado." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(bytes, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });

    if (!rows.length) {
      return NextResponse.json({ error: "Planilha vazia." }, { status: 400 });
    }

    const supabaseUrl = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRole = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [index, row] of rows.entries()) {
      const line = index + 2;

      const productId = clean(row.product_id);
      const sku = clean(row.sku);

      let targetId = productId;

      if (!targetId && sku) {
        const findRes = await fetch(
          `${supabaseUrl}/rest/v1/products?sku=eq.${encodeURIComponent(sku)}&select=id&limit=1`,
          {
            headers: {
              apikey: serviceRole,
              Authorization: `Bearer ${serviceRole}`,
              "Content-Type": "application/json",
            },
            cache: "no-store",
          }
        );

        if (!findRes.ok) {
          const txt = await findRes.text();
          errors.push(`Linha ${line}: erro ao localizar SKU ${sku}: ${txt}`);
          skipped++;
          continue;
        }

        const found = await findRes.json();
        targetId = found?.[0]?.id || "";
      }

      if (!targetId) {
        errors.push(`Linha ${line}: produto não encontrado.`);
        skipped++;
        continue;
      }

      const patch = {
        unit: clean(row.unidade) || null,
        ncm: clean(row.ncm) || null,
        cest: clean(row.cest) || null,
        cfop: clean(row.cfop) || null,
        origin: clean(row.origem) || null,
        icms_cst: clean(row.icms_cst) || null,
        pis_cst: clean(row.pis_cst) || null,
        cofins_cst: clean(row.cofins_cst) || null,

        icms_percent: cleanNumber(row.icms_percent),
        sit_trib: clean(row.sit_trib) || null,
        pis_percent: cleanNumber(row.pis_percent),
        cofins_percent: cleanNumber(row.cofins_percent),
        aliq_mun: cleanNumber(row.aliq_mun),
        aliq_est: cleanNumber(row.aliq_est),
        aliq_fed: cleanNumber(row.aliq_fed),
        aliq_csosn: cleanNumber(row.aliq_csosn),
        csosn: clean(row.csosn) || null,
        base_reduction_percent: cleanNumber(row.base_reduction_percent),
        benefit_fiscal: clean(row.benefit_fiscal) || null,
        desoneration_percent: cleanNumber(row.desoneration_percent),
        red_base_effective_percent: cleanNumber(row.red_base_effective_percent),
        icms_effective_percent: cleanNumber(row.icms_effective_percent),
        cst_rt: clean(row.cst_rt) || null,
        cod_class_trib_rt: clean(row.cod_class_trib_rt) || null,
        cbs_rt_percent: cleanNumber(row.cbs_rt_percent),
        ibs_uf_rt_percent: cleanNumber(row.ibs_uf_rt_percent),
        ibs_mun_rt_percent: cleanNumber(row.ibs_mun_rt_percent),
        red_cbs_rt_percent: cleanNumber(row.red_cbs_rt_percent),
        red_ibs_uf_rt_percent: cleanNumber(row.red_ibs_uf_rt_percent),
        red_ibs_mun_rt_percent: cleanNumber(row.red_ibs_mun_rt_percent),
        last_fiscal_change_at: new Date().toISOString(),
      };

      const updateRes = await fetch(
        `${supabaseUrl}/rest/v1/products?id=eq.${encodeURIComponent(targetId)}`,
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

      if (!updateRes.ok) {
        const txt = await updateRes.text();
        errors.push(`Linha ${line}: erro ao atualizar produto ${targetId}: ${txt}`);
        skipped++;
        continue;
      }

      updated++;
    }

    return NextResponse.json({
      ok: true,
      updated,
      skipped,
      errors,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao importar planilha." },
      { status: 500 }
    );
  }
}