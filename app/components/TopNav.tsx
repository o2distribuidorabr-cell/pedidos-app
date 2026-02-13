"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Mode = "franchisee" | "admin" | null;

export default function TopNav() {
  const router = useRouter();
  const pathname = usePathname();

  const [mode, setMode] = useState<Mode>(null);
  const [userEmail, setUserEmail] = useState<string>("-");
  const [storeName, setStoreName] = useState<string>("-");
  const [loading, setLoading] = useState(true);

  // dropdown
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  useEffect(() => {
    const m = (localStorage.getItem("portal_mode") as Mode) ?? null;
    setMode(m);

    (async () => {
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;

      if (!user) {
        setUserEmail("-");
        setStoreName("-");
        setLoading(false);
        return;
      }

      setUserEmail(user.email ?? "-");

      // Só busca loja se não for admin
      if (m !== "admin") {
        const { data: profile } = await supabase
          .from("profiles")
          .select("store_id")
          .eq("id", user.id)
          .maybeSingle();

        const storeId = (profile?.store_id as string | null) ?? null;

        if (!storeId) {
          setStoreName("-");
          setLoading(false);
          return;
        }

        const { data: store } = await supabase
          .from("stores")
          .select("name")
          .eq("id", storeId)
          .maybeSingle();

        setStoreName((store?.name as string) ?? "-");
      } else {
        setStoreName("-");
      }

      setLoading(false);
    })();
  }, [pathname]);

  if (!mode) return null;

  const isAdminMode = mode === "admin";

  async function onLogout() {
    localStorage.removeItem("portal_mode");
    await supabase.auth.signOut();
    router.push("/login");
  }

  // itens do menu
  const adminItems = [
  { label: "Pedidos", href: "/adm/pedidos" },
  { label: "Cadastros", href: "/adm/cadastros" },

  // ✅ NOVO
  { label: "Usuários", href: "/adm/usuarios" },

  { label: "Lojas", href: "/adm/lojas" },
  { label: "Produtos", href: "/adm/produtos" },
  { label: "Financeiro", href: "/adm/financeiro" },
  { label: "Extrato de crédito", href: "/adm/credito" },
];

  const franchiseeItems = [
    { label: "Pedidos", href: "/pedidos" },
    { label: "Novo pedido", href: "/pedido" },
    // Se quiser também no franqueado, descomente e ajuste a rota:
    // { label: "Extrato de crédito", href: "/credito" },
  ];

  const items = isAdminMode ? adminItems : franchiseeItems;

  return (
    <div style={styles.wrap}>
      <div style={styles.inner}>
        {/* ESQUERDA: Menu dropdown */}
        <div style={styles.left}>
          <div ref={menuRef} style={{ position: "relative" }}>
            <button style={styles.menuBtn} onClick={() => setMenuOpen((v) => !v)}>
              Menu ▾
            </button>

            {menuOpen ? (
              <div style={styles.menuPanel} role="menu">
                {items.map((it) => (
                  <MenuLink
                    key={it.href}
                    href={it.href}
                    label={it.label}
                    active={pathname === it.href || pathname.startsWith(it.href + "/")}
                    onClick={() => setMenuOpen(false)}
                  />
                ))}

                <div style={styles.menuDivider} />

                <button
                  style={styles.menuItemDanger}
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                  role="menuitem"
                >
                  Sair
                </button>
              </div>
            ) : null}
          </div>

          {/* “título” do portal */}
          <div style={{ fontWeight: 900, color: "#111" }}>
            {isAdminMode ? "Administrativo" : "Franqueado"}
          </div>
        </div>

        {/* DIREITA: meta */}
        <div style={styles.right}>
          <div style={styles.meta}>
            <div style={styles.metaBlock}>
              <div style={styles.metaLabel}>Usuário</div>
              <div style={styles.metaValue}>{loading ? "..." : userEmail}</div>
            </div>

            {!isAdminMode && (
              <div style={styles.metaBlock}>
                <div style={styles.metaLabel}>Loja</div>
                <div style={styles.metaValue}>{loading ? "..." : storeName}</div>
              </div>
            )}

            <div style={styles.metaBlock}>
              <div style={styles.metaLabel}>Portal</div>
              <div style={styles.metaValue}>
                {isAdminMode ? "Administrador" : "Franqueado"}
              </div>
            </div>
          </div>

          {/* botão sair direto (opcional). Se não quiser, pode remover */}
          <button onClick={onLogout} style={styles.logout}>
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}

function MenuLink({
  href,
  label,
  onClick,
  active,
}: {
  href: string;
  label: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        ...styles.menuItem,
        ...(active ? styles.menuItemActive : {}),
      }}
      role="menuitem"
    >
      {label}
    </Link>
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
    minWidth: 220,
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "white",
    boxShadow: "0 18px 40px rgba(0,0,0,0.12)",
    padding: 8,
    zIndex: 50,
  },
  menuItem: {
    display: "block",
    padding: "10px 10px",
    borderRadius: 10,
    textDecoration: "none",
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

  right: { display: "flex", alignItems: "center", gap: 12 },
  meta: { display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" },
  metaBlock: { minWidth: 120 },
  metaLabel: { fontSize: 12, color: "#777", fontWeight: 800 },
  metaValue: { fontSize: 13, color: "#111", fontWeight: 900 },

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