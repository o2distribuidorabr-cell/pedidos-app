/**
 * lib/enviarNotaPortal.ts
 *
 * Monta o XML "fake" de um pedido (mesmo formato do gerador em
 * app/adm/estoque/xml-pedido, portado pro servidor) e envia pro webhook do
 * ab-portal, que importa como nota fiscal pendente de confirmação do
 * franqueado. Reaproveitado pela rota de trigger (um pedido) e pelo backfill
 * (vários pedidos de uma vez).
 *
 * A chave de acesso é inteiramente determinística (baseada no id do pedido)
 * — reenviar o mesmo pedido sempre gera a mesma chave, então a trava de
 * duplicidade por chave do ab-portal pega reenvios e nunca duplica a nota.
 */

import { supabaseAdmin } from "./supabaseAdmin";

// ─── Emitente: O2 Distribuidora — mesmo CNPJ usado na emissão real via Focus
// NFe (tabela emitters, is_default=true) e já reconhecido como fornecedor
// confiável no ab-portal. NÃO é a XLG (empresa diferente, usada só no
// gerador manual antigo de app/adm/estoque/xml-pedido).
const DEFAULT_EMIT = {
  cUF: "31",
  cnpj: "65326204000162",
  xNome: "02 DISTRIBUIDORA LTDA",
  xFant: "O2 DISTRIBUIDORA",
  xLgr: "Rua Rio Grande do Norte",
  nro: "1435",
  xCpl: "Sala 708 Pvmto 7",
  xBairro: "Savassi",
  cMun: "3106200",
  xMun: "Belo Horizonte",
  UF: "MG",
  CEP: "30130138",
  IE: "0054509840055",
};

