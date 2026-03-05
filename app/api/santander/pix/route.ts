import { NextResponse } from "next/server";
import https from "https";
import crypto from "crypto";
import axios from "axios";
import QRCode from "qrcode";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Body = {
  orderId?: string;
  storeId?: string;
  value?: number | string;
  valor?: number | string;
  description?: string;
  pedido?: string;
  payer?: {
    email?: string;
    name?: string;
    cpf?: string;
  };
  nome?: string;
  cpf?: string;
  merchantName?: string;
  merchantCity?: string;
};

function readEnv(name: string) {
  const v = String(process.env[name] || "").trim();
  if (!v) {
    throw new Error(`Variável de ambiente obrigatória não configurada: ${name}`);
  }
  return v;
}

function readEnvOptional(name: string) {
  const v = String(process.env[name] || "").trim();
  return v || null;
}

// ✅ Mantém as mesmas envs obrigatórias (só não lê CERT_PATH no topo)
const CERT_PASS = readEnv("SANTANDER_CERT_PASS");
const CLIENT_ID = readEnv("SANTANDER_CLIENT_ID");
const CLIENT_SECRET = readEnv("SANTANDER_CLIENT_SECRET");
const PIX_KEY = readEnv("SANTANDER_PIX_KEY");

const SUPABASE_URL = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = readEnv("SUPABASE_SERVICE_ROLE_KEY");

const DEFAULT_MERCHANT_NAME = String(
  process.env.SANTANDER_MERCHANT_NAME || "o2 Distribuidora"
).trim();

const DEFAULT_MERCHANT_CITY = String(
  process.env.SANTANDER_MERCHANT_CITY || "CONTAGEM"
).trim();

// ✅ cache do pfx (evita baixar do storage a cada request)
let _pfxCache: Buffer | undefined;

// ✅ Netlify/Prod: certificado no Supabase Storage (bucket/obj)
async function getPfxBuffer(): Promise<Buffer> {
  if (_pfxCache) return _pfxCache;

  // 1) ✅ NOVO: Supabase Storage (bucket + object)
  const bucket = readEnvOptional("SANTANDER_CERT_BUCKET");
  const objectPath = readEnvOptional("SANTANDER_CERT_OBJECT");

  if (bucket && objectPath) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase.storage.from(bucket).download(objectPath);

    if (error || !data) {
      throw new Error(
        `Falha ao baixar certificado do Supabase Storage (${bucket}/${objectPath}): ${error?.message || "sem data"}`
      );
    }

    // data pode ser Blob (Node 18+)
    const ab = await (data as any).arrayBuffer();
    _pfxCache = Buffer.from(ab);
    return _pfxCache;
  }

  // 2) ✅ fallback: Base64 quebrado em 3 partes (antigo)
  const p1 = readEnvOptional("SANTANDER_CERT_BASE64_1");
  const p2 = readEnvOptional("SANTANDER_CERT_BASE64_2");
  const p3 = readEnvOptional("SANTANDER_CERT_BASE64_3");

  if (p1 && p2 && p3) {
    const base64 = `${p1}${p2}${p3}`.replace(/\s/g, "");
    _pfxCache = Buffer.from(base64, "base64");
    return _pfxCache;
  }

  // 3) ✅ fallback local opcional
  const certPath = readEnvOptional("SANTANDER_CERT_PATH");
if (certPath) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("fs");
  _pfxCache = fs.readFileSync(certPath) as Buffer;
  return _pfxCache;
}

  throw new Error(
    "Certificado Santander não configurado. Use SANTANDER_CERT_BUCKET + SANTANDER_CERT_OBJECT (Netlify/Supabase Storage) ou SANTANDER_CERT_BASE64_1/2/3 (Netlify antigo) ou SANTANDER_CERT_PATH (local)."
  );
}

async function buildHttpsAgent() {
  return new https.Agent({
    pfx: await getPfxBuffer(),
    passphrase: CERT_PASS,
    rejectUnauthorized: true,
  });
}

function getAdminSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function onlyDigits(v?: string) {
  return String(v || "").replace(/\D/g, "");
}

