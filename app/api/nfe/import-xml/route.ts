import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedNFeItem = {
  nItem: number;
  cProd: string;
  cEAN: string;
  xProd: string;
  NCM: string;
  CFOP: string;
  uCom: string;
  qCom: number;
  vUnCom: number;
  vProd: number;
  // ICMS
  CST: string | null;
  vBC: number;
  pICMS: number;
  vICMS: number;
  // ST
  modBCST: string | null;
  pMVAST: number;
  vBCST: number;
  pICMSST: number;
  vICMSST: number;
};

type ParsedNFe = {
  chNFe: string;
  nNF: string;
  cnpjEmit: string;
  xNomeEmit: string;
  dhEmi: string;
  items: ParsedNFeItem[];
};

type ProductRow = {
  id: string;
  sku: string | null;
  name: string | null;
  ean: string | null;
  conversion_factor: number;
};

type ImportResult = {
  ok: boolean;
  nfe: { chave: string; numero: string; fornecedor: string; data: string };
  imported: Array<{
    product_id: string;
    product_name: string;
    nItem: number;
    xProd: string;
    quantity_in: number;
    quantity_remaining: number;
    st_base_unit: number;
    st_rate: number;
    st_icms_substitute_unit: number;
    st_value_unit: number;
    original_st_base: number;
    original_st_value: number;
    entry_id: string;
  }>;
  skipped: Array<{ nItem: number; xProd: string; reason: string }>;
  errors: string[];
};

// ─── XML Parser (sem dependência externa — usa regex robusto) ─────────────────

function getTag(xml: string, tag: string): string {
  // Tenta com namespace e sem namespace
  const patterns = [
    new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, "i"),
  ];
  for (const re of patterns) {
    const m = xml.match(re);
    if (m) return m[1].trim();
  }
  return "";
}

function getNum(xml: string, tag: string): number {
  const v = getTag(xml, tag);
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function getAllBlocks(xml: string, tag: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<(?:[^:>]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1]);
  }
  return results;
}

function extractCSTFromICMS(icmsBlock: string): {
  cst: string;
  vBC: number;
  pICMS: number;
  vICMS: number;
  vBCST: number;
  pICMSST: number;
  vICMSST: number;
  modBCST: string;
  pMVAST: number;
} {
  return {
    cst: getTag(icmsBlock, "CST") || getTag(icmsBlock, "CSOSN") || "",
    vBC: getNum(icmsBlock, "vBC"),
    pICMS: getNum(icmsBlock, "pICMS"),
    vICMS: getNum(icmsBlock, "vICMS"),
    vBCST: getNum(icmsBlock, "vBCST"),
    pICMSST: getNum(icmsBlock, "pICMSST"),
    vICMSST: getNum(icmsBlock, "vICMSST"),
    modBCST: getTag(icmsBlock, "modBCST"),
    pMVAST: getNum(icmsBlock, "pMVAST"),
  };
}

