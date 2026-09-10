/**
 * Helpers compartilhados da integração PIX Santander.
 *
 * As rotas app/api/santander/pix e app/api/santander/status têm o próprio
 * código (não são tocadas aqui, pra não arriscar regressão no que já roda).
 * Este módulo serve o webhook (app/api/santander/webhook), a conciliação
 * (app/api/santander/reconcile) e o registro de webhook.
 *
 * Todas as leituras de env são preguiçosas (dentro das funções) — importar o
 * módulo nunca derruba o build de outra rota por falta de variável.
 */

import https from "https";
import axios from "axios";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const PIX_BASE = "https://trust-pix.santander.com.br";

function env(name: string): string {
  const v = String(process.env[name] || "").trim();
  if (!v) throw new Error(`Variável de ambiente obrigatória não configurada: ${name}`);
  return v;
}
function envOpt(name: string): string | null {
  const v = String(process.env[name] || "").trim();
  return v || null;
}

// ── Certificado mTLS (mesma lógica das rotas pix/status) ─────────────────────
let _pfxCache: Buffer | undefined;

export async function getPfxBuffer(): Promise<Buffer> {
  if (_pfxCache) return _pfxCache;

  const bucket = envOpt("SANTANDER_CERT_BUCKET");
  const objectPath = envOpt("SANTANDER_CERT_OBJECT");
  if (bucket && objectPath) {
    const sb = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const { data, error } = await sb.storage.from(bucket).download(objectPath);
    if (error || !data) {
      throw new Error(
        `Falha ao baixar certificado do Supabase Storage (${bucket}/${objectPath}): ${error?.message || "sem data"}`,
      );
    }
    _pfxCache = Buffer.from(await (data as any).arrayBuffer());
    return _pfxCache;
  }

  const p1 = envOpt("SANTANDER_CERT_BASE64_1");
  const p2 = envOpt("SANTANDER_CERT_BASE64_2");
  const p3 = envOpt("SANTANDER_CERT_BASE64_3");
  if (p1 && p2 && p3) {
    _pfxCache = Buffer.from(`${p1}${p2}${p3}`.replace(/\s/g, ""), "base64");
    return _pfxCache;
  }

  const certPath = envOpt("SANTANDER_CERT_PATH");
  if (certPath) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs");
    _pfxCache = fs.readFileSync(certPath) as Buffer;
    return _pfxCache;
  }

  throw new Error(
    "Certificado Santander não configurado. Use SANTANDER_CERT_BUCKET + SANTANDER_CERT_OBJECT (Supabase Storage) ou SANTANDER_CERT_BASE64_1/2/3 ou SANTANDER_CERT_PATH.",
  );
}

export async function buildHttpsAgent(): Promise<https.Agent> {
  return new https.Agent({
    pfx: await getPfxBuffer(),
    passphrase: env("SANTANDER_CERT_PASS"),
    rejectUnauthorized: true,
  });
}