function toMoneyString(v: unknown) {
  const raw = String(v ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!raw) {
    throw new Error('Valor não informado. Envie "value" ou "valor".');
  }

  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Valor inválido: ${raw}`);
  }

  return n.toFixed(2);
}

function sanitizeTxid(input: string) {
  const cleaned = String(input || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 35);

  if (cleaned.length >= 26) return cleaned;

  const suffix = crypto.randomBytes(16).toString("hex");
  return `${cleaned}${suffix}`.slice(0, 35);
}

function buildTxid(orderId?: string, pedido?: string) {
  const base = (orderId || pedido || "").trim();
  if (base) return sanitizeTxid(base);
  return crypto.randomBytes(16).toString("hex").slice(0, 32);
}

function emvField(id: string, value: string) {
  const v = value ?? "";
  const len = String(v.length).padStart(2, "0");
  return `${id}${len}${v}`;
}

function crc16ccitt(payload: string) {
  let crc = 0xffff;

  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;

    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function buildBrCodeDynamic(params: {
  payloadUrl: string;
  amount: string;
  txid?: string;
  merchantName: string;
  merchantCity: string;
}) {
  const payloadUrl = String(params.payloadUrl || "")
    .trim()
    .replace(/^https?:\/\//i, "");

  if (!payloadUrl) {
    throw new Error("payloadUrl vazio para montar BR Code.");
  }

  const merchantName =
    String(params.merchantName || "")
      .trim()
      .slice(0, 25) || "RECEBEDOR";

  const merchantCity =
    String(params.merchantCity || "")
      .trim()
      .slice(0, 15) || "CIDADE";

  const gui = emvField("00", "br.gov.bcb.pix");
  const urlField = emvField("25", payloadUrl);
  const merchantAccountInfo = emvField("26", `${gui}${urlField}`);

  const additional =
    params.txid && String(params.txid).trim()
      ? emvField("62", emvField("05", String(params.txid).trim().slice(0, 25)))
      : "";

  const withoutCrc =
    emvField("00", "01") +
    emvField("01", "12") +
    merchantAccountInfo +
    emvField("52", "0000") +
    emvField("53", "986") +
    emvField("54", String(params.amount)) +
    emvField("58", "BR") +
    emvField("59", merchantName) +
    emvField("60", merchantCity) +
    additional +
    "6304";

  const crc = crc16ccitt(withoutCrc);
  return `${withoutCrc}${crc}`;
}

async function getToken(agent: https.Agent) {
  const url =
    "https://trust-pix.santander.com.br/oauth/token?grant_type=client_credentials";

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });

  const response = await axios.post(url, body.toString(), {
    httpsAgent: agent,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    timeout: 30000,
    validateStatus: () => true,
  });

  const raw =
    typeof response.data === "string"
      ? response.data
      : JSON.stringify(response.data);

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Erro ao gerar token Santander | HTTP ${response.status} | ${raw}`
    );
  }

  const accessToken = response.data?.access_token;
  if (!accessToken) {
    throw new Error(`Token Santander sem access_token: ${raw}`);
  }

  return String(accessToken);
}

async function getCobByTxid(params: {
  httpsAgent: https.Agent;
  token: string;
  txid: string;
}) {
  const { httpsAgent, token, txid } = params;

  const url = `https://trust-pix.santander.com.br/api/v1/cob/${txid}`;

  const response = await axios.get(url, {
    httpsAgent,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    timeout: 30000,
    validateStatus: () => true,
  });

  if (response.status >= 200 && response.status < 300) {
    return response.data;
  }

  const raw =
    typeof response.data === "string"
      ? response.data
      : JSON.stringify(response.data);

  throw new Error(
    `Erro ao consultar cobrança Santander | HTTP ${response.status} | ${raw}`
  );
}