function esc(s: string | null | undefined) {
  return (s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function pad(n: number, w = 2) { return String(n).padStart(w, "0"); }

function formatNFeDate(iso: string) {
  const d = new Date(iso);
  const br = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return `${br.getUTCFullYear()}-${pad(br.getUTCMonth() + 1)}-${pad(br.getUTCDate())}T${pad(br.getUTCHours())}:${pad(br.getUTCMinutes())}:${pad(br.getUTCSeconds())}-03:00`;
}

function nNFFromId(id: string) {
  const hex = id.replace(/-/g, "").slice(0, 8);
  return String((parseInt(hex, 16) % 999999998) + 1).padStart(9, "0");
}

/** Determinístico — reenviar o mesmo pedido sempre gera a mesma chave. */
function cNFFromId(id: string) {
  const hex = id.replace(/-/g, "").slice(8, 16);
  return String((parseInt(hex, 16) % 99999998) + 1).padStart(8, "0");
}

type OrderRow = {
  id: string; created_at: string;
  store_name: string | null; store_legal_name: string | null; store_cnpj: string | null;
};
type Item = { sku: string | null; name: string | null; unit: string | null; qty: number; unit_cost: number };

function buildXml(order: OrderRow, items: Item[]): { xml: string; filename: string } {
  const date = formatNFeDate(order.created_at);
  const aamm = `${String(new Date(order.created_at).getUTCFullYear()).slice(2)}${pad(new Date(order.created_at).getUTCMonth() + 1)}`;
  const cnpj14 = DEFAULT_EMIT.cnpj.replace(/\D/g, "").padStart(14, "0");
  const nNF = nNFFromId(order.id).replace(/\D/g, "").padStart(9, "0");
  const cNF = cNFFromId(order.id);
  const chave = `${DEFAULT_EMIT.cUF}${aamm}${cnpj14}55001${nNF}1${cNF}0`;
  const id = `NFe${chave}`;

  const destCnpj = (order.store_cnpj || "").replace(/\D/g, "").padStart(14, "0");
  const destNome = esc(order.store_legal_name || order.store_name || "DESTINATARIO");

  const total = items.reduce((a, i) => a + i.qty * i.unit_cost, 0);

  const dets = items.map((item, idx) => {
    const qty = Number(item.qty) || 0;
    const vUn = Number(item.unit_cost) || 0;
    const vProd = (qty * vUn).toFixed(2);
    const unit = esc(item.unit || "UN").slice(0, 6);
    const cProd = esc(item.sku || "SEM-SKU");
    const xProd = esc(item.name || "PRODUTO");
    return (
      `<det nItem="${idx + 1}">` +
        `<prod>` +
          `<cProd>${cProd}</cProd>` +
          `<cEAN>SEM GTIN</cEAN>` +
          `<xProd>${xProd}</xProd>` +
          `<NCM>00000000</NCM>` +
          `<CFOP>5102</CFOP>` +
          `<uCom>${unit}</uCom>` +
          `<qCom>${qty.toFixed(4)}</qCom>` +
          `<vUnCom>${vUn.toFixed(4)}</vUnCom>` +
          `<vProd>${vProd}</vProd>` +
          `<cEANTrib>SEM GTIN</cEANTrib>` +
          `<uTrib>${unit}</uTrib>` +
          `<qTrib>${qty.toFixed(4)}</qTrib>` +
          `<vUnTrib>${vUn.toFixed(4)}</vUnTrib>` +
          `<indTot>1</indTot>` +
        `</prod>` +
        `<imposto>` +
          `<vTotTrib>0.00</vTotTrib>` +
          `<ICMS><ICMS40><orig>0</orig><CST>41</CST></ICMS40></ICMS>` +
          `<IPI><cEnq>999</cEnq><IPINT><CST>53</CST></IPINT></IPI>` +
          `<PIS><PISAliq><CST>07</CST><vBC>0.00</vBC><pPIS>0.0000</pPIS><vPIS>0.00</vPIS></PISAliq></PIS>` +
          `<COFINS><COFINSAliq><CST>07</CST><vBC>0.00</vBC><pCOFINS>0.0000</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSAliq></COFINS>` +
        `</imposto>` +
      `</det>`
    );
  }).join("");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
    `<NFe xmlns="http://www.portalfiscal.inf.br/nfe">` +
    `<infNFe versao="4.00" Id="${id}">` +
      `<ide>` +
        `<cUF>${DEFAULT_EMIT.cUF}</cUF>` +
        `<cNF>${cNF}</cNF>` +
        `<natOp>VENDA DE MERCADORIA ADQUIRIDA OU RECEBIDA DE TERCEIROS</natOp>` +
        `<mod>55</mod><serie>1</serie>` +
        `<nNF>${parseInt(nNF, 10)}</nNF>` +
        `<dhEmi>${date}</dhEmi>` +
        `<dhSaiEnt>${date}</dhSaiEnt>` +
        `<tpNF>1</tpNF><idDest>1</idDest>` +
        `<tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>0</cDV>` +
        `<tpAmb>1</tpAmb><finNFe>1</finNFe>` +
        `<indFinal>0</indFinal><indPres>9</indPres><indIntermed>0</indIntermed>` +
        `<procEmi>0</procEmi><verProc>PORTAL-O2</verProc>` +
      `</ide>` +
      `<emit>` +
        `<CNPJ>${cnpj14}</CNPJ>` +
        `<xNome>${esc(DEFAULT_EMIT.xNome)}</xNome>` +
        `<xFant>${esc(DEFAULT_EMIT.xFant)}</xFant>` +
        `<enderEmit>` +
          `<xLgr>${esc(DEFAULT_EMIT.xLgr)}</xLgr>` +
          `<nro>${DEFAULT_EMIT.nro}</nro>` +
          `<xCpl>${esc(DEFAULT_EMIT.xCpl)}</xCpl>` +
          `<xBairro>${esc(DEFAULT_EMIT.xBairro)}</xBairro>` +
          `<cMun>${DEFAULT_EMIT.cMun}</cMun>` +
          `<xMun>${esc(DEFAULT_EMIT.xMun)}</xMun>` +
          `<UF>${DEFAULT_EMIT.UF}</UF>` +
          `<CEP>${DEFAULT_EMIT.CEP.replace(/\D/g, "")}</CEP>` +
          `<cPais>1058</cPais><xPais>BRASIL</xPais>` +
        `</enderEmit>` +
        `<IE>${DEFAULT_EMIT.IE}</IE>` +
        `<CRT>3</CRT>` +
      `</emit>` +
      `<dest>` +
        `<CNPJ>${destCnpj}</CNPJ>` +
        `<xNome>${destNome}</xNome>` +
        `<indIEDest>9</indIEDest>` +
      `</dest>` +
      dets +
      `<total><ICMSTot>` +
        `<vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson>` +
        `<vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST>` +
        `<vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet>` +
        `<vProd>${total.toFixed(2)}</vProd>` +
        `<vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc>` +
        `<vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol>` +
        `<vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro>` +
        `<vNF>${total.toFixed(2)}</vNF><vTotTrib>0.00</vTotTrib>` +
      `</ICMSTot></total>` +
      `<transp><modFrete>9</modFrete></transp>` +
      `<pag><detPag><indPag>0</indPag><tPag>90</tPag><vPag>0.00</vPag></detPag></pag>` +
    `</infNFe></NFe></nfeProc>`;

  return { xml, filename: `${chave}.xml` };
}

function envOrThrow(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

export type ResultadoEnvioNota =
  | { ok: true; orderId: string; status: string; documentId?: string }
  | { ok: false; orderId: string; error: string };

export async function enviarNotaParaPortal(orderId: string): Promise<ResultadoEnvioNota> {
  const { data: order, error: eOrder } = await supabaseAdmin
    .from("orders")
    .select("id, created_at, store_id, stores(name, legal_name, cnpj, ecletica_cod_loja)")
    .eq("id", orderId)
    .maybeSingle();
  if (eOrder || !order) {
    return { ok: false, orderId, error: `Pedido não encontrado: ${eOrder?.message ?? orderId}` };
  }

  const store = (order as unknown as { stores: { name: string | null; legal_name: string | null; cnpj: string | null; ecletica_cod_loja: string | null } | null }).stores;
  if (!store?.ecletica_cod_loja) {
    return { ok: false, orderId, error: "Loja sem ecletica_cod_loja cadastrado." };
  }

  const { data: itemsData, error: eItems } = await supabaseAdmin
    .from("order_items")
    .select("qty, unit_cost, products(sku, name, unit)")
    .eq("order_id", orderId);
  if (eItems) {
    return { ok: false, orderId, error: `Falha ao buscar itens do pedido: ${eItems.message}` };
  }

  const items: Item[] = ((itemsData ?? []) as unknown as { qty: number; unit_cost: number; products: { sku: string | null; name: string | null; unit: string | null } | null }[])
    .map(row => ({
      sku: row.products?.sku ?? null,
      name: row.products?.name ?? null,
      unit: row.products?.unit ?? null,
      qty: Number(row.qty) || 0,
      unit_cost: Number(row.unit_cost) || 0,
    }));
  if (!items.length) {
    return { ok: false, orderId, error: "Pedido sem itens." };
  }

  const orderRow: OrderRow = {
    id: order.id, created_at: order.created_at,
    store_name: store.name, store_legal_name: store.legal_name, store_cnpj: store.cnpj,
  };
  const { xml, filename } = buildXml(orderRow, items);

  const portalUrl = envOrThrow("AB_PORTAL_WEBHOOK_URL");
  const portalSecret = envOrThrow("AB_PORTAL_WEBHOOK_SECRET");

  const res = await fetch(portalUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${portalSecret}` },
    body: JSON.stringify({ ecletica_cod_loja: store.ecletica_cod_loja, xml, file_name: filename }),
  });
  const json = await res.json().catch(() => null);

  if (!res.ok && json?.status !== "DUPLICADO") {
    return { ok: false, orderId, error: `ab-portal recusou a nota: ${json?.error ?? res.status}` };
  }

  return { ok: true, orderId, status: json?.status ?? "OK", documentId: json?.document_id };
}
