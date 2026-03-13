import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

function envOrThrow(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

export async function GET() {
  try {
    const supabaseUrl = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRole = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");

    const res = await fetch(
      `${supabaseUrl}/rest/v1/products?select=id,sku,name,unit,ncm,cest,cfop,origin,icms_cst,pis_cst,cofins_cst,icms_percent,sit_trib,pis_percent,cofins_percent,aliq_mun,aliq_est,aliq_fed,aliq_csosn,csosn,base_reduction_percent,benefit_fiscal,desoneration_percent,red_base_effective_percent,icms_effective_percent,last_fiscal_change_at,cst_rt,cod_class_trib_rt,cbs_rt_percent,ibs_uf_rt_percent,ibs_mun_rt_percent,red_cbs_rt_percent,red_ibs_uf_rt_percent,red_ibs_mun_rt_percent&order=name.asc`,
      {
        headers: {
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json({ error: `Erro ao buscar produtos: ${txt}` }, { status: 500 });
    }

    const products = await res.json();

    const rows = (products ?? []).map((p: any) => ({
      product_id: p.id || "",
      sku: p.sku || "",
      produto: p.name || "",
      unidade: p.unit || "",
      ncm: p.ncm || "",
      cest: p.cest || "",
      cfop: p.cfop || "",
      origem: p.origin || "",
      icms_cst: p.icms_cst || "",
      pis_cst: p.pis_cst || "",
      cofins_cst: p.cofins_cst || "",
      icms_percent: p.icms_percent ?? "",
      sit_trib: p.sit_trib || "",
      pis_percent: p.pis_percent ?? "",
      cofins_percent: p.cofins_percent ?? "",
      aliq_mun: p.aliq_mun ?? "",
      aliq_est: p.aliq_est ?? "",
      aliq_fed: p.aliq_fed ?? "",
      aliq_csosn: p.aliq_csosn ?? "",
      csosn: p.csosn || "",
      base_reduction_percent: p.base_reduction_percent ?? "",
      benefit_fiscal: p.benefit_fiscal || "",
      desoneration_percent: p.desoneration_percent ?? "",
      red_base_effective_percent: p.red_base_effective_percent ?? "",
      icms_effective_percent: p.icms_effective_percent ?? "",
      last_fiscal_change_at: p.last_fiscal_change_at || "",
      cst_rt: p.cst_rt || "",
      cod_class_trib_rt: p.cod_class_trib_rt || "",
      cbs_rt_percent: p.cbs_rt_percent ?? "",
      ibs_uf_rt_percent: p.ibs_uf_rt_percent ?? "",
      ibs_mun_rt_percent: p.ibs_mun_rt_percent ?? "",
      red_cbs_rt_percent: p.red_cbs_rt_percent ?? "",
      red_ibs_uf_rt_percent: p.red_ibs_uf_rt_percent ?? "",
      red_ibs_mun_rt_percent: p.red_ibs_mun_rt_percent ?? "",
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "FiscalProdutos");

    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="modelo_fiscal_produtos_completo.xlsx"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao gerar planilha." },
      { status: 500 }
    );
  }
}