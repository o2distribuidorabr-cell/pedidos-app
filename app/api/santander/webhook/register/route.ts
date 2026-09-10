/**
 * app/api/santander/webhook/register/route.ts
 *
 * Administra o registro do webhook PIX na chave do Santander. Roda uma vez
 * (ou quando a URL mudar). Protegido por Bearer INTERNAL_TRIGGER_SECRET.
 *
 *   GET    -> consulta o webhook registrado hoje na chave
 *   PUT    -> registra/atualiza. Body opcional { webhookUrl?: string };
 *             se omitido, usa <base>/api/santander/webhook
 *             (base = env URL do Netlify, senão NEXT_PUBLIC_APP_URL, senão origin)
 *   DELETE -> remove o webhook da chave
 *
 * Endpoints BACEN: {PIX_BASE}/api/v1/webhook/{chave}
 */

import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { PIX_BASE, buildHttpsAgent, getToken } from "@/lib/santanderPix";

export const runtime = "nodejs";

function autorizado(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  return !!process.env.INTERNAL_TRIGGER_SECRET && auth === `Bearer ${process.env.INTERNAL_TRIGGER_SECRET}`;
}

function pixKey(): string {
  const k = String(process.env.SANTANDER_PIX_KEY || "").trim();
  if (!k) throw new Error("SANTANDER_PIX_KEY não configurada.");
  return k;
}

function defaultWebhookUrl(req: NextRequest): string {
  const base = String(process.env.URL || process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin || "")
    .trim()
    .replace(/\/$/, "");
  if (!base) throw new Error("Não foi possível determinar a URL base; envie webhookUrl no corpo.");
  return `${base}/api/santander/webhook`;
}

async function santander(method: "get" | "put" | "delete", path: string, data?: any) {
  const agent = await buildHttpsAgent();
  const token = await getToken(agent);
  const res = await axios.request({
    method,
    url: `${PIX_BASE}${path}`,
    data,
    httpsAgent: agent,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    timeout: 30000,
    validateStatus: () => true,
  });
  const raw = typeof res.data === "string" ? res.data : res.data;
  return { status: res.status, data: raw };
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const { status, data } = await santander("get", `/api/v1/webhook/${encodeURIComponent(pixKey())}`);
    return NextResponse.json({ ok: status >= 200 && status < 300, status, webhook: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({} as any));
    const webhookUrl = String(body?.webhookUrl || "").trim() || defaultWebhookUrl(req);
    if (!/^https:\/\//i.test(webhookUrl)) {
      return NextResponse.json({ error: "webhookUrl deve ser https." }, { status: 400 });
    }
    const { status, data } = await santander(
      "put",
      `/api/v1/webhook/${encodeURIComponent(pixKey())}`,
      { webhookUrl },
    );
    const ok = status >= 200 && status < 300;
    return NextResponse.json({ ok, status, webhookUrl, response: data }, { status: ok ? 200 : 502 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const { status, data } = await santander("delete", `/api/v1/webhook/${encodeURIComponent(pixKey())}`);
    const ok = status >= 200 && status < 300;
    return NextResponse.json({ ok, status, response: data }, { status: ok ? 200 : 502 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
