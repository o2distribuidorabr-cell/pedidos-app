"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { Card, Button, Input, Badge } from "@/app/components/ui";

type ProfileRow = {
  id: string;
  role: string | null; // admin | franchisee | pending
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

export default function LoginPage() {
  const router = useRouter();

  const [tab, setTab] = useState<"franchisee" | "admin">("franchisee");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
    setSignup({
      franchisee_name: "",
      phone: "",
      store_name: "",
      cnpj: "",
      city: "",
      state: "",
    });
  }

  const headerTitle = useMemo(
    () => (isAdmin ? "Acesso administrativo" : "Portal do cliente"),
    [isAdmin]
  );

  const headerSubtitle = useMemo(
    () =>
      isAdmin
        ? "Entre com seu email e senha de administrador."
        : "Entre com seu email e senha. Se ainda não tiver acesso, solicite cadastro.",
    [isAdmin]
  );

  if (loading) {
    return (
      <main className="min-h-screen p-4 grid place-items-center bg-[radial-gradient(1200px_600px_at_20%_10%,rgba(0,0,0,0.06),transparent_60%),#f6f7fb]">
        <div className="w-full max-w-xl">
          <Card>
            <div className="text-sm text-slate-700">Carregando...</div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 grid place-items-center bg-[radial-gradient(1200px_600px_at_20%_10%,rgba(0,0,0,0.06),transparent_60%),#f6f7fb]">
      <div className="w-full max-w-2xl space-y-4">
        <Card>
          {/* Header (logo + textos) */}
          <div className="grid gap-4 md:grid-cols-[140px_1fr] md:items-center">
            <div className="relative h-16 w-[140px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <Image
                src="/logo.png"
                alt="Logo"
                fill
                sizes="140px"
                style={{ objectFit: "contain" }}
                priority
              />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-xl font-semibold text-slate-900">{headerTitle}</div>
                <Badge tone={isAdmin ? "red" : "green"}>{isAdmin ? "ADMIN" : "CLIENTE"}</Badge>
              </div>
              <div className="mt-1 text-sm text-slate-600">{headerSubtitle}</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-4 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
            <Button
              variant={tab === "franchisee" ? "primary" : "secondary"}
              onClick={() => {
                setTab("franchisee");
                setPortalMode("franchisee");
                setShowSignup(false);
                setMsg("");
              }}
              disabled={working}
            >
              Cliente
            </Button>

            <Button
              variant={tab === "admin" ? "primary" : "secondary"}
              onClick={() => {
                setTab("admin");
                setPortalMode("admin");
                setShowSignup(false);
                setMsg("");
              }}
              disabled={working}
            >
              Administrativo
            </Button>
          </div>

          {/* Form */}
          <div className="mt-4 grid gap-3">
            <Input
              label="Email"
              value={email}
              onChange={setEmail}
              placeholder="seuemail@..."
              inputMode="email"
              autoCapitalize="none"
            />

            <Input
              label="Senha"
              value={password}
              onChange={setPassword}
              placeholder="********"
              type="password"
            />

            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={onLogin} disabled={working}>
                {working ? "Aguarde..." : "Entrar"}
              </Button>

              {!isAdmin ? (
                <Button
                  variant="secondary"
                  onClick={() => setShowSignup((v) => !v)}
                  disabled={working}
                >
                  {showSignup ? "Fechar cadastro" : "Solicitar cadastro"}
                </Button>
              ) : null}
            </div>

            {/* Signup */}
            {showSignup && !isAdmin ? (
              <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">Solicitação de cadastro</div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Seu nome"
                    value={signup.franchisee_name}
                    onChange={(v) => setSignup((p) => ({ ...p, franchisee_name: v }))}
                    placeholder="Nome do responsável"
                  />
                  <Input
                    label="Telefone (opcional)"
                    value={signup.phone}
                    onChange={(v) => setSignup((p) => ({ ...p, phone: v }))}
                    placeholder="(xx) xxxxx-xxxx"
                  />
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Nome da loja"
                    value={signup.store_name}
                    onChange={(v) => setSignup((p) => ({ ...p, store_name: v }))}
                    placeholder="Ex.: Loja Centerminas"
                  />
                  <Input
                    label="CNPJ (opcional)"
                    value={signup.cnpj}
                    onChange={(v) => setSignup((p) => ({ ...p, cnpj: v }))}
                    placeholder="00.000.000/0000-00"
                  />
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Cidade (opcional)"
                    value={signup.city}
                    onChange={(v) => setSignup((p) => ({ ...p, city: v }))}
                    placeholder="Belo Horizonte"
                  />
                  <Input
                    label="UF (opcional)"
                    value={signup.state}
                    onChange={(v) =>
                      setSignup((p) => ({ ...p, state: (v || "").toUpperCase() }))
                    }
                    placeholder="MG"
                    maxLength={2}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-slate-500">
                    Após enviar, o acesso só é liberado quando o administrador aprovar e vincular a loja.
                  </div>

                  <Button onClick={onCreateAccount} disabled={working}>
                    {working ? "Enviando..." : "Criar conta e enviar solicitação"}
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Msg */}
            {msg ? (
              <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm text-slate-800 whitespace-pre-wrap">{msg}</div>
              </div>
            ) : null}

            <div className="pt-2 text-center text-xs text-slate-500">
              © {new Date().getFullYear()} • Portal do cliente
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}