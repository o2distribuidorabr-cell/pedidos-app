import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function envOrThrow(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

function basicAuthHeader(token: string) {
  return `Basic ${Buffer.from(`${token}:`).toString("base64")}`;
}

function focusBaseUrl() {
  const env = String(process.env.FOCUS_NFE_ENV || "homologacao").toLowerCase();
  return env === "producao"
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";
}

export async function GET(req: NextRequest) {
  try {
    const token = envOrThrow("FOCUS_NFE_TOKEN");
    const baseUrl = focusBaseUrl();

    const { searchParams } = new URL(req.url);
    const reference = searchParams.get("reference");

    if (!reference) {
      return NextResponse.json(
        { ok: false, error: "Parâmetro 'reference' é obrigatório." },
        { status: 400 }
      );
    }

    // Consulta os dados da NF-e para obter a URL da DANFE
    const nfeUrl = `${baseUrl}/v2/nfe/${encodeURIComponent(reference)}`;

    const nfeRes = await fetch(nfeUrl, {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(token),
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!nfeRes.ok) {
      const txt = await nfeRes.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `Erro ao consultar NF-e na Focus: ${txt || nfeRes.status}` },
        { status: nfeRes.status }
      );
    }

    const nfeJson = await nfeRes.json().catch(() => null);

    // Extrai a URL da DANFE de qualquer campo possível
    const danfeUrl: string | null =
      nfeJson?.url_danfe ||
      nfeJson?.danfe ||
      nfeJson?.link_danfe ||
      nfeJson?.caminho_danfe ||
      null;

    if (!danfeUrl) {
      return NextResponse.json(
        {
          ok: false,
          error: "DANFE não disponível. A NF-e pode ainda não estar autorizada.",
          debug: { reference, status: nfeJson?.status, fields: Object.keys(nfeJson || {}) },
        },
        { status: 404 }
      );
    }

    // Se URL relativa (começa com /arquivos/ etc), monta URL completa com baseUrl da Focus
    const fullDanfeUrl = danfeUrl.startsWith("http")
      ? danfeUrl
      : `${baseUrl}${danfeUrl.startsWith("/") ? "" : "/"}${danfeUrl}`;

    // Proxy: baixa o PDF da Focus com autenticação e devolve ao browser
    const pdfRes = await fetch(fullDanfeUrl, {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(token),
      },
      cache: "no-store",
    });

    if (!pdfRes.ok) {
      return NextResponse.json(
        { ok: false, error: `Erro ao baixar DANFE: ${pdfRes.status}` },
        { status: pdfRes.status }
      );
    }

    const pdfBuffer = await pdfRes.arrayBuffer();

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="DANFE-${reference}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro interno ao baixar DANFE." },
      { status: 500 }
    );
  }
}