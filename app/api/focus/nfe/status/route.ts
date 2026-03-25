import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type StatusBody = {
  orderId: string;
  reference: string;
};

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

function safeJsonParse(text: string) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

async function getExistingFocusDoc(reference: string) {
  const supabaseUrl = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");

  const res = await fetch(
    `${supabaseUrl}/rest/v1/focus_nfe_documents?reference=eq.${encodeURIComponent(reference)}&select=*`,
    {
      method: "GET",
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Falha ao buscar focus_nfe_documents: ${txt || res.status}`);
  }

  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function saveFocusDoc(doc: {
  id?: string | null;
  order_id: string;
  store_id: string;
  emitter_id?: string | null;
  status?: string | null;
  reference: string;
  numero?: string | null;
  serie?: string | null;
  chave?: string | null;
  protocolo?: string | null;
  url_danfe?: string | null;
  url_xml?: string | null;
  error_message?: string | null;
}) {
  const supabaseUrl = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");

  const payload = {
    order_id: doc.order_id,
    store_id: doc.store_id,
    emitter_id: doc.emitter_id ?? null,
    status: doc.status ?? null,
    reference: doc.reference,
    numero: doc.numero ?? null,
    serie: doc.serie ?? null,
    chave: doc.chave ?? null,
    protocolo: doc.protocolo ?? null,
    url_danfe: doc.url_danfe ?? null,
    url_xml: doc.url_xml ?? null,
    error_message: doc.error_message ?? null,
    updated_at: new Date().toISOString(),
  };

  const res = await fetch(
    `${supabaseUrl}/rest/v1/focus_nfe_documents?on_conflict=reference`,
    {
      method: "POST",
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Falha ao atualizar focus_nfe_documents: ${txt || res.status}`);
  }

  return res.json().catch(() => null);
}

function extractErrorMessage(focus: any) {
  if (!focus) return null;

  if (typeof focus?.mensagem === "string" && focus.mensagem.trim()) return focus.mensagem;
  if (typeof focus?.message === "string" && focus.message.trim()) return focus.message;
  if (typeof focus?.erro === "string" && focus.erro.trim()) return focus.erro;

  if (Array.isArray(focus?.erros) && focus.erros.length > 0) {
    const msgs = focus.erros
      .map((e: any) => {
        if (typeof e === "string") return e;
        if (typeof e?.mensagem === "string") return e.mensagem;
        return JSON.stringify(e);
      })
      .filter(Boolean);

    if (msgs.length) return msgs.join(" | ");
  }

  if (typeof focus?.status_sefaz === "string" && typeof focus?.mensagem_sefaz === "string") {
    return `${focus.status_sefaz}: ${focus.mensagem_sefaz}`;
  }

  if (typeof focus?.mensagem_sefaz === "string" && focus.mensagem_sefaz.trim()) {
    return focus.mensagem_sefaz;
  }

  return null;
}

function extractDanfeUrl(focus: any, existing?: any) {
  return pickString(
    focus?.caminho_danfe,
    focus?.url_danfe,
    focus?.danfe,
    focus?.link_danfe,
    existing?.url_danfe
  );
}

function extractXmlUrl(focus: any, existing?: any) {
  return pickString(
    focus?.caminho_xml_nota_fiscal,
    focus?.url_xml,
    focus?.xml,
    focus?.link_xml,
    focus?.caminho_xml,
    existing?.url_xml
  );
}

function extractStatus(focus: any, existing?: any) {
  return pickString(
    focus?.status,
    focus?.situacao,
    existing?.status
  );
}

function extractNumero(focus: any, existing?: any) {
  const v = pickString(
    String(focus?.numero ?? ""),
    String(existing?.numero ?? "")
  );
  return v || null;
}

function extractSerie(focus: any, existing?: any) {
  const v = pickString(
    String(focus?.serie ?? ""),
    String(existing?.serie ?? "")
  );
  return v || null;
}

function extractChave(focus: any, existing?: any) {
  return pickString(
    focus?.chave,
    focus?.chave_nfe,
    existing?.chave
  );
}

function extractProtocolo(focus: any, existing?: any) {
  return pickString(
    focus?.protocolo,
    focus?.protocolo_autorizacao,
    existing?.protocolo
  );
}

export async function POST(req: NextRequest) {
  try {
    const token = envOrThrow("FOCUS_NFE_TOKEN");
    const baseUrl = focusBaseUrl();

    const body = (await req.json()) as StatusBody;

    if (!body?.orderId) {
      return NextResponse.json(
        { ok: false, error: "orderId é obrigatório." },
        { status: 400 }
      );
    }

    if (!body?.reference) {
      return NextResponse.json(
        { ok: false, error: "reference é obrigatória." },
        { status: 400 }
      );
    }

    const existing = await getExistingFocusDoc(body.reference);

    if (!existing) {
      return NextResponse.json(
        {
          ok: false,
          error: "Documento da NF-e não encontrado em focus_nfe_documents para essa reference.",
        },
        { status: 404 }
      );
    }

    if (!existing.store_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "focus_nfe_documents está sem store_id gravado. Corrija o registro antes de consultar status.",
          debug: {
            reference: body.reference,
            existing,
          },
        },
        { status: 400 }
      );
    }

    const url = `${baseUrl}/v2/nfe/${encodeURIComponent(body.reference)}`;

    const focusRes = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(token),
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    const rawText = await focusRes.text();
    const json = safeJsonParse(rawText);

    if (!focusRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            json?.mensagem ||
            json?.message ||
            rawText ||
            "Erro ao consultar status na Focus.",
          details: json || rawText || null,
        },
        { status: focusRes.status }
      );
    }

    const errorMessage = extractErrorMessage(json);
    const status = extractStatus(json, existing);
    const numero = extractNumero(json, existing);
    const serie = extractSerie(json, existing);
    const chave = extractChave(json, existing);
    const protocolo = extractProtocolo(json, existing);
    const urlDanfe = extractDanfeUrl(json, existing);
    const urlXml = extractXmlUrl(json, existing);

    await saveFocusDoc({
      id: existing.id ?? null,
      order_id: body.orderId,
      store_id: existing.store_id,
      emitter_id: existing.emitter_id ?? null,
      reference: body.reference,
      status,
      numero,
      serie,
      chave,
      protocolo,
      url_danfe: urlDanfe,
      url_xml: urlXml,
      error_message: errorMessage || existing.error_message || null,
    });

    return NextResponse.json({
      ok: true,
      message: "Status da NF-e atualizado.",
      focus: json,
      saved: {
        status,
        numero,
        serie,
        chave,
        protocolo,
        url_danfe: urlDanfe,
        url_xml: urlXml,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "Erro interno ao consultar status da NF-e.",
      },
      { status: 500 }
    );
  }
}