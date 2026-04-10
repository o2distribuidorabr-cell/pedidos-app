"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";
import { PageHeader, Card, Badge } from "@/app/components/ui";
import { parseNFeXML } from "@/app/api/nfe/import-xml/route";

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedItem = {
  nItem: number;
  cProd: string;
  cEAN: string;
  xProd: string;
  uCom: string;
  qCom: number;
  vBCST: number;
  pICMSST: number;
  vICMS: number;
  vICMSST: number;
  hasST: boolean;
};

type ParsedNFe = {
  chNFe: string;
  nNF: string;
  cnpjEmit: string;
  xNomeEmit: string;
  dhEmi: string;
  items: ParsedItem[];
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(v: number, decimals = 2) {
  return Number(v ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtBRL(v: number) {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(v: string) {
  if (!v) return "-";
  try { return new Date(v).toLocaleString("pt-BR"); } catch { return v; }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ImportarXmlPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"error" | "success" | "info">("info");

  const [xmlText, setXmlText] = useState("");
  const [preview, setPreview] = useState<ParsedNFe | null>(null);
  const [previewError, setPreviewError] = useState("");

  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    (async () => {
      const ok = await requireAdminOrRedirect(router);
      if (!ok) return;
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Parse local para preview ──────────────────────────────────────────────

  function handleXmlChange(text: string) {
    setXmlText(text);
    setPreview(null);
    setPreviewError("");
    setResult(null);
    setMsg("");

    if (!text.trim()) return;

    try {
      const parsed = parseNFeXML(text);
      const items: ParsedItem[] = parsed.items.map((it) => ({
        nItem: it.nItem,
        cProd: it.cProd,
        cEAN: it.cEAN,
        xProd: it.xProd,
        uCom: it.uCom,
        qCom: it.qCom,
        vBCST: it.vBCST,
        pICMSST: it.pICMSST,
        vICMS: it.vICMS,
        vICMSST: it.vICMSST,
        hasST: it.vBCST > 0 && it.vICMSST > 0,
      }));
      setPreview({ ...parsed, items });
    } catch (e: any) {
      setPreviewError(e?.message || "Erro ao processar XML.");
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    handleXmlChange(text);
  }

  // ── Importar via API ──────────────────────────────────────────────────────

  async function handleImport() {
    if (!xmlText.trim()) {
      setMsg("Cole ou faça upload de um XML antes de importar.");
      setMsgType("error");
      return;
    }

    setImporting(true);
    setMsg("");
    setResult(null);

    try {
      const formData = new FormData();
      const blob = new Blob([xmlText], { type: "text/xml" });
      formData.append("xml", blob, "nfe.xml");

      const res = await fetch("/api/nfe/import-xml", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({})) as ImportResult;

      if (!res.ok || !data?.ok) {
        setMsg(data?.errors?.join(" | ") || "Erro ao importar XML.");
        setMsgType("error");
        setImporting(false);
        return;
      }

      setResult(data);
      setMsg(
        `Importação concluída! ${data.imported.length} item(ns) importado(s), ` +
        `${data.skipped.length} ignorado(s).`
      );
      setMsgType("success");
    } catch (e: any) {
      setMsg(e?.message || "Erro ao importar.");
      setMsgType("error");
    } finally {
      setImporting(false);
    }
  }

  function handleReset() {
    setXmlText("");
    setPreview(null);
    setPreviewError("");
    setResult(null);
    setMsg("");
    if (fileRef.current) fileRef.current.value = "";
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) return <Card>Carregando...</Card>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar XML de compra"
        subtitle="Importa NF-e do fornecedor e registra saldo de ICMS-ST para uso nas vendas"
        right={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push("/adm/fiscal-produtos")}
              className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50"
            >
              Cadastro fiscal
            </button>
            <button
              type="button"
              onClick={() => router.push("/adm/emissao-fiscal")}
              className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50"
            >
              Emissão fiscal
            </button>
          </div>
        }
      />

      {/* Mensagem */}
      {msg ? (
        <div
          className={`rounded-[20px] border p-4 text-sm font-medium ${
            msgType === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : msgType === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-blue-200 bg-blue-50 text-blue-800"
          }`}
        >
          {msg}
        </div>
      ) : null}

      {/* Upload */}
      {!result && (
        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="text-sm font-semibold text-slate-900">1. Carregue o XML da NF-e de compra</div>
          <div className="mt-1 text-sm text-slate-500">
            Aceita arquivo .xml ou cole o conteúdo diretamente.
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <label className="inline-flex h-11 cursor-pointer items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50">
              📂 Selecionar arquivo XML
              <input
                ref={fileRef}
                type="file"
                accept=".xml,text/xml,application/xml"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>

            {xmlText && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex h-11 items-center justify-center rounded-[18px] border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100"
              >
                Limpar
              </button>
            )}
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Ou cole o XML aqui:
            </label>
            <textarea
              value={xmlText}
              onChange={(e) => handleXmlChange(e.target.value)}
              placeholder='<?xml version="1.0" encoding="UTF-8"?>...'
              rows={6}
              className="w-full rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 outline-none transition focus:border-slate-300"
            />
          </div>

          {previewError && (
            <div className="mt-3 rounded-[14px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              ⚠️ {previewError}
            </div>
          )}
        </div>
      )}

      {/* Preview da NF-e */}
      {preview && !result && (
        <>
          <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="text-sm font-semibold text-slate-900">2. Dados da NF-e identificada</div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="text-xs text-slate-500">Fornecedor</div>
                <div className="font-semibold text-slate-900">{preview.xNomeEmit || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">CNPJ Emitente</div>
                <div className="font-semibold text-slate-900">{preview.cnpjEmit || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Número NF</div>
                <div className="font-semibold text-slate-900">{preview.nNF || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Data emissão</div>
                <div className="font-semibold text-slate-900">{fmtDate(preview.dhEmi)}</div>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <div className="text-xs text-slate-500">Chave de acesso</div>
                <div className="break-all font-mono text-xs text-slate-700">{preview.chNFe || "-"}</div>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">3. Itens da NF-e</div>
                <div className="mt-1 text-sm text-slate-500">
                  Apenas itens com ICMS-ST serão importados. Os demais serão ignorados.
                </div>
              </div>
              <Badge tone={preview.items.filter((i) => i.hasST).length > 0 ? "green" : "neutral"}>
                {preview.items.filter((i) => i.hasST).length} com ST
              </Badge>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left">
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">#</th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Código</th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Produto</th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Unid.</th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Qtd.</th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Base ST</th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Alíq. ST%</th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">ICMS Subst.</th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Vlr ST</th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">ST?</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((it) => (
                    <tr
                      key={it.nItem}
                      className={`border-b align-top ${
                        it.hasST ? "border-slate-100" : "border-slate-100 opacity-40"
                      }`}
                    >
                      <td className="px-3 py-2 text-slate-500">{it.nItem}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{it.cProd}</td>
                      <td className="px-3 py-2 font-medium text-slate-900 max-w-[220px] truncate">{it.xProd}</td>
                      <td className="px-3 py-2 text-slate-600">{it.uCom}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{fmtNum(it.qCom, 4)}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{fmtBRL(it.vBCST)}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{fmtNum(it.pICMSST)}%</td>
                      <td className="px-3 py-2 text-right text-slate-700">{fmtBRL(it.vICMS)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-900">{fmtBRL(it.vICMSST)}</td>
                      <td className="px-3 py-2">
                        {it.hasST ? (
                          <Badge tone="green">Sim</Badge>
                        ) : (
                          <Badge tone="neutral">Não</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-[18px] border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
              <strong>Importante:</strong> O sistema usa o fator de conversão cadastrado em cada produto
              para converter a quantidade comprada (ex: KG) para a unidade de venda (ex: UN).
              Verifique o campo <strong>conversion_factor</strong> no cadastro fiscal antes de importar.
            </div>

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || preview.items.filter((i) => i.hasST).length === 0}
                className="inline-flex h-11 items-center justify-center rounded-[18px] bg-cyan-600 px-6 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(8,145,178,0.22)] transition hover:bg-cyan-700 disabled:opacity-50"
              >
                {importing ? "Importando..." : "Confirmar e importar"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Resultado */}
      {result && (
        <>
          <div className="rounded-[30px] border border-green-200 bg-green-50 p-5 shadow-sm md:p-6">
            <div className="text-sm font-semibold text-green-900">
              ✓ Importação concluída — NF {result.nfe.numero} / {result.nfe.fornecedor}
            </div>
            <div className="mt-1 text-sm text-green-700">
              {result.imported.length} item(ns) importado(s) • {result.skipped.length} ignorado(s) •{" "}
              {result.errors.length} erro(s)
            </div>
          </div>

          {result.imported.length > 0 && (
            <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <div className="text-sm font-semibold text-slate-900">Itens importados</div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[700px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left">
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">#</th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Produto (no sistema)</th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Produto (NF)</th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Qtd. convertida</th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Base ST unit.</th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Vlr ST unit.</th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Base ST total</th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 text-right">Vlr ST total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.imported.map((it) => (
                      <tr key={it.entry_id} className="border-b border-slate-100">
                        <td className="px-3 py-2 text-slate-500">{it.nItem}</td>
                        <td className="px-3 py-2 font-semibold text-slate-900">{it.product_name}</td>
                        <td className="px-3 py-2 text-slate-600 text-xs max-w-[180px] truncate">{it.xProd}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{fmtNum(it.quantity_in, 4)}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{fmtBRL(it.st_base_unit)}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{fmtBRL(it.st_value_unit)}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{fmtBRL(it.original_st_base)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-900">{fmtBRL(it.original_st_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result.skipped.length > 0 && (
            <div className="rounded-[30px] border border-amber-200 bg-amber-50 p-5 shadow-sm md:p-6">
              <div className="text-sm font-semibold text-amber-900">Itens ignorados</div>
              <div className="mt-3 space-y-2">
                {result.skipped.map((s, i) => (
                  <div key={i} className="rounded-[14px] border border-amber-100 bg-white p-3 text-sm">
                    <span className="font-semibold text-slate-900">Item {s.nItem} — {s.xProd}</span>
                    <span className="ml-2 text-amber-700">{s.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="rounded-[30px] border border-red-200 bg-red-50 p-5 shadow-sm md:p-6">
              <div className="text-sm font-semibold text-red-900">Erros</div>
              <div className="mt-3 space-y-2">
                {result.errors.map((e, i) => (
                  <div key={i} className="text-sm text-red-700">{e}</div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50"
            >
              Importar outro XML
            </button>
            <button
              type="button"
              onClick={() => router.push("/adm/emissao-fiscal")}
              className="inline-flex h-11 items-center justify-center rounded-[18px] bg-cyan-600 px-4 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(8,145,178,0.22)] transition hover:bg-cyan-700"
            >
              Ir para emissão
            </button>
          </div>
        </>
      )}
    </div>
  );
}