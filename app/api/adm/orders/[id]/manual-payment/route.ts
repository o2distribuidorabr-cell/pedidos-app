import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Baixa manual de pagamento (marcar pago / marcar como não pago) protegida por senha.
 *
 * A senha pedida é a do próprio login do admin que está logado: o servidor
 * confere e-mail + senha no Supabase Auth. Não existe senha extra para criar
 * e o log mostra quem fez a baixa.
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type AdminUser = { id: string; email: string };

async function getAdminUser(request: Request): Promise<AdminUser | null> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user || !data.user.email) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role, approved, is_admin")
    .eq("id", data.user.id)
    .maybeSingle();

  const p = profile as { role?: string | null; approved?: boolean | null; is_admin?: boolean | null } | null;
  const isAdmin = !!p && (p.is_admin === true || (p.role === "admin" && p.approved === true));
  return isAdmin ? { id: data.user.id, email: data.user.email } : null;
}

/** Confere a senha de login sem mexer na sessão de ninguém (cliente descartável). */
async function loginPasswordMatches(email: string, password: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase não configurado.");

  const checker = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await checker.auth.signInWithPassword({ email, password });
  return !error && !!data.session;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, message: "Pedido inválido." }, { status: 400 });
    }

    const admin = await getAdminUser(request);
    if (!admin) {
      return NextResponse.json({ ok: false, message: "Acesso negado." }, { status: 403 });
    }

    const body = (await request.json()) as Body;

    if (typeof body.password !== "string" || !body.password || !(await loginPasswordMatches(admin.email, body.password))) {
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

    console.log(`[manual-payment] pedido ${id} -> is_paid=${body.is_paid} por ${admin.email}`);
    return NextResponse.json({ ok: true, order: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao registrar baixa manual.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
