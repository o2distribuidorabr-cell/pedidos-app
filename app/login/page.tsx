"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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

  // ✅ garante que o TopNav saiba qual portal mostrar
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

    // ✅ define portal pelo role real (não depende do clique)
    if ((p.role ?? "") === "admin") {
      setPortalMode("admin");
      router.push("/adm/pedidos");
      return;
    }

    // franqueado
    setPortalMode("franchisee");

    if (!p.approved) {
      setMsg("Cadastro recebido. Aguarde a aprovação da franqueadora para acessar.");
      await supabase.auth.signOut();
      return;
    }

    if (!p.store_id) {
      setMsg("Você foi aprovado, mas ainda não tem loja vinculada. Fale com a franqueadora.");
      await supabase.auth.signOut();
      return;
    }

    router.push("/pedidos");
  }

  async function onLogin() {
    setMsg("");
    setWorking(true);

    // ✅ também grava pelo tab selecionado (ajuda o TopNav na hora)
    setPortalMode(tab === "admin" ? "admin" : "franchisee");

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

    // validações simples
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

    // 1) cria usuário no Auth
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

    // 2) garante profiles (pending) para esse usuário
    const { error: pErr } = await supabase.from("profiles").upsert(
      {
        id: userId,
        role: "pending",
        approved: false,
        store_id: null,
      },
      { onConflict: "id" }
    );

    if (pErr) {
      setWorking(false);
      setMsg(pErr.message);
      await supabase.auth.signOut();
      return;
    }

    // 3) cria a solicitação (para aparecer no /adm/cadastros)
    // ✅ se já existir para esse user_id, atualiza (evita erro de "duplicate key")
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
    setMsg("Cadastro enviado. Aguarde a aprovação da franqueadora para acessar.");

    // evita ficar logado antes da aprovação
    await supabase.auth.signOut();
    setShowSignup(false);

    // limpa campos
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

  if (loading) {
    return (
      <main style={styles.main}>
        <div style={styles.card}>Carregando...</div>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.tabs}>
          <button
            onClick={() => {
              setTab("franchisee");
              setPortalMode("franchisee"); // ✅ aqui
              setShowSignup(false);
              setMsg("");
            }}
            style={{ ...styles.tab, ...(tab === "franchisee" ? styles.tabActive : {}) }}
          >
            Franqueado
          </button>
          <button
            onClick={() => {
              setTab("admin");
              setPortalMode("admin"); // ✅ aqui
              setShowSignup(false);
              setMsg("");
            }}
            style={{ ...styles.tab, ...(tab === "admin" ? styles.tabActive : {}) }}
          >
            Portal administrativo
          </button>
        </div>

        <h1 style={{ margin: "12px 0 0", fontSize: 22 }}>
          {tab === "admin" ? "Acesso administrativo" : "Acesso do franqueado"}
        </h1>
        <p style={{ marginTop: 6, color: "#555" }}>
          {tab === "admin"
            ? "Entre com seu email e senha de administrador."
            : "Entre com seu email e senha. Se ainda não tiver cadastro, solicite acesso."}
        </p>

        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <label style={styles.label}>Email</label>
          <input
            style={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seuemail@..."
            inputMode="email"
            autoCapitalize="none"
          />

          <label style={styles.label}>Senha</label>
          <input
            style={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="********"
          />

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
            <button style={styles.primaryBtn} onClick={onLogin} disabled={working}>
              {working ? "Aguarde..." : "Entrar"}
            </button>

            {tab === "franchisee" ? (
              <button style={styles.secondaryBtn} onClick={() => setShowSignup((v) => !v)} disabled={working}>
                {showSignup ? "Fechar cadastro" : "Solicitar cadastro"}
              </button>
            ) : null}
          </div>

          {showSignup && tab === "franchisee" ? (
            <div style={styles.signupBox}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Solicitação de cadastro</div>

              <div style={styles.grid2}>
                <div>
                  <label style={styles.label}>Seu nome</label>
                  <input
                    style={styles.input}
                    value={signup.franchisee_name}
                    onChange={(e) => setSignup((p) => ({ ...p, franchisee_name: e.target.value }))}
                    placeholder="Nome do responsável"
                  />
                </div>

                <div>
                  <label style={styles.label}>Telefone (opcional)</label>
                  <input
                    style={styles.input}
                    value={signup.phone}
                    onChange={(e) => setSignup((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="(xx) xxxxx-xxxx"
                  />
                </div>
              </div>

              <div style={styles.grid2}>
                <div>
                  <label style={styles.label}>Nome da loja</label>
                  <input
                    style={styles.input}
                    value={signup.store_name}
                    onChange={(e) => setSignup((p) => ({ ...p, store_name: e.target.value }))}
                    placeholder="Ex.: Loja Centerminas"
                  />
                </div>

                <div>
                  <label style={styles.label}>CNPJ (opcional)</label>
                  <input
                    style={styles.input}
                    value={signup.cnpj}
                    onChange={(e) => setSignup((p) => ({ ...p, cnpj: e.target.value }))}
                    placeholder="00.000.000/0000-00"
                  />
                </div>
              </div>

              <div style={styles.grid2}>
                <div>
                  <label style={styles.label}>Cidade (opcional)</label>
                  <input
                    style={styles.input}
                    value={signup.city}
                    onChange={(e) => setSignup((p) => ({ ...p, city: e.target.value }))}
                    placeholder="Belo Horizonte"
                  />
                </div>

                <div>
                  <label style={styles.label}>UF (opcional)</label>
                  <input
                    style={styles.input}
                    value={signup.state}
                    onChange={(e) => setSignup((p) => ({ ...p, state: e.target.value }))}
                    placeholder="MG"
                    maxLength={2}
                  />
                </div>
              </div>

              <button style={styles.primaryBtn} onClick={onCreateAccount} disabled={working}>
                {working ? "Enviando..." : "Criar conta e enviar solicitação"}
              </button>

              <div style={{ marginTop: 8, fontSize: 12, color: "#777" }}>
                Após enviar, o acesso só é liberado quando o administrador aprovar e vincular a loja.
              </div>
            </div>
          ) : null}

          {msg ? <div style={styles.msgBox}>{msg}</div> : null}
        </div>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight: "100vh", background: "#f6f7fb", padding: 16, display: "grid", placeItems: "center" },
  card: {
    background: "#fff",
    border: "1px solid #e6e7ee",
    borderRadius: 14,
    padding: 16,
    boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
    width: "min(620px, 100%)",
  },
  tabs: {
    display: "flex",
    gap: 8,
    padding: 6,
    borderRadius: 12,
    border: "1px solid #eee",
    background: "#fafbff",
  },
  tab: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid transparent",
    background: "transparent",
    cursor: "pointer",
    fontWeight: 900,
    color: "#111",
  },
  tabActive: {
    background: "#111",
    color: "#fff",
    borderColor: "#111",
  },
  label: { fontSize: 12, color: "#666", fontWeight: 900 },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    outline: "none",
    fontSize: 14,
    background: "white",
  },
  primaryBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 900,
    width: "fit-content",
  },
  secondaryBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 900,
  },
  msgBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#fafbff",
    color: "#111",
    fontSize: 13,
    lineHeight: 1.35,
  },
  signupBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    border: "1px solid #e5e7eb",
    background: "white",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 10,
    marginBottom: 10,
    marginTop: 10,
  },
};