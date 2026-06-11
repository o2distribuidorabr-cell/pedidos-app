"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PageHeader, Card, Input } from "@/app/components/ui";
import Link from "next/link";

// ─── Emitente padrão (XLG / O2) ──────────────────────────────────────────────
const DEFAULT_EMIT = {
  cUF:    "31",
  cnpj:   "48141548000188",
  xNome:  "XLG COMERCIO DE PRODUTOS LTDA",
  xFant:  "XLG DISTRIBUICAO",
  xLgr:   "RUA RIO GRANDE DO NORTE",
  nro:    "1435",
  xCpl:   "SALA 708 PVMTO 7",
  xBairro:"FUNCIONARIOS",
  cMun:   "3106200",
  xMun:   "BELO HORIZONTE",
  UF:     "MG",
  CEP:    "30130138",
  IE:     "44537040050",
};

type Emit = typeof DEFAULT_EMIT;

type OrderRow = {
  id: string;
  created_at: string;
  status: string;
  total: number;
  store_name: string | null;
  store_legal_name: string | null;
  store_cnpj: string | null;
  selected?: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(s: string | null | undefined) {
  return (s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function pad(n: number, w = 2) { return String(n).padStart(w, "0"); }

function formatNFeDate(iso: string) {
  const d = new Date(iso);
  // converte UTC → UTC-3 (Brasil)
  const br = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  return `${br.getUTCFullYear()}-${pad(br.getUTCMonth() + 1)}-${pad(br.getUTCDate())}T${pad(br.getUTCHours())}:${pad(br.getUTCMinutes())}:${pad(br.getUTCSeconds())}-03:00`;
}

function nNFFromId(id: string) {
  const hex = id.replace(/-/g, "").slice(0, 8);
  return String((parseInt(hex, 16) % 999999998) + 1).padStart(9, "0");
}

function randCNF() {
  return String(Math.floor(Math.random() * 99999998) + 1).padStart(8, "0");
}

function fmtCurrency(n: number) {
  return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function toISODate(d: Date) { return d.toISOString().slice(0, 10); }

// ─── Gerador de XML NF-e ──────────────────────────────────────────────────────
type Item = { sku: string | null; name: string | null; unit: string | null; qty: number; unit_cost: number };

function buildXml(order: OrderRow, items: Item[], emit: Emit, nNFOverride: string): { xml: string; filename: string } {
  const date   = formatNFeDate(order.created_at);
  const aamm   = `${String(new Date(order.created_at).getUTCFullYear()).slice(2)}${pad(new Date(order.created_at).getUTCMonth() + 1)}`;
  const cnpj14 = emit.cnpj.replace(/\D/g, "").padStart(14, "0");
  const nNF    = (nNFOverride || nNFFromId(order.id)).replace(/\D/g, "").padStart(9, "0");
  const cNF    = randCNF();
  const chave  = `${emit.cUF}${aamm}${cnpj14}55001${nNF}1${cNF}0`;
  const id     = `NFe${chave}`;

  const destCnpj = (order.store_cnpj || "").replace(/\D/g, "").padStart(14, "0");
  const destNome = esc(order.store_legal_name || order.store_name || "DESTINATARIO");

  const total = items.reduce((a, i) => a + i.qty * i.unit_cost, 0);

  const dets = items.map((item, idx) => {
    const qty   = Number(item.qty) || 0;
    const vUn   = Number(item.unit_cost) || 0;
    const vProd = (qty * vUn).toFixed(2);
    const unit  = esc(item.unit || "UN").slice(0, 6);
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
        `<cUF>${emit.cUF}</cUF>` +
        `<cNF>${cNF}</cNF>` +
        `<natOp>VENDA DE MERCADORIA ADQUIRIDA OU RECEBIDA DE TERCEIROS</natOp>` +
        `<mod>55</mod><serie>1</serie>` +
        `<nNF>${parseInt(nNF, 10)}</nNF>` +
        `<dhEmi>${date}</dhEmi>` +
        `<dhSaiEnt>${date}</dhSaiEnt>` +
        `<tpNF>1</tpNF><idDest>1</idDest>` +
        `<cMunFG>${emit.cMun}</cMunFG>` +
        `<tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>0</cDV>` +
        `<tpAmb>1</tpAmb><finNFe>1</finNFe>` +
        `<indFinal>0</indFinal><indPres>9</indPres><indIntermed>0</indIntermed>` +
        `<procEmi>0</procEmi><verProc>PORTAL-O2</verProc>` +
      `</ide>` +
      `<emit>` +
        `<CNPJ>${cnpj14}</CNPJ>` +
        `<xNome>${esc(emit.xNome)}</xNome>` +
        `<xFant>${esc(emit.xFant)}</xFant>` +
        `<enderEmit>` +
          `<xLgr>${esc(emit.xLgr)}</xLgr>` +
          `<nro>${emit.nro}</nro>` +
          `<xCpl>${esc(emit.xCpl)}</xCpl>` +
          `<xBairro>${esc(emit.xBairro)}</xBairro>` +
          `<cMun>${emit.cMun}</cMun>` +
          `<xMun>${esc(emit.xMun)}</xMun>` +
          `<UF>${emit.UF}</UF>` +
          `<CEP>${emit.CEP.replace(/\D/g, "")}</CEP>` +
          `<cPais>1058</cPais><xPais>BRASIL</xPais>` +
        `</enderEmit>` +
        `<IE>${emit.IE}</IE>` +
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

function downloadBlob(content: string, filename: string) {
  const blob = new Blob([content], { type: "application/xml;charset=UTF-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function XmlPedidoPage() {
  const router = useRouter();

  const [emit, setEmit]           = useState<Emit>(DEFAULT_EMIT);
  const [showEmit, setShowEmit]   = useState(false);

  const [orders, setOrders]       = useState<OrderRow[]>([]);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [nfNumbers, setNfNumbers] = useState<Record<string, string>>({});

  const [loading, setLoading]     = useState(false);
  const [generating, setGenerating] = useState(false);
  const [search, setSearch]       = useState("");

  const [dateFrom, setDateFrom]   = useState(() => toISODate(new Date(Date.now() - 30 * 86400000)));
  const [dateTo, setDateTo]       = useState(() => toISODate(new Date()));

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) { router.replace("/login"); return; }
      await loadOrders();
    })();
  }, []);

  async function loadOrders() {
    setLoading(true);
    setSelected(new Set());
    try {
      const since = new Date(dateFrom + "T00:00:00").toISOString();
      const until = new Date(dateTo + "T23:59:59").toISOString();

      const { data, error } = await supabase
        .from("orders")
        .select("id, created_at, status, total, stores(name, legal_name, cnpj)")
        .gte("created_at", since)
        .lte("created_at", until)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      const rows: OrderRow[] = ((data ?? []) as any[]).map((o) => ({
        id:               o.id,
        created_at:       o.created_at,
        status:           o.status,
        total:            Number(o.total) || 0,
        store_name:       o.stores?.name ?? null,
        store_legal_name: o.stores?.legal_name ?? null,
        store_cnpj:       o.stores?.cnpj ?? null,
      }));

      setOrders(rows);
    } catch (err: any) {
      console.error("[xml-pedido]", err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.toLowerCase();
    return orders.filter((o) =>
      o.id.toLowerCase().includes(q) ||
      (o.store_name ?? "").toLowerCase().includes(q) ||
      (o.store_legal_name ?? "").toLowerCase().includes(q)
    );
  }, [orders, search]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((o) => o.id)));
    }
  }

  async function handleGenerate() {
    if (selected.size === 0) return;
    setGenerating(true);
    try {
      const ids = Array.from(selected);
      for (let i = 0; i < ids.length; i++) {
        const orderId = ids[i];
        const order = orders.find((o) => o.id === orderId);
        if (!order) continue;

        const { data: itemsData, error: iErr } = await supabase
          .from("order_items")
          .select("qty, unit_cost, products(sku, name, unit)")
          .eq("order_id", orderId);
        if (iErr) throw iErr;

        const items: Item[] = ((itemsData ?? []) as any[]).map((row) => ({
          sku:       row.products?.sku ?? null,
          name:      row.products?.name ?? null,
          unit:      row.products?.unit ?? null,
          qty:       Number(row.qty) || 0,
          unit_cost: Number(row.unit_cost) || 0,
        }));

        const nNFOverride = nfNumbers[orderId] || nNFFromId(orderId);
        const { xml, filename } = buildXml(order, items, emit, nNFOverride);
        downloadBlob(xml, filename);

        // pequeno delay entre downloads para o navegador não bloquear
        if (i < ids.length - 1) await new Promise((r) => setTimeout(r, 600));
      }
    } catch (err: any) {
      console.error("[xml-pedido] generate error:", err);
      alert("Erro ao gerar XML: " + (err?.message ?? err));
    } finally {
      setGenerating(false);
    }
  }

  function setField(field: keyof Emit, value: string) {
    setEmit((prev) => ({ ...prev, [field]: value }));
  }

  const statusColor: Record<string, string> = {
    approved:  "bg-emerald-100 text-emerald-700",
    submitted: "bg-blue-100 text-blue-700",
    draft:     "bg-slate-100 text-slate-500",
    rejected:  "bg-red-100 text-red-600",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gerar XML de pedidos"
        subtitle="Exporta pedidos do portal no formato NF-e 4.00 para importação na Ecletica"
        right={
          <Link href="/adm/estoque" className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
            ← Estoque
          </Link>
        }
      />

      {/* Dados do emitente */}
      <Card>
        <button
          onClick={() => setShowEmit((v) => !v)}
          className="flex w-full items-center justify-between text-left"
          type="button"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900">Dados do emitente (O2 / XLG)</p>
            <p className="text-xs text-slate-500 mt-0.5">{emit.xNome} · CNPJ {emit.cnpj}</p>
          </div>
          <span className="text-xs text-slate-400">{showEmit ? "▲ Ocultar" : "▼ Editar"}</span>
        </button>

        {showEmit && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["CNPJ (só números)", "cnpj"],
                ["Razão Social", "xNome"],
                ["Nome Fantasia", "xFant"],
                ["Logradouro", "xLgr"],
                ["Número", "nro"],
                ["Complemento", "xCpl"],
                ["Bairro", "xBairro"],
                ["Cód. Município (IBGE)", "cMun"],
                ["Município", "xMun"],
                ["UF", "UF"],
                ["CEP", "CEP"],
                ["Inscrição Estadual", "IE"],
                ["cUF (cód. estado)", "cUF"],
              ] as [string, keyof Emit][]
            ).map(([label, field]) => (
              <div key={field}>
                <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
                <input
                  type="text"
                  value={emit[field]}
                  onChange={(e) => setField(field, e.target.value)}
                  className="w-full rounded-[10px] border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Filtros */}
      <Card>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">De</label>
            <input
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-10 rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Até</label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-10 rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
            />
          </div>
          <button
            onClick={loadOrders}
            className="h-10 px-4 rounded-[10px] text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition"
          >
            Buscar pedidos
          </button>
          <div className="flex-1 min-w-[180px]">
            <Input label="" value={search} onChange={setSearch} placeholder="Buscar por loja ou ID..." />
          </div>
        </div>
      </Card>

      {/* Lista de pedidos */}
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <p className="text-sm font-semibold text-slate-700">
            {filtered.length} pedido(s) · {selected.size} selecionado(s)
          </p>
          <div className="flex gap-2">
            <button
              onClick={toggleAll}
              className="h-9 px-3 rounded-[10px] text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
            >
              {selected.size === filtered.length && filtered.length > 0 ? "Desmarcar todos" : "Selecionar todos"}
            </button>
            <button
              onClick={handleGenerate}
              disabled={selected.size === 0 || generating}
              className="h-9 px-4 rounded-[10px] text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {generating ? "Gerando..." : `Gerar XML${selected.size > 1 ? `s (${selected.size})` : selected.size === 1 ? " (1)" : ""}`}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-sm text-slate-500 py-8">Carregando pedidos...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-8">Nenhum pedido encontrado no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="pb-3 pr-3 w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      className="rounded"
                    />
                  </th>
                  <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Data</th>
                  <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pedido</th>
                  <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Loja</th>
                  <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Status</th>
                  <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">CNPJ dest.</th>
                  <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Total</th>
                  <th className="pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Nº NF manual</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const isSel = selected.has(o.id);
                  return (
                    <tr
                      key={o.id}
                      className={`border-b border-slate-50 cursor-pointer ${isSel ? "bg-emerald-50" : "hover:bg-slate-50"}`}
                      onClick={() => toggleSelect(o.id)}
                    >
                      <td className="py-3 pr-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleSelect(o.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="py-3 pr-4 text-slate-600 text-xs tabular-nums whitespace-nowrap">
                        {new Date(o.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-slate-400">
                        {o.id.slice(0, 8)}...
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-slate-900 leading-tight">{o.store_name ?? "—"}</p>
                        {o.store_legal_name && o.store_legal_name !== o.store_name && (
                          <p className="text-xs text-slate-400 leading-tight">{o.store_legal_name}</p>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor[o.status] ?? "bg-slate-100 text-slate-500"}`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-slate-400">
                        {o.store_cnpj
                          ? o.store_cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
                          : <span className="text-amber-500">sem CNPJ</span>}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums font-semibold text-slate-900">
                        {fmtCurrency(o.total)}
                      </td>
                      <td className="py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          placeholder={nNFFromId(o.id).replace(/^0+/, "")}
                          value={nfNumbers[o.id] || ""}
                          onChange={(e) => setNfNumbers((prev) => ({ ...prev, [o.id]: e.target.value }))}
                          className="w-24 rounded-[8px] border border-slate-200 px-2 py-1 text-center text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                          title="Deixe em branco para usar número automático"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filtered.some((o) => !o.store_cnpj) && (
          <p className="mt-3 text-xs text-amber-600 bg-amber-50 rounded-[10px] px-3 py-2">
            Atenção: algumas lojas não têm CNPJ cadastrado. O XML será gerado com CNPJ 00000000000000.
            Cadastre o CNPJ em <Link href="/adm/lojas" className="underline">Lojas</Link>.
          </p>
        )}
      </Card>
    </div>
  );
}