export function parseNFeXML(xml: string): ParsedNFe {
  // Remove BOM e espaços
  const clean = xml.replace(/^\uFEFF/, "").trim();

  const chNFe =
    getTag(clean, "chNFe") ||
    (() => {
      const m = clean.match(/Id="NFe(\d{44})"/);
      return m ? m[1] : "";
    })();

  const ideBlock = getTag(clean, "ide");
  const emitBlock = getTag(clean, "emit");

  const nNF = getTag(ideBlock, "nNF");
  const dhEmi = getTag(ideBlock, "dhEmi");
  const cnpjEmit = getTag(emitBlock, "CNPJ");
  const xNomeEmit = getTag(emitBlock, "xNome");

  // Pega todos os blocos <det>
  const detBlocks = getAllBlocks(clean, "det");

  const items: ParsedNFeItem[] = detBlocks.map((det, idx) => {
    const prod = getTag(det, "prod");
    const imposto = getTag(det, "imposto");
    const icmsOuter = getTag(imposto, "ICMS");

    // Extrai CST de qualquer sub-bloco ICMS (ICMS00, ICMS10, ICMS60, etc.)
    const icmsInner =
      icmsOuter ||
      getAllBlocks(imposto, "ICMS")[0] ||
      det;

    const icmsData = extractCSTFromICMS(icmsInner);

    return {
      nItem: idx + 1,
      cProd: getTag(prod, "cProd"),
      cEAN: getTag(prod, "cEAN"),
      xProd: getTag(prod, "xProd"),
      NCM: getTag(prod, "NCM"),
      CFOP: getTag(prod, "CFOP"),
      uCom: getTag(prod, "uCom"),
      qCom: getNum(prod, "qCom"),
      vUnCom: getNum(prod, "vUnCom"),
      vProd: getNum(prod, "vProd"),
      CST: icmsData.cst || null,
      vBC: icmsData.vBC,
      pICMS: icmsData.pICMS,
      vICMS: icmsData.vICMS,
      modBCST: icmsData.modBCST || null,
      pMVAST: icmsData.pMVAST,
      vBCST: icmsData.vBCST,
      pICMSST: icmsData.pICMSST,
      vICMSST: icmsData.vICMSST,
    };
  });

  return { chNFe, nNF, cnpjEmit, xNomeEmit, dhEmi, items };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function onlyDigits(v: string) {
  return v.replace(/\D/g, "");
}

function round(v: number, decimals = 6): number {
  return Math.round((v + Number.EPSILON) * 10 ** decimals) / 10 ** decimals;
}

function envOrThrow(name: string): string {
  const v = String(process.env[name] || "").trim();
  if (!v) throw new Error(`Variável ${name} não configurada.`);
  return v;
}

// ─── Busca produto no Supabase ─────────────────────────────────────────────────

async function findProduct(
  supabaseUrl: string,
  headers: Record<string, string>,
  item: ParsedNFeItem
): Promise<ProductRow | null> {
  // Tenta por EAN
  if (item.cEAN && item.cEAN !== "SEM GTIN") {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/products?ean=eq.${encodeURIComponent(item.cEAN)}&select=id,sku,name,ean,conversion_factor&limit=1`,
      { headers, cache: "no-store" }
    );
    if (res.ok) {
      const arr = await res.json() as ProductRow[];
      if (arr[0]) return arr[0];
    }
  }

  // Tenta por SKU (cProd)
  if (item.cProd) {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/products?sku=eq.${encodeURIComponent(item.cProd)}&select=id,sku,name,ean,conversion_factor&limit=1`,
      { headers, cache: "no-store" }
    );
    if (res.ok) {
      const arr = await res.json() as ProductRow[];
      if (arr[0]) return arr[0];
    }
  }

  // Tenta por nome (busca parcial)
  if (item.xProd) {
    const namePart = item.xProd.slice(0, 30);
    const res = await fetch(
      `${supabaseUrl}/rest/v1/products?name=ilike.*${encodeURIComponent(namePart)}*&select=id,sku,name,ean,conversion_factor&limit=1`,
      { headers, cache: "no-store" }
    );
    if (res.ok) {
      const arr = await res.json() as ProductRow[];
      if (arr[0]) return arr[0];
    }
  }

  return null;
}

// ─── Verifica entrada duplicada ────────────────────────────────────────────────

async function entryExists(
  supabaseUrl: string,
  headers: Record<string, string>,
  chNFe: string,
  nItem: number,
  productId: string
): Promise<boolean> {
  if (!chNFe) return false;
  const res = await fetch(
    `${supabaseUrl}/rest/v1/product_st_entries?source_nfe_key=eq.${encodeURIComponent(chNFe)}&source_item_index=eq.${nItem}&product_id=eq.${encodeURIComponent(productId)}&select=id&limit=1`,
    { headers, cache: "no-store" }
  );
  if (!res.ok) return false;
  const arr = await res.json() as unknown[];
  return arr.length > 0;
}

// ─── Salva entrada no banco ────────────────────────────────────────────────────

