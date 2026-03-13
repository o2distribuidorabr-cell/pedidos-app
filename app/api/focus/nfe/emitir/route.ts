import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type EmitBody = {
  orderId: string;
  storeId: string;
  emitterId?: string | null;
  reference?: string | null;
  natureza_operacao?: string | null;
  serie?: string | null;
  numero?: string | null;
  destinatario: {
    nome: string;
    nome_fantasia?: string | null;
    cpf_cnpj: string;
    indicador_inscricao_estadual?: string | null;
    inscricao_estadual?: string | null;
    email?: string | null;
    telefone?: string | null;
    endereco: {
      logradouro: string;
      numero: string;
      complemento?: string | null;
      bairro: string;
      cep: string;
      municipio: string;
      uf: string;
    };
  };
  transporte?: {
    modalidade_frete?: string | null;
    valor_frete?: number | null;
  };
  itens: Array<{
    codigo: string;
    descricao: string;
    ncm?: string | null;
    cest?: string | null;
    cfop?: string | null;
    unidade: string;
    quantidade: number;
    valor_unitario: number;
    valor_total?: number;
    gtin?: string | null;
    origem?: string | null;
    icms_situacao_tributaria?: string | null;
    pis_situacao_tributaria?: string | null;
    cofins_situacao_tributaria?: string | null;

    icms_percent?: string | null;
    sit_trib?: string | null;
    pis_percent?: string | null;
    cofins_percent?: string | null;
    aliq_mun?: string | null;
    aliq_est?: string | null;
    aliq_fed?: string | null;
    aliq_csosn?: string | null;
    csosn?: string | null;
    base_reduction_percent?: string | null;
    benefit_fiscal?: string | null;
    desoneration_percent?: string | null;
    red_base_effective_percent?: string | null;
    icms_effective_percent?: string | null;
    cst_rt?: string | null;
    cod_class_trib_rt?: string | null;
    cbs_rt_percent?: string | null;
    ibs_uf_rt_percent?: string | null;
    ibs_mun_rt_percent?: string | null;
    red_cbs_rt_percent?: string | null;
    red_ibs_uf_rt_percent?: string | null;
    red_ibs_mun_rt_percent?: string | null;
  }>;
  observacoes?: string | null;
};

type EmitterRow = {
  id: string;
  name: string;
  legal_name: string;
  cnpj: string;
  ie: string | null;
  email: string | null;
  phone: string | null;
  address_zip: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  city: string | null;
  state: string | null;
  default_natureza_operacao: string | null;
  default_serie: string | null;
  is_active: boolean;
  is_default: boolean;
};

