"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [loading, setLoading] = useState(true);

  const [userEmail, setUserEmail] = useState("-");
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("-");
  const [creditBalance, setCreditBalance] = useState<number>(0);

  const isActive = useMemo(() => {
    return (href: string) => pathname === href || pathname?.startsWith(href + "/");
  }, [pathname]);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;

      if (!user) {
        router.push("/login");
        return;
      }

      setUserEmail(user.email ?? "-");

      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("id", user.id)
        .maybeSingle();

      if (pErr) {
        console.warn("FranchiseeTopbar profile:", pErr.message);
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

      const { data: st, error: sErr } = await supabase
        .from("stores")
        .select("id,name")
        .eq("id", sId)
        .maybeSingle();

      if (!sErr) {
        const row = (st as StoreRow | null) ?? null;
        setStoreName(row?.name ?? sId);
      }

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
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function go(path: string) {
    setOpen(false);
    router.push(path);
  }

  return (
    <>
      {/* Barra fixa */}
      <div style={styles.fixedBar}>
        <button
          style={styles.menuBtn}
          onClick={() => setOpen((v) => !v)}
          aria-label="Abrir menu"
          type="button"
        >
          Menu ▾
        </button>

        <div style={styles.titleArea}>
          <div style={styles.title}>Portal do Franqueado</div>
          <div style={styles.subtitle}>
            {loading ? "Carregando..." : `${userEmail} · ${storeName} · Crédito: ${money(creditBalance)}`}
          </div>
        </div>

        {/* REMOVIDO: botões à direita */}
      </div>

      {/* Dropdown */}
      {open ? (
        <div style={styles.menuLayer} onClick={() => setOpen(false)}>
          <div style={styles.menuCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.menuHeader}>Menu</div>

            <button
              style={{ ...styles.menuItem, ...(isActive("/pedido") ? styles.menuItemActive : {}) }}
              onClick={() => go("/pedido")}
              type="button"
            >
              + Novo pedido
            </button>

            <button
              style={{ ...styles.menuItem, ...(isActive("/pedidos") ? styles.menuItemActive : {}) }}
              onClick={() => go("/pedidos")}
              type="button"
            >
              Histórico
            </button>

            <button
              style={{ ...styles.menuItem, ...(isActive("/financeiro") ? styles.menuItemActive : {}) }}
              onClick={() => go("/financeiro")}
              type="button"
            >
              Financeiro
            </button>

            <button
              style={{ ...styles.menuItem, ...(isActive("/extrato") ? styles.menuItemActive : {}) }}
              onClick={() => go("/extrato")}
              type="button"
            >
              Extrato
            </button>

            <div style={styles.menuDivider} />

            <button style={{ ...styles.menuItem, color: "#a40000" }} onClick={onLogout} type="button">
              Sair
            </button>
          </div>
        </div>
      ) : null}

      {/* Espaço para não “tapar” o conteúdo */}
      <div style={{ height: 74 }} />
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  fixedBar: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    height: 64,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    background: "#fff",
    borderBottom: "1px solid #e6e7ee",
    boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
  },

  menuBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 900,
  },

  titleArea: { display: "flex", flexDirection: "column", gap: 2, minWidth: 260 },
  title: { fontSize: 16, fontWeight: 1000 as any, color: "#111" },
  subtitle: {
    fontSize: 12,
    color: "#666",
    fontWeight: 700,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  menuLayer: {
    position: "fixed",
    inset: 0,
    zIndex: 60,
    background: "rgba(0,0,0,0.20)",
  },
  menuCard: {
    position: "absolute",
    top: 66,
    left: 14,
    width: 260,
    background: "#fff",
    border: "1px solid #e6e7ee",
    borderRadius: 14,
    boxShadow: "0 20px 40px rgba(0,0,0,0.18)",
    overflow: "hidden",
  },
  menuHeader: {
    padding: 12,
    borderBottom: "1px solid #eee",
    fontWeight: 1000 as any,
    color: "#111",
  },
  menuItem: {
    width: "100%",
    textAlign: "left",
    padding: "12px 12px",
    border: "none",
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 900,
  },
  menuItemActive: {
    background: "#f2f4f8",
    borderTop: "1px solid #e5e7eb",
    borderBottom: "1px solid #e5e7eb",
  },
  menuDivider: { height: 1, background: "#eee" },
};