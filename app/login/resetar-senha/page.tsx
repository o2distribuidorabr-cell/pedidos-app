"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { Card, PageHeader, Input, Button } from "@/app/components/ui";

export default function ResetarSenhaPage() {
  const router = useRouter();

  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [recoveryOk, setRecoveryOk] = useState(false);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    async function checkRecoverySession() {
      setChecking(true);
      setMsg("");

      try {
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
        const type = hashParams.get("type");
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (type === "recovery" && accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            if (mounted) {
              setRecoveryOk(false);
              setMsg("Link inválido ou expirado. Solicite uma nova redefinição de senha.");
            }
            return;
          }

          if (mounted) {
            setRecoveryOk(true);
          }
          return;
        }

        const { data, error } = await supabase.auth.getSession();

        if (error) {
          if (mounted) {
            setRecoveryOk(false);
            setMsg("Não foi possível validar o link de recuperação.");
          }
          return;
        }

        if (data.session) {
          if (mounted) {
            setRecoveryOk(true);
          }
          return;
        }

        if (mounted) {
          setRecoveryOk(false);
          setMsg("Link inválido ou expirado. Solicite uma nova redefinição de senha.");
        }
      } catch (e: any) {
        if (mounted) {
          setRecoveryOk(false);
          setMsg(String(e?.message ?? e ?? "Erro ao validar recuperação de senha."));
        }
      } finally {
        if (mounted) {
          setChecking(false);
        }
      }
    }

    checkRecoverySession();

    return () => {
      mounted = false;
    };
  }, []);

  async function onSubmit() {
    setMsg("");

    if (!recoveryOk) {
      setMsg("Link inválido ou expirado. Solicite uma nova redefinição de senha.");
      return;
    }

    if (!senha || senha.length < 6) {
      setMsg("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (senha !== confirmar) {
      setMsg("As senhas não conferem.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: senha });

      if (error) {
        setMsg(error.message);
        return;
      }

      setMsg("Senha atualizada com sucesso. Redirecionando para o login...");

      setTimeout(async () => {
        await supabase.auth.signOut();
        router.push("/login");
      }, 1200);
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-4 grid place-items-center bg-[radial-gradient(1200px_600px_at_20%_10%,rgba(0,0,0,0.06),transparent_60%),#f6f7fb]">
      <div className="w-full max-w-xl space-y-4">
        <PageHeader title="Resetar senha" subtitle="Defina uma nova senha" />

        <Card title="Nova senha">
          {msg ? (
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {msg}
            </div>
          ) : null}

          {checking ? (
            <div className="text-sm text-slate-600">Validando link de recuperação...</div>
          ) : recoveryOk ? (
            <div className="grid gap-3">
              <Input
                label="Nova senha"
                type="password"
                value={senha}
                onChange={setSenha}
                placeholder="Mínimo 6 caracteres"
              />

              <Input
                label="Confirmar senha"
                type="password"
                value={confirmar}
                onChange={setConfirmar}
                placeholder="Repita a senha"
              />

              <div className="flex gap-2">
                <Button onClick={onSubmit} disabled={loading}>
                  {loading ? "Salvando..." : "Salvar"}
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
          ) : (
            <div className="grid gap-3">
              <div className="text-sm text-slate-600">
                Para redefinir sua senha, solicite um novo link de recuperação.
              </div>

              <div className="flex gap-2">
                <Button onClick={() => router.push("/login/esqueci-senha")}>
                  Solicitar novo link
                </Button>

                <Button variant="secondary" onClick={() => router.push("/login")}>
                  Voltar ao login
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}