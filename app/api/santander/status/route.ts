import { NextResponse } from "next/server";
import https from "https";
import fs from "fs";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function readEnv(name: string) {
  const v = String(process.env[name] || "").trim();
  if (!v) {
    throw new Error(`Variável de ambiente obrigatória não configurada: ${name}`);
  }
  return v;
}

const CERT_PATH = readEnv("SANTANDER_CERT_PATH");
const CERT_PASS = readEnv("SANTANDER_CERT_PASS");
const CLIENT_ID = readEnv("SANTANDER_CLIENT_ID");
const CLIENT_SECRET = readEnv("SANTANDER_CLIENT_SECRET");

const SUPABASE_URL = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = readEnv("SUPABASE_SERVICE_ROLE_KEY");

function buildHttpsAgent() {
  return new https.Agent({
    pfx: fs.readFileSync(CERT_PATH),
    passphrase: CERT_PASS,
    rejectUnauthorized: true,
  });
}

function getAdminSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const txid = String(searchParams.get("txid") || "").trim();
    const orderId = String(searchParams.get("orderId") || "").trim();

    if (!txid && !orderId) {
      return NextResponse.json(
        { error: "Informe txid ou orderId." },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabase();

    let resolvedTxid = txid;
    let resolvedOrderId = orderId;

    if (!resolvedTxid && resolvedOrderId) {
      const { data: ord, error: ordErr } = await supabase
        .from("orders")
        .select("id,santander_txid,is_paid,paid_at,paid_amount")
        .eq("id", resolvedOrderId)
        .maybeSingle();

      if (ordErr) {
        return NextResponse.json(
          { error: `Erro ao buscar pedido: ${ordErr.message}` },
          { status: 500 }
        );
      }

      if (!ord) {
        return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
      }

      resolvedTxid = String(ord.santander_txid || "").trim();
      if (!resolvedTxid) {
        return NextResponse.json(
          { error: "Pedido ainda não possui santander_txid." },
          { status: 400 }
        );
      }
    }

    if (!resolvedOrderId && resolvedTxid) {
      const { data: ordByTxid } = await supabase
        .from("orders")
        .select("id,is_paid,paid_at,paid_amount")
        .eq("santander_txid", resolvedTxid)
        .maybeSingle();

      if (ordByTxid?.id) {
        resolvedOrderId = ordByTxid.id;
      }
    }

    const httpsAgent = buildHttpsAgent();
    const token = await getToken(httpsAgent);

    const url = `https://trust-pix.santander.com.br/api/v1/cob/${resolvedTxid}`;

    const response = await axios.get(url, {
      httpsAgent,
      headers: {
        Authorization: `Bearer ${token}`,
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
      return NextResponse.json(
        { error: `Erro ao consultar Santander | HTTP ${response.status} | ${raw}` },
        { status: 500 }
      );
    }

    const cob = response.data || {};
    const status = String(cob?.status || "").toUpperCase();

    let normalizedStatus = "pending";
    let paid = false;

    if (status === "CONCLUIDA") {
      normalizedStatus = "approved";
      paid = true;
    } else if (status === "ATIVA") {
      normalizedStatus = "pending";
    } else if (status === "REMOVIDA_PELO_USUARIO_RECEBEDOR" || status === "REMOVIDA_PELO_PSP") {
      normalizedStatus = "cancelled";
    } else {
      normalizedStatus = status ? status.toLowerCase() : "unknown";
    }

    let paidAmount: number | null = null;

    if (paid) {
      const original = Number(cob?.valor?.original ?? 0);
      paidAmount = Number.isFinite(original) ? original : null;
    }

    if (paid && resolvedOrderId) {
      const updatePayload: Record<string, any> = {
        is_paid: true,
        paid_at: new Date().toISOString(),
        payment_method: "PIX",
      };

      if (paidAmount != null) {
        updatePayload.paid_amount = paidAmount;
      }

      await supabase.from("orders").update(updatePayload).eq("id", resolvedOrderId);
    }

    return NextResponse.json({
      txid: resolvedTxid,
      orderId: resolvedOrderId || null,
      status,
      normalized_status: normalizedStatus,
      paid,
      paid_amount: paidAmount,
      calendario: cob?.calendario ?? null,
      valor: cob?.valor ?? null,
      rawResponse: cob,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}