"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";

import { PageHeader, Card, Input, Badge, StatCard } from "@/app/components/ui";

function PrimaryActionButton({
  children,
  onClick,
  disabled,
  fullWidth,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-11 items-center justify-center rounded-[18px] px-4 text-sm font-semibold text-white transition",
        "bg-cyan-600 shadow-[0_14px_34px_rgba(8,145,178,0.22)] hover:bg-cyan-700",
        "disabled:cursor-not-allowed disabled:opacity-50",
        fullWidth ? "w-full" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SecondaryActionButton({
  children,
  onClick,
  disabled,
  fullWidth,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-11 items-center justify-center rounded-[18px] px-4 text-sm font-semibold transition",
        "border border-slate-200 bg-white text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] hover:bg-slate-50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        fullWidth ? "w-full" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <div className="text-sm text-slate-600">{text}</div>
    </div>
  );
}

export default function AdmUsuariosPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [mensagem, setMensagem] = useState<string>("");
  const [tone, setTone] = useState<"green" | "red" | "slate">("slate");

  async function bootstrap() {
    const ok = await requireAdminOrRedirect(router);
    if (!ok) return;
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function criarUsuario() {
    setWorking(true);
    setMensagem("Criando usuário...");
    setTone("slate");

    try {
      const ok = await requireAdminOrRedirect(router);
      if (!ok) {
        setWorking(false);
        return;
      }

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
      setMensagem("Usuário criado com sucesso.");
      setEmail("");
      setSenha("");
      setNome("");
      setWorking(false);
    } catch {
      setTone("red");
      setMensagem("Erro ao conectar com o servidor.");
      setWorking(false);
    }
  }

  const canSubmit =
    nome.trim().length > 0 &&
    email.trim().length > 0 &&
    senha.length > 0 &&
    !working;

  const summary = useMemo(
    () => ({
      nomeOk: nome.trim().length > 0 ? "OK" : "Pendente",
      emailOk: email.trim().length > 0 ? "OK" : "Pendente",
      senhaOk: senha.length > 0 ? "OK" : "Pendente",
      endpoint: "/.netlify/functions/create-user",
    }),
    [nome, email, senha]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuários"
        subtitle="Crie um novo administrador pela função do Netlify."
        right={
          <div className="flex flex-wrap gap-2">
            <SecondaryActionButton onClick={() => router.push("/adm/pedidos")}>
              Pedidos
            </SecondaryActionButton>
            <SecondaryActionButton onClick={() => router.push("/adm/lojas")}>
              Lojas
            </SecondaryActionButton>
          </div>
        }
      />

      {mensagem ? (
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={tone}>
              {tone === "green" ? "OK" : tone === "red" ? "ERRO" : "INFO"}
            </Badge>
            <div
              className={`text-sm ${
                tone === "red"
                  ? "text-red-600"
                  : tone === "green"
                  ? "text-green-700"
                  : "text-slate-700"
              }`}
            >
              {mensagem}
            </div>
          </div>
        </Card>
      ) : null}

      <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-5 shadow-sm md:p-6">
        <SectionTitle
          title="Visão geral"
          subtitle="Validação rápida antes de criar o administrador"
        />

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Nome" value={summary.nomeOk} />
          <StatCard label="Email" value={summary.emailOk} />
          <StatCard label="Senha" value={summary.senhaOk} />
          <StatCard label="Endpoint" value={<span className="text-sm">{summary.endpoint}</span>} />
        </div>
      </div>

      {loading ? <EmptyState text="Carregando permissões..." /> : null}

      {!loading ? (
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <SectionTitle
              title="Criar novo administrador"
              subtitle="Informe os dados do usuário que terá acesso administrativo"
            />

            <div className="mt-6 grid gap-4 max-w-xl">
              <Input
                label="Nome"
                placeholder="Nome do administrador"
                value={nome}
                onChange={setNome}
              />

              <Input
                label="Email"
                placeholder="email@dominio.com"
                value={email}
                onChange={setEmail}
              />

              <Input
                label="Senha"
                placeholder="Senha"
                value={senha}
                onChange={setSenha}
                type="password"
              />

              <div className="grid gap-2 pt-2 sm:grid-cols-2">
                <SecondaryActionButton
                  onClick={() => {
                    setNome("");
                    setEmail("");
                    setSenha("");
                    setMensagem("");
                    setTone("slate");
                  }}
                  disabled={working}
                  fullWidth
                >
                  Limpar
                </SecondaryActionButton>

                <PrimaryActionButton
                  onClick={criarUsuario}
                  disabled={!canSubmit}
                  fullWidth
                >
                  {working ? "Criando..." : "Criar administrador"}
                </PrimaryActionButton>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <SectionTitle
              title="Orientações"
              subtitle="Como esta tela funciona"
            />

            <div className="mt-6 rounded-[22px] border border-slate-200 bg-slate-50 p-4">
              <div className="space-y-3 text-sm text-slate-700">
                <div>
                  Esta tela chama a função{" "}
                  <span className="font-mono text-slate-900">
                    /.netlify/functions/create-user
                  </span>
                  .
                </div>
                <div>
                  O token da sessão atual é enviado no header{" "}
                  <span className="font-mono text-slate-900">Authorization: Bearer</span>.
                </div>
                <div>
                  O usuário precisa estar logado e validado como administrador.
                </div>
                <div>
                  Após sucesso, os campos são limpos automaticamente.
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[22px] border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">
                Dados que serão enviados
              </div>

              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-slate-500">Nome</span>
                  <span className="text-right font-semibold text-slate-900 break-all">
                    {nome || "—"}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <span className="text-slate-500">Email</span>
                  <span className="text-right font-semibold text-slate-900 break-all">
                    {email || "—"}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <span className="text-slate-500">Senha</span>
                  <span className="text-right font-semibold text-slate-900">
                    {senha ? "Preenchida" : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}