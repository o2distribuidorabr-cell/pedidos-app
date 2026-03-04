"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Card, PageHeader, Input, Button } from "@/app/components/ui";

export default function EsqueciSenhaPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function onSubmit() {
    setMsg("");

    const emailLimpo = email.trim();

    if (!emailLimpo) {
      setMsg("Informe seu e-mail.");
      return;
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.trim() || window.location.origin;

    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailLimpo, {
        redirectTo: `${siteUrl}/login/resetar-senha`,
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      setMsg(
        "Se existir uma conta com esse e-mail, enviamos um link para redefinição de senha. Verifique sua caixa de entrada e também o spam."
      );
    } catch (e: any) {
      setMsg(String(e?.message ?? e ?? "Erro ao enviar link de recuperação."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-4 grid place-items-center bg-[radial-gradient(1200px_600px_at_20%_10%,rgba(0,0,0,0.06),transparent_60%),#f6f7fb]">
      <div className="w-full max-w-xl space-y-4">
        <PageHeader
          title="Esqueci minha senha"
          subtitle="Informe seu e-mail para receber o link de redefinição"
        />

        <Card title="Recuperar acesso">
          {msg ? (
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {msg}
            </div>
          ) : null}

          <div className="grid gap-3">
            <Input
              label="E-mail"
              value={email}
              onChange={setEmail}
              placeholder="seuemail@..."
              inputMode="email"
              autoCapitalize="none"
            />

            <div className="flex gap-2">
              <Button onClick={onSubmit} disabled={loading}>
                {loading ? "Enviando..." : "Enviar link"}
              </Button>

              <Button
                variant="secondary"
                onClick={() => router.push("/login")}
                disabled={loading}
              >
                Voltar
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}