function envOrThrow(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

function onlyDigits(v: unknown) {
  return String(v ?? "").replace(/\D/g, "");
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

function normalizeNumero(value?: string | null) {
  const v = String(value || "").trim();
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : undefined;
}

function normalizeSerie(value?: string | null) {
  const v = String(value || "").trim();
  if (!v) return "1";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "1";
}

function safeJsonParse(text: string) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function normalizeUnit(value: string | null | undefined) {
  const raw = String(value || "").trim().toUpperCase();

  if (!raw) return "UN";

  const map: Record<string, string> = {
    UN: "UN",
    UND: "UN",
    UNID: "UN",
    UNIDADE: "UN",
    UNIDADES: "UN",
    KG: "KG",
    KGS: "KG",
    QUILO: "KG",
    QUILOS: "KG",
    G: "G",
    GR: "G",
    GRAMA: "G",
    GRAMAS: "G",
    CX: "CX",
    CAIXA: "CX",
    CAIXAS: "CX",
    PCT: "PCT",
    PACOTE: "PCT",
    PACOTES: "PCT",
    FD: "FD",
    FARDO: "FD",
    LT: "LT",
    L: "LT",
    LITRO: "LT",
    LITROS: "LT",
    ML: "ML",
    SC: "SC",
    SACO: "SC",
    SACOS: "SC",
    BALDE: "BD",
    BD: "BD",
    FRASCO: "FR",
    FR: "FR",
    ROLO: "RL",
    RL: "RL",
  };

  if (map[raw]) return map[raw];

  const compact = raw.replace(/\s+/g, "");
  if (map[compact]) return map[compact];

  return compact.slice(0, 6) || "UN";
}

function normalizeIndIEDest(
  indicador: string | null | undefined,
  inscricaoEstadual: string | null | undefined
) {
  const ie = onlyDigits(inscricaoEstadual || "");
  if (ie) return "1";

  const ind = String(indicador || "").trim();
  if (ind === "1" || ind === "2" || ind === "9") return ind;

  return "9";
}

function validateBody(body: EmitBody) {
  const errors: string[] = [];

  if (!body?.orderId) errors.push("orderId é obrigatório.");
  if (!body?.storeId) errors.push("storeId é obrigatório.");

  if (!body?.destinatario?.nome) {
    errors.push("Destinatário: nome é obrigatório.");
  }

  const doc = onlyDigits(body?.destinatario?.cpf_cnpj);
  if (![11, 14].includes(doc.length)) {
    errors.push("Destinatário: CPF/CNPJ deve ter 11 ou 14 dígitos.");
  }

  if (!Array.isArray(body.itens) || body.itens.length === 0) {
    errors.push("Itens da NF-e são obrigatórios.");
  }

  body?.itens?.forEach((item, index) => {
    const line = index + 1;
    if (!String(item.descricao || "").trim()) errors.push(`Item ${line}: descrição obrigatória.`);
    if (!String(item.unidade || "").trim()) errors.push(`Item ${line}: unidade obrigatória.`);
    if (!String(item.ncm || "").trim()) errors.push(`Item ${line}: NCM obrigatório.`);
    if (!String(item.cfop || "").trim()) errors.push(`Item ${line}: CFOP obrigatório.`);
    if (!String(item.origem || "").trim()) errors.push(`Item ${line}: origem obrigatória.`);
    if (!String(item.icms_situacao_tributaria || "").trim()) errors.push(`Item ${line}: ICMS/CST obrigatório.`);
    if (!String(item.pis_situacao_tributaria || "").trim()) errors.push(`Item ${line}: PIS CST obrigatório.`);
    if (!String(item.cofins_situacao_tributaria || "").trim()) errors.push(`Item ${line}: COFINS CST obrigatório.`);

    const qtd = Number(item.quantidade || 0);
    const vUnit = Number(item.valor_unitario || 0);

    if (!(qtd > 0)) errors.push(`Item ${line}: quantidade deve ser maior que zero.`);
    if (!(vUnit >= 0)) errors.push(`Item ${line}: valor unitário inválido.`);
  });

  return errors;
}

async function getEmitter(emitterId?: string | null) {
  const supabaseUrl = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");

  const baseHeaders = {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    "Content-Type": "application/json",
  };

  if (emitterId) {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/emitters?id=eq.${encodeURIComponent(emitterId)}&select=*`,
      { headers: baseHeaders, cache: "no-store" }
    );

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Falha ao buscar emitente por id: ${txt}`);
    }

    const arr = (await res.json()) as EmitterRow[];
    if (arr?.[0]) return arr[0];
  }

  const defaultRes = await fetch(
    `${supabaseUrl}/rest/v1/emitters?is_default=eq.true&is_active=eq.true&select=*`,
    { headers: baseHeaders, cache: "no-store" }
  );

  if (!defaultRes.ok) {
    const txt = await defaultRes.text();
    throw new Error(`Falha ao buscar emitente padrão: ${txt}`);
  }

  const arr = (await defaultRes.json()) as EmitterRow[];
  if (!arr?.[0]) {
    throw new Error("Nenhum emitente padrão ativo encontrado.");
  }

  return arr[0];
}