async function saveStEntry(
  supabaseUrl: string,
  headers: Record<string, string>,
  entry: {
    product_id: string;
    source_nfe_key: string;
    source_nfe_number: string;
    source_supplier_cnpj: string;
    source_item_index: number;
    source_cprod: string;
    source_xprod: string;
    quantity_in: number;
    quantity_remaining: number;
    st_base_unit: number;
    st_rate: number;
    st_icms_substitute_unit: number;
    st_value_unit: number;
    original_quantity_in: number;
    original_st_base: number;
    original_st_value: number;
    original_st_icms_sub: number;
  }
): Promise<string> {
  const res = await fetch(`${supabaseUrl}/rest/v1/product_st_entries`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(entry),
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Falha ao salvar entrada ST: ${txt || res.status}`);
  }

  const arr = await res.json() as Array<{ id: string }>;
  return arr[0]?.id ?? "";
}

// ─── Handler principal ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRole = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");

    const baseHeaders = {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      "Content-Type": "application/json",
    };

    // Suporta multipart/form-data (upload de arquivo) ou JSON { xml: "..." }
    let xmlString = "";

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("xml");
      if (!file || typeof file === "string") {
        return NextResponse.json({ ok: false, error: "Arquivo XML não enviado." }, { status: 400 });
      }
      xmlString = await (file as File).text();
    } else {
      const body = await req.json().catch(() => ({})) as { xml?: string };
      if (!body.xml) {
        return NextResponse.json({ ok: false, error: "Campo 'xml' ausente no body." }, { status: 400 });
      }
      xmlString = body.xml;
    }

    if (!xmlString.trim()) {
      return NextResponse.json({ ok: false, error: "XML vazio." }, { status: 400 });
    }

    // Parse do XML
    let nfe: ParsedNFe;
    try {
      nfe = parseNFeXML(xmlString);
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: `Erro ao processar XML: ${e?.message}` }, { status: 400 });
    }

    if (!nfe.items.length) {
      return NextResponse.json({ ok: false, error: "Nenhum item encontrado no XML." }, { status: 400 });
    }

    const result: ImportResult = {
      ok: true,
      nfe: {
        chave: nfe.chNFe,
        numero: nfe.nNF,
        fornecedor: nfe.xNomeEmit,
        data: nfe.dhEmi,
      },
      imported: [],
      skipped: [],
      errors: [],
    };

    for (const item of nfe.items) {
      // Filtra itens sem ST
      if (!item.vBCST || item.vBCST <= 0 || !item.vICMSST || item.vICMSST <= 0) {
        result.skipped.push({
          nItem: item.nItem,
          xProd: item.xProd,
          reason: "Item sem ICMS-ST (vBCST ou vICMSST zerado).",
        });
        continue;
      }

      if (!item.qCom || item.qCom <= 0) {
        result.skipped.push({
          nItem: item.nItem,
          xProd: item.xProd,
          reason: "Quantidade (qCom) inválida ou zero.",
        });
        continue;
      }

      // Busca produto
      const product = await findProduct(supabaseUrl, baseHeaders, item);
      if (!product) {
        result.skipped.push({
          nItem: item.nItem,
          xProd: item.xProd,
          reason: `Produto não encontrado (cProd: ${item.cProd}, EAN: ${item.cEAN}, nome: ${item.xProd.slice(0, 40)}).`,
        });
        continue;
      }

      // Verifica duplicata
      const isDuplicate = await entryExists(supabaseUrl, baseHeaders, nfe.chNFe, item.nItem, product.id);
      if (isDuplicate) {
        result.skipped.push({
          nItem: item.nItem,
          xProd: item.xProd,
          reason: `Entrada já importada para este produto (chave NF-e + nItem já existe).`,
        });
        continue;
      }

      // Conversão de unidade
      // conversion_factor: quantas unidades de venda correspondem a 1 unidade de compra
      // Ex: compra 1 KG, vende em UN de 150g → factor = 1/0.15 = 6.6667
      const factor = Number(product.conversion_factor) || 1;
      const quantityConverted = round(item.qCom * factor, 4);

      if (quantityConverted <= 0) {
        result.skipped.push({
          nItem: item.nItem,
          xProd: item.xProd,
          reason: `Quantidade convertida inválida (qCom: ${item.qCom}, factor: ${factor}).`,
        });
        continue;
      }

      // Valores unitários (por unidade de VENDA)
      const st_base_unit = round(item.vBCST / quantityConverted, 6);
      const st_rate = round(item.pICMSST, 4);
      const st_icms_substitute_unit = round(item.vICMS / quantityConverted, 6);
      const st_value_unit = round(item.vICMSST / quantityConverted, 6);

      // Salva entrada
      let entryId = "";
      try {
        entryId = await saveStEntry(supabaseUrl, baseHeaders, {
          product_id: product.id,
          source_nfe_key: nfe.chNFe,
          source_nfe_number: nfe.nNF,
          source_supplier_cnpj: onlyDigits(nfe.cnpjEmit),
          source_item_index: item.nItem,
          source_cprod: item.cProd,
          source_xprod: item.xProd,
          quantity_in: quantityConverted,
          quantity_remaining: quantityConverted,
          st_base_unit,
          st_rate,
          st_icms_substitute_unit,
          st_value_unit,
          original_quantity_in: item.qCom,
          original_st_base: round(item.vBCST, 2),
          original_st_value: round(item.vICMSST, 2),
          original_st_icms_sub: round(item.vICMS, 2),
        });
      } catch (e: any) {
        result.errors.push(`Item ${item.nItem} (${item.xProd}): ${e?.message}`);
        continue;
      }

      result.imported.push({
        product_id: product.id,
        product_name: product.name || product.sku || product.id,
        nItem: item.nItem,
        xProd: item.xProd,
        quantity_in: quantityConverted,
        quantity_remaining: quantityConverted,
        st_base_unit,
        st_rate,
        st_icms_substitute_unit,
        st_value_unit,
        original_st_base: round(item.vBCST, 2),
        original_st_value: round(item.vICMSST, 2),
        entry_id: entryId,
      });
    }

    result.ok = result.errors.length === 0 || result.imported.length > 0;

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro interno ao importar XML." },
      { status: 500 }
    );
  }
}