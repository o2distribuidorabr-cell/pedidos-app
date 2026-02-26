"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import PortalShell from "@/app/components/PortalShell";
import { Card, PageHeader, Input, Button } from "@/app/components/ui";

export default function ResetarSenhaPage() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function onSubmit() {
    setMsg("");

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
      setMsg("Senha atualizada com sucesso.");
      setTimeout(() => router.push("/login"), 800);
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PortalShell title="Resetar senha" subtitle="Defina uma nova senha">
      <div className="space-y-4">
        <PageHeader title="Resetar senha" subtitle="Defina uma nova senha" />

        <Card title="Nova senha">
          {msg ? (
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {msg}
            </div>
          ) : null}

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
              <Button variant="secondary" onClick={() => router.push("/login")} disabled={loading}>
                Voltar
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </PortalShell>
  );
}