function buildFocusPayload(body: EmitBody, emitter: EmitterRow) {
  const valorFrete = Number(body.transporte?.valor_frete ?? 0) || 0;

  const valorProdutos = body.itens.reduce((acc, item) => {
    const total = Number(item.valor_total ?? Number(item.quantidade) * Number(item.valor_unitario));
    return acc + (Number.isFinite(total) ? total : 0);
  }, 0);

  const valorTotal = valorProdutos + valorFrete;
  const destDoc = onlyDigits(body.destinatario.cpf_cnpj);
  const destIE = onlyDigits(body.destinatario.inscricao_estadual || "");
  const indIEDest = normalizeIndIEDest(
    body.destinatario.indicador_inscricao_estadual,
    body.destinatario.inscricao_estadual
  );

  return {
    natureza_operacao: (
      body.natureza_operacao ||
      emitter.default_natureza_operacao ||
      "VENDA DE MERCADORIA"
    ).trim(),
    data_emissao: new Date().toISOString(),
    tipo_documento: "1",
    finalidade_emissao: "1",

    cnpj_emitente: onlyDigits(emitter.cnpj),
    inscricao_estadual_emitente: emitter.ie || undefined,
    razao_social_emitente: emitter.legal_name,
    nome_fantasia_emitente: emitter.name,
    logradouro_emitente: emitter.address_street || undefined,
    numero_emitente: emitter.address_number || undefined,
    complemento_emitente: emitter.address_complement || undefined,
    bairro_emitente: emitter.address_neighborhood || undefined,
    municipio_emitente: emitter.city || undefined,
    uf_emitente: emitter.state || undefined,
    cep_emitente: onlyDigits(emitter.address_zip || "") || undefined,
    telefone_emitente: onlyDigits(emitter.phone || "") || undefined,
    email_emitente: emitter.email || undefined,

    nome_destinatario: body.destinatario.nome,
    nome_fantasia_destinatario: body.destinatario.nome_fantasia || undefined,
    cpf_destinatario: destDoc.length === 11 ? destDoc : undefined,
    cnpj_destinatario: destDoc.length === 14 ? destDoc : undefined,
    inscricao_estadual_destinatario: destIE || undefined,
    indicador_inscricao_estadual_destinatario: indIEDest,
    email_destinatario: body.destinatario.email || undefined,
    telefone_destinatario: onlyDigits(body.destinatario.telefone || "") || undefined,
    logradouro_destinatario: body.destinatario.endereco.logradouro,
    numero_destinatario: body.destinatario.endereco.numero,
    complemento_destinatario: body.destinatario.endereco.complemento || undefined,
    bairro_destinatario: body.destinatario.endereco.bairro,
    municipio_destinatario: body.destinatario.endereco.municipio,
    uf_destinatario: body.destinatario.endereco.uf,
    pais_destinatario: "Brasil",
    cep_destinatario: onlyDigits(body.destinatario.endereco.cep),

    modalidade_frete: body.transporte?.modalidade_frete || "9",
    valor_frete: valorFrete,
    valor_seguro: 0,
    valor_produtos: valorProdutos,
    valor_total: valorTotal,

    items: body.itens.map((item, index) => {
      const quantidade = Number(item.quantidade || 0);
      const valorUnitario = Number(item.valor_unitario || 0);
      const valorBruto = Number(item.valor_total ?? quantidade * valorUnitario);
      const unidade = normalizeUnit(item.unidade);

      return {
        numero_item: String(index + 1),
        codigo_produto: item.codigo,
        descricao: item.descricao,
        cfop: item.cfop || undefined,
        unidade_comercial: unidade,
        quantidade_comercial: quantidade,
        valor_unitario_comercial: valorUnitario,
        valor_unitario_tributavel: valorUnitario,
        unidade_tributavel: unidade,
        codigo_ncm: item.ncm ? onlyDigits(item.ncm) : undefined,
        codigo_ean_comercial: item.gtin || undefined,
        codigo_ean_tributavel: item.gtin || undefined,
        quantidade_tributavel: quantidade,
        valor_bruto: valorBruto,
        cest: item.cest ? onlyDigits(item.cest) : undefined,
        icms_situacao_tributaria: item.icms_situacao_tributaria || undefined,
        icms_origem: item.origem || undefined,
        pis_situacao_tributaria: item.pis_situacao_tributaria || undefined,
        cofins_situacao_tributaria: item.cofins_situacao_tributaria || undefined,
      };
    }),

    observacoes: body.observacoes || undefined,
    serie: normalizeSerie(body.serie || emitter.default_serie),
    numero: normalizeNumero(body.numero),
  };
}