export function getAdminSupabase(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

export async function getToken(agent: https.Agent): Promise<string> {
  const res = await axios.post(
    `${PIX_BASE}/oauth/token?grant_type=client_credentials`,
    new URLSearchParams({
      client_id: env("SANTANDER_CLIENT_ID"),
      client_secret: env("SANTANDER_CLIENT_SECRET"),
    }).toString(),
    {
      httpsAgent: agent,
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      timeout: 30000,
      validateStatus: () => true,
    },
  );
  const raw = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Erro ao gerar token Santander | HTTP ${res.status} | ${raw}`);
  }
  const token = res.data?.access_token;
  if (!token) throw new Error(`Token Santander sem access_token: ${raw}`);
  return String(token);
}

export async function getCobByTxid(agent: https.Agent, token: string, txid: string): Promise<any> {
  const res = await axios.get(`${PIX_BASE}/api/v1/cob/${encodeURIComponent(txid)}`, {
    httpsAgent: agent,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    timeout: 30000,
    validateStatus: () => true,
  });
  if (res.status >= 200 && res.status < 300) return res.data;
  const raw = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
  throw new Error(`Erro ao consultar cob ${txid} | HTTP ${res.status} | ${raw}`);
}

// ── Interpretação da cobrança ───────────────────────────────────────────────
export type CobInfo = {
  status: string;
  paid: boolean;
  paidAmount: number | null;
  paidAt: string | null;
  e2eId: string | null;
};

export function interpretCob(cob: any): CobInfo {
  const status = String(cob?.status || "").toUpperCase();
  const pixList = Array.isArray(cob?.pix) ? cob.pix : [];
  const first = pixList[0] || null;

  // Só é "pago" se a cobrança está CONCLUIDA E existe pelo menos um pix recebido.
  const paid = status === "CONCLUIDA" && pixList.length > 0;

  let paidAmount: number | null = null;
  if (paid) {
    const v = Number(first?.valor ?? cob?.valor?.original ?? 0);
    paidAmount = Number.isFinite(v) && v > 0 ? v : null;
  }

  const horario = first?.horario ? String(first.horario) : null;
  const paidAt = paid
    ? horario && !Number.isNaN(Date.parse(horario))
      ? new Date(horario).toISOString()
      : new Date().toISOString()
    : null;

  return {
    status,
    paid,
    paidAmount,
    paidAt,
    e2eId: first?.endToEndId ? String(first.endToEndId) : null,
  };
}

// ── Baixa do pedido + log em order_payments ─────────────────────────────────
export type ReconcileResult = {
  txid: string;
  orderId: string | null;
  status: string;
  paid: boolean;
  alreadyPaid: boolean;
  amount: number | null;
};

async function resolveOrderByTxid(
  supabase: SupabaseClient,
  txid: string,
): Promise<{ id: string; store_id: string | null } | null> {
  // 1) pedido cujo santander_txid atual é este
  const { data: byOrder } = await supabase
    .from("orders")
    .select("id,store_id")
    .eq("santander_txid", txid)
    .maybeSingle();
  if ((byOrder as any)?.id) return byOrder as any;

  // 2) fallback: já existe log deste txid em order_payments (txid rotacionado depois)
  const { data: byLog } = await supabase
    .from("order_payments")
    .select("order_id,store_id")
    .eq("gateway", "SANTANDER")
    .eq("payment_id", txid)
    .maybeSingle();
  if ((byLog as any)?.order_id) {
    return { id: (byLog as any).order_id, store_id: (byLog as any).store_id ?? null };
  }

  return null;
}

/**
 * Consulta a cobrança na API autenticada do Santander e, se estiver paga,
 * dá baixa no pedido. Sempre grava/atualiza o log em order_payments.
 * Idempotente: não sobrescreve um pedido que já está is_paid = true.
 */
export async function reconcileTxid(params: {
  supabase: SupabaseClient;
  agent: https.Agent;
  token: string;
  txid: string;
  order?: { id: string; store_id: string | null } | null;
}): Promise<ReconcileResult> {
  const { supabase, agent, token, txid } = params;

  const order = params.order ?? (await resolveOrderByTxid(supabase, txid));
  const cob = await getCobByTxid(agent, token, txid);
  const info = interpretCob(cob);

  if (!order) {
    return { txid, orderId: null, status: info.status, paid: info.paid, alreadyPaid: false, amount: info.paidAmount };
  }

  // log (idempotente por gateway + payment_id) — dá o selo "Santander" no financeiro
  await supabase.from("order_payments").upsert(
    {
      order_id: order.id,
      store_id: order.store_id,
      gateway: "SANTANDER",
      payment_id: txid,
      status: info.status,
      amount: info.paidAmount,
      external_reference: order.id,
      raw_response: cob,
    },
    { onConflict: "gateway,payment_id" },
  );

  if (!info.paid) {
    return { txid, orderId: order.id, status: info.status, paid: false, alreadyPaid: false, amount: null };
  }

  const { data: cur } = await supabase.from("orders").select("is_paid").eq("id", order.id).maybeSingle();
  if ((cur as any)?.is_paid) {
    return { txid, orderId: order.id, status: info.status, paid: true, alreadyPaid: true, amount: info.paidAmount };
  }

  const payload: Record<string, any> = {
    is_paid: true,
    paid_at: info.paidAt ?? new Date().toISOString(),
    payment_method: "PIX",
  };
  if (info.paidAmount != null) payload.paid_amount = info.paidAmount;

  const { error } = await supabase.from("orders").update(payload).eq("id", order.id);
  if (error) throw new Error(`Falha ao baixar pedido ${order.id}: ${error.message}`);

  return { txid, orderId: order.id, status: info.status, paid: true, alreadyPaid: false, amount: info.paidAmount };
}