async function createOrGetCob(params: {
  httpsAgent: https.Agent;
  token: string;
  txid: string;
  payload: any;
}) {
  const { httpsAgent, token, txid, payload } = params;

  const url = `https://trust-pix.santander.com.br/api/v1/cob/${txid}`;

  const response = await axios.put(url, payload, {
    httpsAgent,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    timeout: 30000,
    validateStatus: () => true,
  });

  if (response.status >= 200 && response.status < 300) {
    return response.data;
  }

  const raw =
    typeof response.data === "string"
      ? response.data
      : JSON.stringify(response.data);

  const lower = raw.toLowerCase();

  const isDuplicateTxid =
    response.status === 400 &&
    (lower.includes("já encontra-se cadastrado") ||
      lower.includes("ja encontra-se cadastrado") ||
      lower.includes("qrcode com este txid"));

  if (isDuplicateTxid) {
    return await getCobByTxid({ httpsAgent, token, txid });
  }

  throw new Error(
    `Erro ao criar cobrança Santander | HTTP ${response.status} | ${raw}`
  );
}

function addSecondsToIso(baseIso: string | null, seconds: number) {
  const base = baseIso ? new Date(baseIso) : new Date();
  return new Date(base.getTime() + seconds * 1000).toISOString();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const orderId = String(body?.orderId || "").trim();
    const pedido = String(body?.pedido || orderId || "SEM_PEDIDO").trim();

    const valor = toMoneyString(body?.value ?? body?.valor);
    const nome = String(body?.payer?.name || body?.nome || "Cliente").trim();
    const cpf = onlyDigits(body?.payer?.cpf || body?.cpf);

    const txid = buildTxid(orderId, pedido);

    // ✅ ÚNICA mudança fora do certificado: agora é async
    const httpsAgent = await buildHttpsAgent();
    const token = await getToken(httpsAgent);

    const payload: any = {
      calendario: {
        expiracao: 3600,
      },
      valor: {
        original: valor,
      },
      chave: PIX_KEY,
      solicitacaoPagador: `Pedido ${pedido}`.slice(0, 140),
    };

    if (cpf && cpf.length === 11) {
      payload.devedor = {
        cpf,
        nome: nome.slice(0, 200),
      };
    }

    const cob = await createOrGetCob({
      httpsAgent,
      token,
      txid,
      payload,
    });

    const locationRaw = String(cob?.location || "").trim();
    if (!locationRaw) {
      throw new Error(`Cobrança criada sem location: ${JSON.stringify(cob)}`);
    }

    const payloadUrl = locationRaw.replace(/^https?:\/\//i, "");

    const qrCode = buildBrCodeDynamic({
      payloadUrl,
      amount: valor,
      txid: String(cob?.txid || txid),
      merchantName: String(body?.merchantName || DEFAULT_MERCHANT_NAME),
      merchantCity: String(body?.merchantCity || DEFAULT_MERCHANT_CITY),
    });

    const qrCodeDataUrl = await QRCode.toDataURL(qrCode, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
    });

    const qrCodeBase64 = qrCodeDataUrl.replace(/^data:image\/png;base64,/, "");

    const createdAtIso = cob?.calendario?.criacao
      ? new Date(cob.calendario.criacao).toISOString()
      : new Date().toISOString();

    const expiresAt = addSecondsToIso(
      createdAtIso,
      Number(cob?.calendario?.expiracao ?? 3600) || 3600
    );

    if (orderId) {
      const supabase = getAdminSupabase();

      const { error: updateErr } = await supabase
        .from("orders")
        .update({
          santander_txid: String(cob?.txid || txid),
        })
        .eq("id", orderId);

      if (updateErr) {
        throw new Error(
          `Cobrança criada, mas falhou ao salvar santander_txid no pedido: ${updateErr.message}`
        );
      }
    }

    return NextResponse.json({
      paymentId: String(cob?.txid || txid),
      status: String(cob?.status || "ATIVA"),
      detail: null,
      qrCode,
      qrCodeBase64,
      amountUsed: Number(valor),
      expiresAt,
      location: `https://${payloadUrl}`,
      gateway: "SANTANDER",
      rawResponse: {
        cob,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        error: String(e?.message || e),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use POST neste endpoint." }, { status: 405 });
}