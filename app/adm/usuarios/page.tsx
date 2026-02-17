"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";

import { PageHeader, Card, Button, Input, Badge } from "@/app/components/ui";

export default function AdmUsuariosPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");

  const [working, setWorking] = useState(false);
  const [mensagem, setMensagem] = useState<string>("");
  const [tone, setTone] = useState<"green" | "red" | "slate">("slate");

  async function criarUsuario() {
    setWorking(true);
    setMensagem("Criando usuário...");
    setTone("slate");

    try {
      // ✅ garante que está logado e é admin
      const ok = await requireAdminOrRedirect(router);
      if (!ok) {
        setWorking(false);
        return;
      }

      // ✅ pega token da sessão do Supabase e manda no Authorization
      const { data: sess, error: sErr } = await supabase.auth.getSession();
      if (sErr) {
        setTone("red");
        setMensagem("Erro ao obter sessão: " + sErr.message);
        setWorking(false);
        return;
      }

      const token = sess.session?.access_token;
      if (!token) {
        setTone("red");
        setMensagem("Sem token de sessão. Faça login novamente e tente de novo.");
        setWorking(false);
        return;
      }

      const res = await fetch("/.netlify/functions/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          password: senha,
          name: nome.trim(),
        }),
      });

      const data = await res.json().catch(() => ({} as any));

      if (!res.ok) {
        setTone("red");
        setMensagem("Erro: " + (data?.error || "falha desconhecida"));
        setWorking(false);
        return;
      }

      setTone("green");
      setMensagem("Usuário criado com sucesso!");
      setEmail("");
      setSenha("");
      setNome("");
      setWorking(false);
    } catch (err: any) {
      setTone("red");
      setMensagem("Erro ao conectar com servidor");
      setWorking(false);
    }
  }

  const canSubmit = nome.trim().length > 0 && email.trim().length > 0 && senha.length > 0 && !working;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuários"
        subtitle="Crie um novo administrador via função do Netlify."
        right={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => router.push("/adm/pedidos")}>
              Pedidos
            </Button>
            <Button variant="secondary" onClick={() => router.push("/adm/lojas")}>
              Lojas
            </Button>
          </div>
        }
      />

      {mensagem ? (
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={tone}>{tone === "green" ? "OK" : tone === "red" ? "ERRO" : "INFO"}</Badge>
            <div
              className={`text-sm ${
                tone === "red" ? "text-red-600" : tone === "green" ? "text-green-700" : "text-slate-700"
              }`}
            >
              {mensagem}
            </div>
          </div>
        </Card>
      ) : null}

      <Card title="Criar novo administrador">
        <div className="grid gap-3 max-w-lg">
          <Input label="Nome" placeholder="Nome" value={nome} onChange={setNome} />

          <Input label="Email" placeholder="email@dominio.com" value={email} onChange={setEmail} />

          <Input label="Senha" placeholder="Senha" value={senha} onChange={setSenha} type="password" />

          <div className="flex justify-end pt-1">
            <Button onClick={criarUsuario} disabled={!canSubmit}>
              {working ? "Criando..." : "Criar administrador"}
            </Button>
          </div>

          <div className="text-xs text-slate-500">
            Observação: esta tela chama <span className="font-mono">/.netlify/functions/create-user</span> com{" "}
            <span className="font-mono">Authorization: Bearer</span>.
          </div>
        </div>
      </Card>
    </div>
  );
}