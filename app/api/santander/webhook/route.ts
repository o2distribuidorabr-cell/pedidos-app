/**
 * app/api/santander/webhook/route.ts
 *
 * Callback do PIX Santander. O banco chama esta URL (POST) sempre que um pix
 * é recebido numa cobrança da nossa chave. Corpo esperado (padrão BACEN):
 *   { "pix": [ { "txid", "endToEndId", "valor", "horario", ... } ] }
 *
 * Segurança: NÃO confiamos no corpo do POST para dar baixa. Para cada txid
 * recebido, reconsultamos a API autenticada do Santander (mTLS + OAuth) via
 * reconcileTxid() e só marcamos pago se a cobrança estiver CONCLUIDA com pix.
 * Um POST forjado, no pior caso, dispara uma consulta que não encontra
 * pagamento e não faz nada.
 *
 * Registra-se uma única vez com PUT /api/santander/webhook/register.
 */

import { NextResponse } from "next/server";
import { buildHttpsAgent, getAdminSupabase, getToken, reconcileTxid } from "@/lib/santanderPix";

export const runtime = "nodejs";

function extractPixItems(body: any): any[] {
  if (Array.isArray(body?.pix)) return body.pix;
  if (Array.isArray(body)) return body;
  if (body?.pix && typeof body.pix === "object") return [body.pix];
  if (body?.txid) return [body];
  return [];
}

export async function POST(req: Request) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const items = extractPixItems(body);

  // ping / verificação de URL / formato desconhecido — 200 pra Santander não retentar
  if (items.length === 0) {
    return NextResponse.json({ ok: true, ignored: true, reason: "sem itens pix no corpo" });
  }

  let supabase: ReturnType<typeof getAdminSupabase>;
  let agent: Awaited<ReturnType<typeof buildHttpsAgent>>;
  let token: string;
  try {
    supabase = getAdminSupabase();
    agent = await buildHttpsAgent();
    token = await getToken(agent);
  } catch (e: any) {
    // 500 => Santander tentará de novo mais tarde; a conciliação agendada também cobre.
    return NextResponse.json({ error: `setup Santander falhou: ${String(e?.message || e)}` }, { status: 500 });
  }

  const results: any[] = [];
  let paid = 0;

  for (const it of items) {
    const txid = String(it?.txid || "").trim();
    if (!txid) {
      results.push({ txid: null, ok: false, reason: "item sem txid" });
      continue;
    }
    try {
      const r = await reconcileTxid({ supabase, agent, token, txid });
      if (r.paid && !r.alreadyPaid) paid++;
      results.push({ ...r, ok: true });
    } catch (e: any) {
      results.push({ txid, ok: false, reason: String(e?.message || e) });
    }
  }

  const hadError = results.some((r) => !r.ok);
  return NextResponse.json(
    { ok: !hadError, processed: results.length, paid, results },
    { status: hadError ? 207 : 200 },
  );
}

// útil para conferir no navegador que a rota está publicada
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/santander/webhook", method: "POST" });
}
