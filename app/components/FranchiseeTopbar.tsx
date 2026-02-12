"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ProfileRow = { store_id: string | null };
type StoreRow = { id: string; name: string | null };
type CreditBalanceRow = { store_id: string; balance: number | null };

function money(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function FranchiseeTopbar() {
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(true);

  const [userEmail, setUserEmail] = useState("-");
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("-");
  const [creditBalance, setCreditBalance] = useState<number>(0);

  const isHistorico = useMemo(() => pathname?.startsWith("/pedidos"), [pathname]);
  const isFinanceiro = useMemo(() => pathname?.startsWith("/financeiro"), [pathname]);
  const isNovoPedido = useMemo(() => pathname?.startsWith("/pedido"), [pathname]);
  const isExtrato = useMemo(() => pathname?.startsWith("/extrato"), [pathname]);

  // fecha menu ao clicar fora e ao apertar ESC
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  async function loadHeaderData() {
    setLoading(true);

    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;

    if (!user) {
      router.push("/login");
      return;
    }

    setUserEmail(user.email ?? "-");

    // profile -> store_id
    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("store_id")
      .eq("id", user.id)
      .maybeSingle();

    if (pErr) {
      console.warn("FranchiseeTopbar profile:", pErr.message);
      setStoreId(null);
      setStoreName("-");
      setCreditBalance(0);
      setLoading(false);
      return;
    }

    const sId = (prof as ProfileRow | null)?.store_id ?? null;
    setStoreId(sId);

    if (!sId) {
      setStoreName("Sem loja vinculada");
      setCreditBalance(0);
      setLoading(false);
      return;
    }

    // store name
    const { data: st, error: sErr } = await supabase
      .from("stores")
      .select("id,name")
      .eq("id", sId)
      .maybeSingle();

    if (!sErr) {
      const row = (st as StoreRow | null) ?? null;
      setStoreName(row?.name ?? sId);
    } else {
      setStoreName(sId);
    }

    // credit balance
    const { data: bal, error: bErr } = await supabase
      .from("v_store_credit_balance")
      .select("store_id,balance")
      .eq("store_id", sId)
      .maybeSingle();

    if (!bErr) {
      const r = (bal as CreditBalanceRow | null) ?? null;
      setCreditBalance(Number(r?.balance ?? 0) || 0);
    } else {
      setCreditBalance(0);
    }

    setLoading(false);
  }

  // recarrega quando muda a rota (ex.: crédito/pedidos atualizados)
  useEffect(() => {
    loadHeaderData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  async function onLogout() {
    localStorage.removeItem("portal_mode");
    await supabase.auth.signOut();
    router.push("/login");
  }

  function go(path: string) {
    setOpen(false);
    router.push(path);
  }

  return (
    <>
      <div style={styles.wrap}>
        <div style={styles.inner}>
          {/* ESQUERDA */}
          <div style={styles.left}>
            <div ref={menuRef} style={{ position: "relative" }}>
              <button style={styles.menuBtn} onClick={() => setOpen((v) => !v)}>
                Menu ▾
              </button>

              {open ? (
                <div style={styles.menuPanel} role="menu">
                  <button
                    style={{ ...styles.menuItemBtn, ...(isNovoPedido ? styles.menuItemActive : {}) }}
                    onClick={() => go("/pedido")}
                    role="menuitem"
                  >
                    Novo pedido
                  </button>

                  <button
                    style={{ ...styles.menuItemBtn, ...(isHistorico ? styles.menuItemActive : {}) }}
                    onClick={() => go("/pedidos")}
                    role="menuitem"
                  >
                    Pedidos (Histórico)
                  </button>

                  <button
                    style={{ ...styles.menuItemBtn, ...(isFinanceiro ? styles.menuItemActive : {}) }}
                    onClick={() => go("/financeiro")}
                    role="menuitem"
                  >
                    Financeiro
                  </button>

                  {/* NOVO: Extrato */}
                  <button
                    style={{ ...styles.menuItemBtn, ...(isExtrato ? styles.menuItemActive : {}) }}
                    onClick={() => go("/extrato")}
                    role="menuitem"
                  >
                    Extrato
                  </button>

                  <div style={styles.menuDivider} />

                  <button style={styles.menuItemDanger} onClick={onLogout} role="menuitem">
                    Sair
                  </button>
                </div>
              ) : null}
            </div>

            <div style={{ fontWeight: 900, color: "#111" }}>Franqueado</div>
          </div>

          {/* DIREITA */}
          <div style={styles.right}>
            <div style={styles.meta}>
              <div style={styles.metaBlock}>
                <div style={styles.metaLabel}>Usuário</div>
                <div style={styles.metaValue}>{loading ? "..." : userEmail}</div>
              </div>

              <div style={styles.metaBlock}>
                <div style={styles.metaLabel}>Loja</div>
                <div style={styles.metaValue}>{loading ? "..." : storeName}</div>
              </div>

              <div style={styles.metaBlock}>
                <div style={styles.metaLabel}>Crédito</div>
                <div style={styles.metaValue}>{loading ? "..." : money(creditBalance)}</div>
              </div>

              <div style={styles.metaBlock}>
                <div style={styles.metaLabel}>Portal</div>
                <div style={styles.metaValue}>Franqueado</div>
              </div>
            </div>

            {/* Botões rápidos */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                style={{ ...styles.quickBtn, ...(isNovoPedido ? styles.quickBtnActive : {}) }}
                onClick={() => go("/pedido")}
              >
                + Novo pedido
              </button>

              <button
                style={{ ...styles.quickBtn, ...(isHistorico ? styles.quickBtnActive : {}) }}
                onClick={() => go("/pedidos")}
              >
                Histórico
              </button>

              <button
                style={{ ...styles.quickBtn, ...(isFinanceiro ? styles.quickBtnActive : {}) }}
                onClick={() => go("/financeiro")}
              >
                Financeiro
              </button>

              {/* NOVO: Extrato */}
              <button
                style={{ ...styles.quickBtn, ...(isExtrato ? styles.quickBtnActive : {}) }}
                onClick={() => go("/extrato")}
              >
                Extrato
              </button>

              <button onClick={onLogout} style={styles.logout}>
                Sair
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Espaço para não tapar conteúdo */}
      <div style={{ height: 74 }} />
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: "sticky",
    top: 0,
    zIndex: 50,
    background: "#f6f7fb",
    padding: 12,
    borderBottom: "1px solid #e6e7ee",
  },
  inner: {
    width: "min(1300px, 100%)",
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    gap: 12,
    justifyContent: "space-between",
  },

  left: { display: "flex", gap: 12, alignItems: "center" },

  menuBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 900,
  },

  menuPanel: {
    position: "absolute",
    left: 0,
    top: "calc(100% + 8px)",
    minWidth: 240,
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "white",
    boxShadow: "0 18px 40px rgba(0,0,0,0.12)",
    padding: 8,
    zIndex: 50,
  },
  menuItemBtn: {
    width: "100%",
    textAlign: "left",
    padding: "10px 10px",
    borderRadius: 10,
    border: "1px solid transparent",
    background: "white",
    cursor: "pointer",
    color: "#111",
    fontWeight: 900,
    fontSize: 14,
  },
  menuItemActive: {
    background: "#f2f4f8",
    border: "1px solid #e5e7eb",
  },
  menuItemDanger: {
    width: "100%",
    textAlign: "left",
    padding: "10px 10px",
    borderRadius: 10,
    border: "1px solid transparent",
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 14,
    color: "#a40000",
  },
  menuDivider: { height: 1, background: "#eee", margin: "6px 0" },

  right: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" },
  meta: { display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" },
  metaBlock: { minWidth: 110 },
  metaLabel: { fontSize: 12, color: "#777", fontWeight: 800 },
  metaValue: { fontSize: 13, color: "#111", fontWeight: 900 },

  quickBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 900,
  },
  quickBtnActive: {
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
  },

  logout: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
  },
};