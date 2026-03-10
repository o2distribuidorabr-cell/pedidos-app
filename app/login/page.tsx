"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Card, Badge } from "@/app/components/ui";

type ProfileRow = {
  id: string;
  role: string | null;
  approved: boolean | null;
  store_id: string | null;
};

type SignupRequest = {
  franchisee_name: string;
  phone: string;
  store_name: string;
  cnpj: string;
  city: string;
  state: string;
};

function onlyDigits(v: string) {
  return (v || "").replace(/\D/g, "");
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  autoCapitalize,
  maxLength,
  rightSlot,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoCapitalize?: string;
  maxLength?: number;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-[13px] font-semibold text-slate-700">{label}</label>

      <div className="relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type={type}
          inputMode={inputMode}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
          className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
        />
        {rightSlot ? (
          <div className="absolute inset-y-0 right-0 flex w-12 items-center justify-center">
            {rightSlot}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-cyan-600 px-4 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(8,145,178,0.28)] transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function AccessTabs({
  value,
  onChange,
  disabled,
}: {
  value: "franchisee" | "admin";
  onChange: (value: "franchisee" | "admin") => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-100/90 p-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("franchisee")}
          className={[
            "h-11 rounded-[16px] text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
            value === "franchisee"
              ? "bg-white text-slate-900 shadow-[0_8px_20px_rgba(15,23,42,0.08)] ring-1 ring-slate-200"
              : "text-slate-600 hover:text-slate-900",
          ].join(" ")}
        >
          Cliente
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("admin")}
          className={[
            "h-11 rounded-[16px] text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
            value === "admin"
              ? "bg-white text-slate-900 shadow-[0_8px_20px_rgba(15,23,42,0.08)] ring-1 ring-slate-200"
              : "text-slate-600 hover:text-slate-900",
          ].join(" ")}
        >
          Administrativo
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();

  const [tab, setTab] = useState<"franchisee" | "admin">("franchisee");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [showSignup, setShowSignup] = useState(false);
  const [signup, setSignup] = useState<SignupRequest>({
    franchisee_name: "",
    phone: "",
    store_name: "",
    cnpj: "",
    city: "",
    state: "",
  });

  const isAdmin = tab === "admin";

  function setPortalMode(mode: "admin" | "franchisee") {
    try {
      localStorage.setItem("portal_mode", mode);
    } catch {}
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        await routeByProfile(data.user.id);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function routeByProfile(userId: string) {
    setMsg("");

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, role, approved, store_id")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      setMsg(error.message);
      return;
    }

    const p = (profile ?? null) as ProfileRow | null;

    if (!p) {
      setMsg("Perfil não encontrado. Tente sair e entrar novamente.");
      return;
    }

    if ((p.role ?? "") === "admin") {
      setPortalMode("admin");
      router.push("/adm/pedidos");
      return;
    }

    setPortalMode("franchisee");

    if (!p.approved) {
      setMsg("Cadastro recebido. Aguarde a aprovação para acessar.");
      await supabase.auth.signOut();
      return;
    }

    if (!p.store_id) {
      setMsg("Você foi aprovado, mas ainda não tem loja vinculada. Fale com o administrador.");
      await supabase.auth.signOut();
      return;
    }

    router.push("/pedidos");
  }

  async function onLogin() {
    setMsg("");
    setWorking(true);

    setPortalMode(isAdmin ? "admin" : "franchisee");

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error || !data.user) {
      setWorking(false);
      setMsg(error?.message || "Erro ao entrar.");
      return;
    }

    await routeByProfile(data.user.id);
    setWorking(false);
  }

  async function onCreateAccount() {
    setMsg("");
    setWorking(true);

    if (!email.trim() || !password) {
      setWorking(false);
      setMsg("Preencha email e senha.");
      return;
    }

    if (!signup.franchisee_name.trim()) {
      setWorking(false);
      setMsg("Preencha seu nome.");
      return;
    }

    if (!signup.store_name.trim()) {
      setWorking(false);
      setMsg("Preencha o nome da loja.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      setWorking(false);
      setMsg(error.message);
      return;
    }

    const userId = data?.user?.id;
    if (!userId) {
      setWorking(false);
      setMsg("Usuário criado, mas não consegui obter o ID. Tente entrar novamente.");
      return;
    }

    const { error: pErr } = await supabase.from("profiles").upsert(
      { id: userId, role: "pending", approved: false, store_id: null },
      { onConflict: "id" }
    );

    if (pErr) {
      setWorking(false);
      setMsg(pErr.message);
      await supabase.auth.signOut();
      return;
    }

    const { error: reqErr } = await supabase.from("signup_requests").upsert(
      {
        user_id: userId,
        email: email.trim(),
        franchisee_name: signup.franchisee_name.trim(),
        phone: signup.phone.trim() || null,
        store_name: signup.store_name.trim(),
        cnpj: onlyDigits(signup.cnpj) || null,
        city: signup.city.trim() || null,
        state: signup.state.trim() || null,
        status: "pending",
      },
      { onConflict: "user_id" }
    );

    if (reqErr) {
      setWorking(false);
      setMsg(reqErr.message);
      await supabase.auth.signOut();
      return;
    }

    setWorking(false);
    setMsg("Solicitação enviada. Aguarde a aprovação para acessar.");

    await supabase.auth.signOut();
    setShowSignup(false);
    setPassword("");
    setShowPassword(false);
    setSignup({
      franchisee_name: "",
      phone: "",
      store_name: "",
      cnpj: "",
      city: "",
      state: "",
    });
  }

  const title = useMemo(
    () => (isAdmin ? "Acesso administrativo" : "Portal do cliente"),
    [isAdmin]
  );

  const subtitle = useMemo(
    () =>
      isAdmin
        ? "Entre com seu email e senha para acessar a área administrativa."
        : "Entre com seu email e senha para acessar pedidos, financeiro e extrato.",
    [isAdmin]
  );

  if (loading) {
    return (
      <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fbfd_0%,#eef7fb_100%)]">
        <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-10">
          <Card className="w-full max-w-md rounded-[34px] border border-white/90 bg-white/95 shadow-[0_30px_90px_rgba(15,23,42,0.08)]">
            <div className="text-sm text-slate-600">Carregando...</div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f8fbfd_0%,#eef7fb_100%)]">
      <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-10 px-5 py-8 lg:grid-cols-[1fr_560px] lg:px-10">
        <div className="pointer-events-none absolute left-[-110px] top-[-110px] h-[260px] w-[260px] rounded-full bg-cyan-200/35 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-90px] right-[-70px] h-[240px] w-[240px] rounded-full bg-sky-200/35 blur-3xl" />

        <section className="relative flex justify-center lg:justify-start">
          <div className="w-full max-w-[520px]">
            <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
              <div className="relative h-32 w-64 rounded-[34px] border border-white/90 bg-white/95 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
                <Image
                  src="/logo.png"
                  alt="O2 Distribuidora"
                  fill
                  sizes="256px"
                  style={{ objectFit: "contain", padding: "14px 18px" }}
                  priority
                />
              </div>

              <div className="mt-10 inline-flex items-center rounded-full border border-cyan-100 bg-white/80 px-3 py-1 text-xs font-semibold text-cyan-700 shadow-sm">
                Plataforma O2 Distribuidora
              </div>

              <h1 className="mt-5 max-w-[480px] text-[42px] font-semibold leading-[1.02] tracking-[-0.04em] text-slate-900 md:text-[56px]">
                Portal O2 Distribuidora
              </h1>

              <p className="mt-5 max-w-[430px] text-[17px] leading-7 text-slate-600">
                Acesse pedidos, financeiro e extrato em um ambiente claro, rápido e organizado.
              </p>
            </div>
          </div>
        </section>

        <section className="relative">
          <div className="rounded-[36px] border border-white/90 bg-white/96 p-6 shadow-[0_34px_100px_rgba(15,23,42,0.12)] backdrop-blur md:p-8">
            <div className="space-y-6">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="text-[30px] font-semibold tracking-[-0.02em] text-slate-900">
                    {title}
                  </div>
                  <Badge tone={isAdmin ? "red" : "blue"}>
                    {isAdmin ? "ADMIN" : "CLIENTE"}
                  </Badge>
                </div>

                <div className="mt-2.5 text-sm leading-6 text-slate-600">{subtitle}</div>
              </div>

              <AccessTabs
                value={tab}
                disabled={working}
                onChange={(next) => {
                  setTab(next);
                  setPortalMode(next === "admin" ? "admin" : "franchisee");
                  setShowSignup(false);
                  setMsg("");
                }}
              />

              <div className="grid gap-4">
                <Field
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  placeholder="seuemail@empresa.com"
                  inputMode="email"
                  autoCapitalize="none"
                />

                <Field
                  label="Senha"
                  value={password}
                  onChange={setPassword}
                  placeholder="********"
                  type={showPassword ? "text" : "password"}
                  rightSlot={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="text-slate-500 transition hover:text-slate-800"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          className="h-5 w-5"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 3l18 18M10.584 10.587a2 2 0 102.829 2.828M9.878 5.092A10.45 10.45 0 0112 4.909c5.25 0 8.727 4.608 9.622 5.967a1.09 1.09 0 010 1.248 16.757 16.757 0 01-4.114 4.417M6.228 6.228C3.943 7.756 2.454 9.733 1.91 10.876a1.09 1.09 0 000 1.248C2.805 13.483 6.282 18.09 11.532 18.09c1.55 0 2.979-.401 4.278-1.02"
                          />
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          className="h-5 w-5"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  }
                />

                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="text-xs text-slate-500">
                    {isAdmin ? "Acesso interno." : "Acesso para clientes aprovados."}
                  </div>

                  <Link
                    href="/login/esqueci-senha"
                    className="text-sm font-medium text-cyan-700 transition hover:text-cyan-800 hover:underline"
                  >
                    Esqueci minha senha
                  </Link>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <PrimaryButton onClick={onLogin} disabled={working}>
                    {working ? "Aguarde..." : "Entrar"}
                  </PrimaryButton>

                  {!isAdmin ? (
                    <SecondaryButton
                      onClick={() => setShowSignup((v) => !v)}
                      disabled={working}
                    >
                      {showSignup ? "Fechar cadastro" : "Solicitar cadastro"}
                    </SecondaryButton>
                  ) : (
                    <div />
                  )}
                </div>
              </div>

              {showSignup && !isAdmin ? (
                <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-4 md:p-5">
                  <div className="mb-1 text-base font-semibold text-slate-900">
                    Solicitação de cadastro
                  </div>

                  <div className="text-sm text-slate-600">
                    Preencha os dados abaixo para envio da solicitação.
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Seu nome"
                      value={signup.franchisee_name}
                      onChange={(v) => setSignup((p) => ({ ...p, franchisee_name: v }))}
                      placeholder="Nome do responsável"
                    />

                    <Field
                      label="Telefone"
                      value={signup.phone}
                      onChange={(v) => setSignup((p) => ({ ...p, phone: v }))}
                      placeholder="(xx) xxxxx-xxxx"
                      inputMode="tel"
                    />

                    <Field
                      label="Nome da loja"
                      value={signup.store_name}
                      onChange={(v) => setSignup((p) => ({ ...p, store_name: v }))}
                      placeholder="Ex.: Loja Centerminas"
                    />

                    <Field
                      label="CNPJ"
                      value={signup.cnpj}
                      onChange={(v) => setSignup((p) => ({ ...p, cnpj: v }))}
                      placeholder="00.000.000/0000-00"
                      inputMode="numeric"
                    />

                    <Field
                      label="Cidade"
                      value={signup.city}
                      onChange={(v) => setSignup((p) => ({ ...p, city: v }))}
                      placeholder="Belo Horizonte"
                    />

                    <Field
                      label="UF"
                      value={signup.state}
                      onChange={(v) =>
                        setSignup((p) => ({ ...p, state: (v || "").toUpperCase() }))
                      }
                      placeholder="MG"
                      maxLength={2}
                    />
                  </div>

                  <div className="mt-4">
                    <Field
                      label="Senha"
                      value={password}
                      onChange={setPassword}
                      placeholder="********"
                      type={showPassword ? "text" : "password"}
                    />
                  </div>

                  <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="max-w-xl text-xs leading-5 text-slate-500">
                      O acesso será liberado após aprovação e vínculo da loja pelo administrador.
                    </div>

                    <PrimaryButton onClick={onCreateAccount} disabled={working}>
                      {working ? "Enviando..." : "Criar conta"}
                    </PrimaryButton>
                  </div>
                </div>
              ) : null}

              {msg ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="text-sm whitespace-pre-wrap text-amber-900">{msg}</div>
                </div>
              ) : null}

              <div className="border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
                © {new Date().getFullYear()} O2 Distribuidora
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}