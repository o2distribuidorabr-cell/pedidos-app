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
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4"
      stroke="currentColor"
      strokeWidth="2"
    >
      {dir === "left" ? (
        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M6 6l12 12M18 6l-12 12" strokeLinecap="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M15 3h3a2 2 0 012 2v14a2 2 0 01-2 2h-3" strokeLinecap="round" />
      <path d="M10 17l5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 12H3" strokeLinecap="round" />
    </svg>
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
        "group flex items-center rounded-[18px] text-sm transition-all duration-200",
        collapsed ? "justify-center px-3 py-3" : "gap-3 px-4 py-3",
        active
          ? "bg-cyan-600 text-white shadow-[0_14px_34px_rgba(8,145,178,0.24)]"
          : "text-slate-600 hover:bg-slate-100",
      ].join(" ")}
    >
      <span
        className={[
          "h-2.5 w-2.5 rounded-full transition",
          active ? "bg-white" : "bg-slate-300 group-hover:bg-slate-400",
        ].join(" ")}
      />
      {!collapsed ? <span className="font-semibold">{label}</span> : null}
    </Link>
  );
}

function TopButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50"
      type="button"
    >
      {children}
    </button>
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

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

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
    { label: "Dashboard", href: "/adm/dashboard" },
    { label: "Pedidos", href: "/adm/pedidos" },
    { label: "Cadastros", href: "/adm/cadastros" },
    { label: "Usuários", href: "/adm/usuarios" },
    { label: "Lojas", href: "/adm/lojas" },
    { label: "Produtos", href: "/adm/produtos" },
    { label: "Financeiro", href: "/adm/financeiro" },
    { label: "Extrato de crédito", href: "/adm/credito" },
  ];

  const franchiseeItems = [
    { label: "Dashboard", href: "/dashboard" },
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
      {mobileMenuOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}

      <div className="flex">
        <aside
          className={[
            "hidden md:flex md:flex-col md:border-r md:border-slate-200 md:bg-white transition-[width] duration-200",
            collapsed ? "md:w-[96px]" : "md:w-[300px]",
          ].join(" ")}
        >
          <div
            className={[
              "flex items-center",
              collapsed ? "justify-center px-4 py-6" : "justify-between px-6 py-6",
            ].join(" ")}
          >
            <BrandMark compact={collapsed} isAdmin={isAdminMode} />

            {!collapsed ? (
              <TopButton onClick={toggleSidebar} title="Recolher menu">
                <Chevron dir="left" />
              </TopButton>
            ) : null}
          </div>

          {collapsed ? (
            <div className="px-3 -mt-1 pb-4 flex justify-center">
              <TopButton onClick={toggleSidebar} title="Expandir menu">
                <Chevron dir="right" />
              </TopButton>
            </div>
          ) : null}

          <div className={collapsed ? "px-3 py-2" : "px-6 py-2"}>
            {!collapsed ? (
              <div className="px-1 pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Menu
              </div>
            ) : null}

            <div className="space-y-2">
              {items.map((it) => (
                <NavItem key={it.href} href={it.href} label={it.label} collapsed={collapsed} />
              ))}
            </div>
          </div>

          {!collapsed ? (
            <div className="mt-auto px-6 pb-6">
              <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Portal
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {isAdminMode ? "Administrador" : "Franqueado"}
                </div>
                {!isAdminMode ? (
                  <div className="mt-1 text-xs text-slate-500 truncate">{loading ? "..." : storeName}</div>
                ) : (
                  <div className="mt-1 text-xs text-slate-500">Área administrativa</div>
                )}
              </div>
            </div>
          ) : null}
        </aside>

        <aside
          className={[
            "fixed left-0 top-0 z-50 h-full w-80 bg-white border-r border-slate-200 p-6 md:hidden transition-transform duration-200",
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
        >
          <div className="flex items-center justify-between">
            <BrandMark isAdmin={isAdminMode} />
            <TopButton onClick={() => setMobileMenuOpen(false)} title="Fechar">
              <CloseIcon />
            </TopButton>
          </div>

          <div className="mt-8">
            <div className="px-1 pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Menu
            </div>
            <div className="space-y-2">
              {items.map((it) => (
                <NavItem
                  key={it.href}
                  href={it.href}
                  label={it.label}
                  onNavigate={() => setMobileMenuOpen(false)}
                />
              ))}
            </div>
          </div>

          <div className="mt-auto pt-6">
            <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Portal
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {isAdminMode ? "Administrador" : "Franqueado"}
              </div>
              {!isAdminMode ? (
                <div className="mt-1 text-xs text-slate-500 truncate">{loading ? "..." : storeName}</div>
              ) : (
                <div className="mt-1 text-xs text-slate-500">Área administrativa</div>
              )}
            </div>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/85 backdrop-blur">
            <div className="flex items-center justify-between gap-3 px-4 py-4 md:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <TopButton onClick={() => setMobileMenuOpen(true)} title="Abrir menu">
                  <div className="md:hidden">
                    <MenuIcon />
                  </div>
                  <div className="hidden md:block">
                    <MenuIcon />
                  </div>
                </TopButton>

                <div className="md:hidden">
                  <BrandMark mobileOnly isAdmin={isAdminMode} />
                </div>

                <div className="hidden min-w-0 md:block">
                  <div className="truncate text-[26px] font-semibold tracking-[-0.04em] text-slate-900">
                    {title}
                  </div>
                  <div className="mt-1 truncate text-sm text-slate-500">
                    {subtitle ?? (isAdminMode ? "Administrativo" : "Franqueado")}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden xl:flex items-center gap-3">
                  <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 shadow-[0_6px_18px_rgba(15,23,42,0.05)]">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Usuário
                    </div>
                    <div className="mt-1 max-w-[220px] truncate text-sm font-semibold text-slate-900">
                      {loading ? "..." : userEmail}
                    </div>
                  </div>

                  {!isAdminMode ? (
                    <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 shadow-[0_6px_18px_rgba(15,23,42,0.05)]">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Loja
                      </div>
                      <div className="mt-1 max-w-[220px] truncate text-sm font-semibold text-slate-900">
                        {loading ? "..." : storeName}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div ref={userMenuRef} className="relative">
                  <button
                    onClick={() => setUserMenuOpen((v) => !v)}
                    className="flex items-center gap-3 rounded-[20px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] transition hover:bg-slate-50"
                    type="button"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-[16px] bg-cyan-600 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(8,145,178,0.28)]">
                      {loading ? "…" : badge}
                    </span>
                    <span className="hidden sm:block max-w-[180px] truncate font-semibold">
                      {loading ? "Carregando…" : userEmail}
                    </span>
                    <span className="text-slate-400">▾</span>
                  </button>

                  {userMenuOpen ? (
                    <div className="absolute right-0 mt-2 w-72 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.10)]">
                      <div className="px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Logado como
                        </div>
                        <div className="mt-2 text-sm font-semibold text-slate-900 truncate">
                          {loading ? "..." : userEmail}
                        </div>

                        {!isAdminMode ? (
                          <div className="mt-2 text-xs text-slate-500 truncate">
                            Loja: {loading ? "..." : storeName}
                          </div>
                        ) : null}

                        <div className="mt-1 text-xs text-slate-500">
                          Portal: {isAdminMode ? "Administrador" : "Franqueado"}
                        </div>
                      </div>

                      <div className="border-t border-slate-200 p-3">
                        <button
                          onClick={onLogout}
                          className="flex w-full items-center justify-center gap-2 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-100"
                          type="button"
                        >
                          <LogoutIcon />
                          Sair
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </header>

          <main className="px-4 py-6 md:px-8 md:py-8">
            <div className="rounded-[30px] border border-slate-200 bg-white shadow-sm">
              <div className="p-4 md:p-6">{children}</div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}