async function saveFocusDoc(doc: {
  order_id: string;
  store_id: string;
  emitter_id: string;
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
    emitter_id: doc.emitter_id,
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
    throw new Error(`Falha ao gravar focus_nfe_documents: ${txt || res.status}`);
  }

  return res.json().catch(() => null);
}

export async function POST(req: NextRequest) {
  try {
    const token = envOrThrow("FOCUS_NFE_TOKEN");
    const baseUrl = focusBaseUrl();

    const body = (await req.json()) as EmitBody;
    const validationErrors = validateBody(body);

    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Falha de validação dos dados da NF-e.",
          validation_errors: validationErrors,
        },
        { status: 400 }
      );
    }

    const emitter = await getEmitter(body.emitterId || null);
    const reference = String(body.reference || `PED-${body.orderId}`).trim();
    const focusPayload = buildFocusPayload(body, emitter);

    const url = `${baseUrl}/v2/nfe?ref=${encodeURIComponent(reference)}`;

    const focusRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(focusPayload),
      cache: "no-store",
    });

    const rawText = await focusRes.text();
    const json = safeJsonParse(rawText);

    if (!focusRes.ok) {
      const errorMessage =
        json?.mensagem ||
        json?.message ||
        json?.erro ||
        rawText ||
        `HTTP ${focusRes.status}`;

      await saveFocusDoc({
        order_id: body.orderId,
        store_id: body.storeId,
        emitter_id: emitter.id,
        reference,
        status: "erro",
        numero: normalizeNumero(body.numero) ?? null,
        serie: normalizeSerie(body.serie || emitter.default_serie),
        error_message: typeof errorMessage === "string" ? errorMessage : JSON.stringify(errorMessage),
      });

      return NextResponse.json(
        {
          ok: false,
          error: errorMessage,
          focus_status: focusRes.status,
          focus_details: json || rawText || null,
          debug: {
            emitter: {
              id: emitter.id,
              cnpj: emitter.cnpj,
              legal_name: emitter.legal_name,
            },
            destinatario: {
              documento: body.destinatario.cpf_cnpj,
              ie: body.destinatario.inscricao_estadual,
              ind_ie_dest: normalizeIndIEDest(
                body.destinatario.indicador_inscricao_estadual,
                body.destinatario.inscricao_estadual
              ),
            },
            reference,
          },
        },
        { status: focusRes.status }
      );
    }

    await saveFocusDoc({
      order_id: body.orderId,
      store_id: body.storeId,
      emitter_id: emitter.id,
      reference,
      status: json?.status || "processando",
      numero: json?.numero || normalizeNumero(body.numero) || null,
      serie: json?.serie || normalizeSerie(body.serie || emitter.default_serie),
      chave: json?.chave || null,
      protocolo: json?.protocolo || null,
      url_danfe: json?.url_danfe || null,
      url_xml: json?.url_xml || null,
      error_message:
        json?.mensagem_sefaz ||
        (Array.isArray(json?.erros) ? JSON.stringify(json.erros) : json?.erros) ||
        null,
    });

    return NextResponse.json({
      ok: true,
      message: "NF-e enviada para processamento.",
      reference,
      focus: json,
      emitter: {
        id: emitter.id,
        cnpj: emitter.cnpj,
        legal_name: emitter.legal_name,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "Erro interno ao emitir NF-e.",
      },
      { status: 500 }
    );
  }
}