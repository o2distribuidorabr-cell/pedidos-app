"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type StoreRow = { id: string; name: string | null };

export default function FranchiseeMenu() {
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("-");
  const [storeName, setStoreName] = useState<string>("-");
  const [loading, setLoading] = useState(true);

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

      const { data: profile } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("id", user.id)
        .maybeSingle();

      const storeId = (profile?.store_id as string | null) ?? null;

      if (storeId) {
        const { data: st } = await supabase
          .from("stores")
          .select("id,name")
          .eq("id", storeId)
          .maybeSingle();

        const store = (st ?? null) as StoreRow | null;
        setStoreName(store?.name ?? "-");
      } else {
        setStoreName("Sem loja vinculada");
      }

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function go(path: string) {
    setOpen(false);
    router.push(path);
  }

  async function onLogout() {
    setOpen(false);
    await supabase.auth.signOut();
    router.push("/login");
  }

  const isActive = (path: string) => pathname === path || pathname?.startsWith(path + "/");

  return (
    <div style={styles.wrap}>
      {/* Barra superior (igual ADM: Menu + título + usuário + sair) */}
      <div style={styles.topbar}>
        <button style={styles.menuBtn} onClick={() => setOpen((v) => !v)}>
          Menu ▾
        </button>

        <div style={styles.title}>
          <div style={styles.titleSmall}>Portal</div>
          <div style={styles.titleBig}>Franqueado</div>
        </div>

        <div style={styles.rightInfo}>
          <div style={styles.infoBlock}>
            <div style={styles.infoSmall}>Usuário</div>
            <div style={styles.infoBig}>{loading ? "..." : userEmail}</div>
          </div>
          <div style={styles.infoBlock}>
            <div style={styles.infoSmall}>Loja</div>
            <div style={styles.infoBig}>{loading ? "..." : storeName}</div>
          </div>

          <button style={styles.logoutBtn} onClick={onLogout}>
            Sair
          </button>
        </div>
      </div>

      {/* Menu lateral (dropdown) */}
      {open ? (
        <div style={styles.menuPanel} onMouseLeave={() => setOpen(false)}>
          <div style={styles.menuGroupTitle}>Pedidos</div>

          <MenuItem active={isActive("/pedidos")} label="Histórico de pedidos" onClick={() => go("/pedidos")} />
          <MenuItem active={isActive("/pedido")} label="Novo pedido" onClick={() => go("/pedido")} />

          <div style={styles.sep} />

          <div style={styles.menuGroupTitle}>Financeiro</div>
          <MenuItem active={isActive("/financeiro")} label="Financeiro" onClick={() => go("/financeiro")} />

          <div style={styles.sep} />
          <MenuItem active={false} label="Sair" onClick={onLogout} danger />
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  active,
  danger,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.menuItem,
        background: active ? "#eef2ff" : "#fff",
        borderColor: active ? "#c7d2fe" : "#e5e7eb",
        color: danger ? "#b91c1c" : "#111",
      }}
    >
      {label}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { position: "sticky", top: 0, zIndex: 40 },

  topbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid #e6e7ee",
    background: "#fff",
    boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
    marginBottom: 12,
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

  title: { display: "flex", flexDirection: "column", gap: 2 },
  titleSmall: { fontSize: 12, color: "#777", fontWeight: 800 },
  titleBig: { fontSize: 14, fontWeight: 1000 as any, color: "#111" },

  rightInfo: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" },
  infoBlock: { display: "flex", flexDirection: "column", gap: 2 },
  infoSmall: { fontSize: 12, color: "#777", fontWeight: 800 },
  infoBig: { fontSize: 13, fontWeight: 900, color: "#111" },

  logoutBtn: {
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
    top: 58,
    width: 260,
    background: "#fff",
    border: "1px solid #e6e7ee",
    borderRadius: 14,
    padding: 12,
    boxShadow: "0 18px 40px rgba(0,0,0,0.12)",
  },

  menuGroupTitle: { fontSize: 12, color: "#777", fontWeight: 900, margin: "6px 0 8px" },

  menuItem: {
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 900,
    marginBottom: 8,
  },

  sep: { height: 1, background: "#eee", margin: "8px 0 10px" },
};