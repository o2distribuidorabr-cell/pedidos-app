"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader, Card } from "@/app/components/ui";

export default function AdmFiscalProdutosImportacaoPage() {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function onUpload() {
    if (!file) {
      setMsg("Selecione um arquivo .xlsx.");
      return;
    }

    setLoading(true);
    setMsg("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/fiscal-products/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorsText = Array.isArray(data?.errors) && data.errors.length > 0
          ? `\n\n${data.errors.join("\n")}`
          : "";

        setMsg((data?.error || "Erro ao importar planilha.") + errorsText);
        setLoading(false);
        return;
      }

      const errorsText = Array.isArray(data?.errors) && data.errors.length > 0
        ? `\n\nOcorrências:\n${data.errors.join("\n")}`
        : "";

      setMsg(
        `Importação concluída.\nAtualizados: ${data.updated ?? 0}\nIgnorados: ${data.skipped ?? 0}${errorsText}`
      );
    } catch (e: any) {
      setMsg(e?.message || "Erro ao importar planilha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importação fiscal de produtos"
        subtitle="Envie a planilha .xlsx para atualizar os dados fiscais dos produtos"
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
              onClick={() => router.push("/adm/fiscal-produtos")}
              className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50"
            >
              Voltar
            </button>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm whitespace-pre-wrap text-slate-700">{msg}</div>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="text-sm font-semibold text-slate-900">Upload da planilha</div>

          <div className="mt-4 space-y-4">
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
            />

            <button
              type="button"
              onClick={onUpload}
              disabled={loading}
              className="inline-flex h-11 items-center justify-center rounded-[18px] bg-cyan-600 px-4 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(8,145,178,0.22)] transition hover:bg-cyan-700 disabled:opacity-50"
            >
              {loading ? "Importando..." : "Importar planilha"}
            </button>
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="text-sm font-semibold text-slate-900">Como funciona</div>

          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <div>1. Clique em <b>Baixar modelo</b>.</div>
            <div>2. A planilha já vai sair com <b>SKU</b>, <b>nome do produto</b> e <b>product_id</b>.</div>
            <div>3. Preencha os campos fiscais desejados.</div>
            <div>4. Faça o upload do arquivo <b>.xlsx</b>.</div>
            <div>5. O sistema atualiza automaticamente o cadastro fiscal base da tabela <b>products</b>.</div>
          </div>

          <div className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Campos suportados</div>
            <div className="mt-2 text-sm text-slate-700">
              unidade, NCM, CEST, CFOP, origem, CST/CSOSN, PIS, COFINS e campos fiscais avançados já criados na grade.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}