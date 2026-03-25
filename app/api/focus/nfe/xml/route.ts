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

    // Estratégia 1: tenta baixar o XML diretamente pelo endpoint padrão da Focus
    // GET /v2/nfe/{reference}.xml retorna o XML diretamente com autenticação
    const directXmlUrl = `${baseUrl}/v2/nfe/${encodeURIComponent(reference)}.xml`;

    const directRes = await fetch(directXmlUrl, {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(token),
      },
      cache: "no-store",
    });

    if (directRes.ok) {
      const xmlText = await directRes.text();
      if (xmlText && xmlText.trim().startsWith("<")) {
        return new NextResponse(xmlText, {
          status: 200,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Content-Disposition": `attachment; filename="NFe-${reference}.xml"`,
            "Cache-Control": "no-store",
          },
        });
      }
    }

    // Estratégia 2: consulta os dados da NF-e e usa a url_xml salva
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

    // Extrai a URL do XML de qualquer campo possível
    const xmlUrl: string | null =
      nfeJson?.caminho_xml_nota_fiscal ||
      nfeJson?.url_xml ||
      nfeJson?.xml ||
      nfeJson?.link_xml ||
      nfeJson?.caminho_xml ||
      null;

    if (!xmlUrl) {
      return NextResponse.json(
        {
          ok: false,
          error: "XML não disponível. A NF-e pode ainda não estar autorizada.",
          debug: { reference, status: nfeJson?.status, fields: Object.keys(nfeJson || {}) },
        },
        { status: 404 }
      );
    }

    // Se URL relativa, monta completa
    const fullXmlUrl = xmlUrl.startsWith("http")
      ? xmlUrl
      : `${baseUrl}${xmlUrl.startsWith("/") ? "" : "/"}${xmlUrl}`;

    const xmlRes = await fetch(fullXmlUrl, {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(token),
      },
      cache: "no-store",
    });

    if (!xmlRes.ok) {
      return NextResponse.json(
        { ok: false, error: `Erro ao baixar XML: ${xmlRes.status}` },
        { status: xmlRes.status }
      );
    }

    const xmlText = await xmlRes.text();

    return new NextResponse(xmlText, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="NFe-${reference}.xml"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro interno ao baixar XML." },
      { status: 500 }
    );
  }
}