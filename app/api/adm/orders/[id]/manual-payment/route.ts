import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Baixa manual de pagamento (marcar pago / marcar como não pago) protegida por senha.
 *
 * A senha vem da variável de ambiente MANUAL_PAYMENT_PASSWORD (Netlify).
 * Sem a variável configurada a rota recusa tudo (falha fechada) — assim uma
 * baixa manual nunca passa sem senha por esquecimento de configuração.
 *
 * Só quem está logado como admin pode chamar (Bearer = access token do Supabase).
 * Os pagamentos automáticos (webhook/conciliação Santander, cartão) NÃO passam
 * por aqui e continuam funcionando sem senha.
 */

type Body = {
  password?: string;
  is_paid?: boolean;
  paid_at?: string | null;
  payment_method?: string | null;
};

function sha(value: string) {
  return createHash("sha256").update(value).digest();
}

function passwordMatches(given: string, expected: string) {
  return timingSafeEqual(sha(given), sha(expected));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isAdminRequest(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return false;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return false;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role, approved, is_admin")
    .eq("id", data.user.id)
    .maybeSingle();

  const p = profile as { role?: string | null; approved?: boolean | null; is_admin?: boolean | null } | null;
  return !!p && (p.is_admin === true || (p.role === "admin" && p.approved === true));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, message: "Pedido inválido." }, { status: 400 });
    }

    if (!(await isAdminRequest(request))) {
      return NextResponse.json({ ok: false, message: "Acesso negado." }, { status: 403 });
    }

    const expected = process.env.MANUAL_PAYMENT_PASSWORD;
    if (!expected) {
      return NextResponse.json(
        { ok: false, message: "A senha da baixa manual ainda não foi configurada no servidor (MANUAL_PAYMENT_PASSWORD)." },
        { status: 503 }
      );
    }

    const body = (await request.json()) as Body;

    if (typeof body.password !== "string" || !body.password || !passwordMatches(body.password, expected)) {
      await sleep(800); // freia tentativa em sequência
      return NextResponse.json({ ok: false, message: "Senha incorreta." }, { status: 401 });
    }

    if (typeof body.is_paid !== "boolean") {
      return NextResponse.json({ ok: false, message: "Dados inválidos." }, { status: 400 });
    }

    const patch: Record<string, unknown> = { is_paid: body.is_paid };

    if (body.is_paid) {
      const paidAt = body.paid_at ? new Date(body.paid_at) : new Date();
      if (Number.isNaN(paidAt.getTime())) {
        return NextResponse.json({ ok: false, message: "Data de pagamento inválida." }, { status: 400 });
      }
      patch.paid_at = paidAt.toISOString();
      if (typeof body.payment_method === "string" && body.payment_method.trim() && body.payment_method.length <= 30) {
        patch.payment_method = body.payment_method.trim();
      }
    } else {
      patch.paid_at = null;
    }

    const { data, error } = await supabaseAdmin
      .from("orders")
      .update(patch)
      .eq("id", id)
      .select("id,is_paid,paid_at,payment_method")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    console.log(`[manual-payment] pedido ${id} -> is_paid=${body.is_paid}`);
    return NextResponse.json({ ok: true, order: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao registrar baixa manual.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
