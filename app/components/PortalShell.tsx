"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import BrandMark from "./BrandMark";
import { supabase } from "@/lib/supabaseClient";

type Mode = "franchisee" | "admin" | null;
type SidebarState = "expanded" | "collapsed";

function initialsFrom(s: string) {
  const v = (s || "").trim();
  if (!v) return "U";
  const parts = v.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  // ícone simples (sem lib)
  return (
    <span className="text-slate-500">
      {dir === "left" ? "◀" : "▶"}
    </span>
  );
}

function NavItem({
  href,
  label,
  onNavigate,
  collapsed,
}: {
  href: string;
  label: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={[
        "group flex items-center rounded-xl text-sm transition",
        collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
        active
          ? "bg-blue-50 text-blue-700 border border-blue-100"
          : "text-slate-600 hover:bg-slate-100",
      ].join(" ")}
    >
      {/* bolinha / indicador */}
      <span
        className={[
          "h-2.5 w-2.5 rounded-full",
          active ? "bg-blue-600" : "bg-slate-300 group-hover:bg-slate-400",
        ].join(" ")}
      />
      {!collapsed ? <span className="font-medium">{label}</span> : null}
    </Link>
  );
}

export default function PortalShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [mode, setMode] = useState<Mode>(null);

  const [userEmail, setUserEmail] = useState<string>("-");
  const [storeName, setStoreName] = useState<string>("-");
  const [loading, setLoading] = useState(true);

  // dropdown do usuário
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  // sidebar (desktop) + drawer (mobile)
  const [sidebarState, setSidebarState] = useState<SidebarState>("expanded");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!userMenuRef.current) return;
      if (!userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setUserMenuOpen(false);
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  useEffect(() => {
    try {
      const s = (localStorage.getItem("portal_sidebar") as SidebarState) ?? null;
      if (s === "collapsed" || s === "expanded") setSidebarState(s);
    } catch {}
  }, []);

  useEffect(() => {
    const stored = (localStorage.getItem("portal_mode") as Mode) ?? null;
    const inferred: Mode = pathname.startsWith("/adm") ? "admin" : "franchisee";
    const m: Mode = stored ?? inferred;

    try {
      localStorage.setItem("portal_mode", m);
    } catch {}

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

      if (m !== "admin") {
        const { data: profile } = await supabase.from("profiles").select("store_id").eq("id", user.id).maybeSingle();
        const storeId = (profile?.store_id as string | null) ?? null;

        if (!storeId) {
          setStoreName("-");
          setLoading(false);
          return;
        }

        const { data: store } = await supabase.from("stores").select("name").eq("id", storeId).maybeSingle();
        setStoreName((store?.name as string) ?? "-");
      } else {
        setStoreName("-");
      }

      setLoading(false);
    })();

    setUserMenuOpen(false);
    setMobileMenuOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const isAdminMode = mode === "admin";
  const badge = useMemo(() => initialsFrom(userEmail === "-" ? "U" : userEmail), [userEmail]);

  async function onLogout() {
    localStorage.removeItem("portal_mode");
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function toggleSidebar() {
    setSidebarState((prev) => {
      const next: SidebarState = prev === "expanded" ? "collapsed" : "expanded";
      try {
        localStorage.setItem("portal_sidebar", next);
      } catch {}
      return next;
    });
  }

  const adminItems = [
    { label: "Pedidos", href: "/adm/pedidos" },
    { label: "Cadastros", href: "/adm/cadastros" },
    { label: "Usuários", href: "/adm/usuarios" },
    { label: "Lojas", href: "/adm/lojas" },
    { label: "Produtos", href: "/adm/produtos" },
    { label: "Financeiro", href: "/adm/financeiro" },
    { label: "Extrato de crédito", href: "/adm/credito" },
  ];

  const franchiseeItems = [
    { label: "Pedidos", href: "/pedidos" },
    { label: "Novo pedido", href: "/pedido" },
    { label: "Financeiro", href: "/financeiro" },
    { label: "Extrato de crédito", href: "/extrato" },
  ];

  const items = isAdminMode ? adminItems : franchiseeItems;

  if (!mode) return <div className="min-h-screen bg-slate-50" />;

  const collapsed = sidebarState === "collapsed";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* overlay mobile */}
      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setMobileMenuOpen(false)} />
      ) : null}

      <div className="flex">
        {/* Sidebar desktop */}
        <aside
          className={[
            "hidden md:flex md:flex-col md:border-r md:border-slate-200 md:bg-white transition-[width] duration-200",
            collapsed ? "md:w-[88px]" : "md:w-72",
          ].join(" ")}
        >
          {/* Topo: logo + toggle discreto */}
          <div className={["flex items-center", collapsed ? "justify-center px-3 py-5" : "justify-between px-6 py-5"].join(" ")}>
            <BrandMark compact={collapsed} />

            {/* Toggle como ícone pequeno (só aparece no expandido; no colapsado fica abaixo) */}
            {!collapsed ? (
              <button
                onClick={toggleSidebar}
                className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50"
                title="Recolher menu"
              >
                <Chevron dir="left" />
              </button>
            ) : null}
          </div>

          {/* Toggle no colapsado (fica centralizado) */}
          {collapsed ? (
            <div className="px-3 -mt-2 pb-3 flex justify-center">
              <button
                onClick={toggleSidebar}
                className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50"
                title="Expandir menu"
              >
                <Chevron dir="right" />
              </button>
            </div>
          ) : null}

          {/* Menu */}
          <div className={collapsed ? "px-3 py-2" : "px-6 py-2"}>
            {!collapsed ? (
              <div className="px-1 pb-2 text-xs font-semibold tracking-wide text-slate-500">MENU</div>
            ) : null}

            <div className="space-y-1">
              {items.map((it) => (
                <NavItem key={it.href} href={it.href} label={it.label} collapsed={collapsed} />
              ))}
            </div>
          </div>

          {/* Card portal (some no colapsado) */}
          {!collapsed ? (
            <div className="mt-auto px-6 pb-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold text-slate-700">Portal</div>
                <div className="mt-1 text-xs text-slate-600">{isAdminMode ? "Administrador" : "Franqueado"}</div>
              </div>
            </div>
          ) : null}
        </aside>

        {/* Drawer mobile */}
        <aside
          className={[
            "fixed left-0 top-0 z-50 h-full w-72 bg-white border-r border-slate-200 p-6 md:hidden transition-transform duration-200",
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
        >
          <div className="flex items-center justify-between">
            <BrandMark />
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50"
              title="Fechar"
            >
              ✕
            </button>
          </div>

          <div className="mt-6">
            <div className="px-1 pb-2 text-xs font-semibold tracking-wide text-slate-500">MENU</div>
            <div className="space-y-1">
              {items.map((it) => (
                <NavItem key={it.href} href={it.href} label={it.label} onNavigate={() => setMobileMenuOpen(false)} />
              ))}
            </div>
          </div>

          <div className="mt-auto pt-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-700">Portal</div>
              <div className="mt-1 text-xs text-slate-600">{isAdminMode ? "Administrador" : "Franqueado"}</div>
            </div>
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
            <div className="flex items-center justify-between px-4 py-3 md:px-8">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  className="md:hidden grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50"
                  aria-label="Abrir menu"
                  title="Menu"
                >
                  ☰
                </button>

                <div className="md:hidden">
                  <BrandMark />
                </div>

                <div className="hidden md:block">
                  <div className="text-sm font-semibold text-slate-900">{title}</div>
                  <div className="text-xs text-slate-500">{subtitle ?? (isAdminMode ? "Administrativo" : "Franqueado")}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="hidden lg:flex items-end gap-6 mr-2">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-500">Usuário</div>
                    <div className="text-sm font-semibold text-slate-900">{loading ? "..." : userEmail}</div>
                  </div>

                  {!isAdminMode && (
                    <div>
                      <div className="text-[11px] font-semibold text-slate-500">Loja</div>
                      <div className="text-sm font-semibold text-slate-900">{loading ? "..." : storeName}</div>
                    </div>
                  )}

                  <div>
                    <div className="text-[11px] font-semibold text-slate-500">Portal</div>
                    <div className="text-sm font-semibold text-slate-900">{isAdminMode ? "Administrador" : "Franqueado"}</div>
                  </div>
                </div>

                <div ref={userMenuRef} className="relative">
                  <button
                    onClick={() => setUserMenuOpen((v) => !v)}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-100 text-xs font-semibold text-slate-700">
                      {loading ? "…" : badge}
                    </span>
                    <span className="hidden sm:block max-w-[200px] truncate">{loading ? "Carregando…" : userEmail}</span>
                    <span className="text-slate-400">▾</span>
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
                      <div className="px-4 py-3">
                        <div className="text-xs font-semibold text-slate-500">Logado como</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900 truncate">{loading ? "..." : userEmail}</div>

                        {!isAdminMode && (
                          <div className="mt-1 text-xs text-slate-500 truncate">Loja: {loading ? "..." : storeName}</div>
                        )}

                        <div className="mt-1 text-xs text-slate-500">Portal: {isAdminMode ? "Administrador" : "Franqueado"}</div>
                      </div>

                      <div className="border-t border-slate-200">
                        <button
                          onClick={onLogout}
                          className="w-full px-4 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
                        >
                          Sair
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={onLogout}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                >
                  Sair
                </button>
              </div>
            </div>
          </header>

          <main className="px-4 py-6 md:px-8 md:py-8">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="p-4 md:p-6">{children}</div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}