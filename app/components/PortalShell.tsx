"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import BrandMark from "./BrandMark";
import WhatsNewModal from "./WhatsNewModal";
import { supabase } from "@/lib/supabaseClient";
import {
  clonePermissions,
  EMPTY_ADMIN_PERMISSIONS,
  FULL_ADMIN_PERMISSIONS,
  type AdminPermissions,
} from "@/lib/adminPermissions";

type Mode = "franchisee" | "admin" | null;

type AdminMenuItem = {
  label: string;
  href: string;
  allowed: (permissions: AdminPermissions) => boolean;
};

type RoutePermissionRule = {
  prefix: string;
  permission: keyof AdminPermissions;
};

function initialsFrom(s: string) {
  const v = (s || "").trim();
  if (!v) return "U";
  const parts = v.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6l-12 12" strokeLinecap="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2">
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
}: {
  href: string;
  label: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={[
        "group flex items-center gap-3 rounded-[18px] px-4 py-3 text-sm transition-all duration-200",
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
      <span className="font-semibold">{label}</span>
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

const routePermissionMap: RoutePermissionRule[] = [
  { prefix: "/adm/usuarios", permission: "can_users" },
  { prefix: "/adm/expedicao/mapa-separacao", permission: "can_separation_map" },
  { prefix: "/adm/expedicao", permission: "can_expedition" },
  { prefix: "/adm/logistica", permission: "can_expedition" },
  { prefix: "/adm/emissao-fiscal", permission: "can_fiscal_issue" },
  { prefix: "/adm/importar-xml", permission: "can_fiscal_issue" },
  { prefix: "/adm/fiscal-produtos", permission: "can_fiscal_products" },
  { prefix: "/adm/regras-fiscais", permission: "can_fiscal_rules" },
  { prefix: "/adm/cadastros", permission: "can_registrations" },
  { prefix: "/adm/lojas", permission: "can_stores" },
  { prefix: "/adm/produtos", permission: "can_products" },
  { prefix: "/adm/emitentes", permission: "can_emitters" },
  { prefix: "/adm/financeiro", permission: "can_financial" },
  { prefix: "/adm/credito", permission: "can_credit" },
  { prefix: "/adm/estoque/movimentacao", permission: "can_stock" },
  { prefix: "/adm/estoque", permission: "can_stock" },
  { prefix: "/adm/pedidos", permission: "can_orders" },
  { prefix: "/adm/dashboard", permission: "can_dashboard" },
];

function getRequiredPermission(pathname: string): keyof AdminPermissions | null {
  if (!pathname.startsWith("/adm")) return null;
  if (pathname === "/adm") return "can_dashboard";
  if (pathname === "/adm/sem-acesso") return null;

  for (const rule of routePermissionMap) {
    if (pathname === rule.prefix || pathname.startsWith(rule.prefix + "/")) {
      return rule.permission;
    }
  }

  return null;
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

  const [menuOpen, setMenuOpen] = useState(false);

  const [adminPermissions, setAdminPermissions] = useState<AdminPermissions>(
    clonePermissions(EMPTY_ADMIN_PERMISSIONS)
  );
  const [isVerifiedAdmin, setIsVerifiedAdmin] = useState(false);
  const [permissionReady, setPermissionReady] = useState(false);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!userMenuRef.current) return;
      if (!userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }

    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setUserMenuOpen(false);
        setMenuOpen(false);
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
    const stored = (localStorage.getItem("portal_mode") as Mode) ?? null;
    const inferred: Mode = pathname.startsWith("/adm") ? "admin" : "franchisee";
    const m: Mode = stored ?? inferred;

    try {
      localStorage.setItem("portal_mode", m);
    } catch {}

    setMode(m);

    (async () => {
      setLoading(true);
      setPermissionReady(false);
      setIsVerifiedAdmin(false);

      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;

      if (!user) {
        setUserEmail("-");
        setStoreName("-");
        setAdminPermissions(clonePermissions(EMPTY_ADMIN_PERMISSIONS));
        setLoading(false);
        setPermissionReady(true);
        return;
      }

      setUserEmail(user.email ?? "-");

      if (m === "admin") {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id,is_admin")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError || !profile?.is_admin) {
          setAdminPermissions(clonePermissions(EMPTY_ADMIN_PERMISSIONS));
          setIsVerifiedAdmin(false);
          setStoreName("-");
          setLoading(false);
          setPermissionReady(true);

          if (pathname.startsWith("/adm")) {
            router.replace("/login");
          }
          return;
        }

        setIsVerifiedAdmin(true);

        const { data: permissionsData, error: permissionsError } = await supabase
          .from("admin_permissions")
          .select(`
            can_dashboard,
            can_orders,
            can_expedition,
            can_separation_map,
            can_fiscal_issue,
            can_fiscal_products,
            can_fiscal_rules,
            can_registrations,
            can_users,
            can_stores,
            can_products,
            can_emitters,
            can_financial,
            can_credit,
            can_stock
          `)
          .eq("user_id", user.id)
          .maybeSingle();

        if (permissionsError) {
          console.error("Erro ao carregar admin_permissions:", permissionsError);
          setAdminPermissions(clonePermissions(FULL_ADMIN_PERMISSIONS));
        } else if (permissionsData) {
          setAdminPermissions(clonePermissions(permissionsData));
        } else {
          setAdminPermissions(clonePermissions(FULL_ADMIN_PERMISSIONS));
        }

        setStoreName("-");
      } else {
        const { data: profile } = await supabase
          .from("profiles")
          .select("store_id")
          .eq("id", user.id)
          .maybeSingle();

        const storeId = (profile?.store_id as string | null) ?? null;

        if (!storeId) {
          setStoreName("-");
          setLoading(false);
          setPermissionReady(true);
          return;
        }

        const { data: store } = await supabase
          .from("stores")
          .select("name")
          .eq("id", storeId)
          .maybeSingle();

        setStoreName((store?.name as string) ?? "-");
      }

      setLoading(false);
      setPermissionReady(true);
    })();

    setUserMenuOpen(false);
    setMenuOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!permissionReady) return;
    if (!pathname.startsWith("/adm")) return;
    if (pathname === "/adm/sem-acesso") return;
    if (mode !== "admin") return;
    if (!isVerifiedAdmin) return;

    const requiredPermission = getRequiredPermission(pathname);
    if (!requiredPermission) return;

    const allowed = !!adminPermissions[requiredPermission];
    if (!allowed) {
      router.replace("/adm/sem-acesso");
    }
  }, [permissionReady, pathname, mode, isVerifiedAdmin, adminPermissions, router]);

  useEffect(() => {
    if (!menuOpen) {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [menuOpen]);

  const isAdminMode = mode === "admin";
  const badge = useMemo(() => initialsFrom(userEmail === "-" ? "U" : userEmail), [userEmail]);

  async function onLogout() {
    localStorage.removeItem("portal_mode");
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const adminItems: AdminMenuItem[] = [
    { label: "Dashboard", href: "/adm/dashboard", allowed: (p) => p.can_dashboard },
    { label: "Pedidos", href: "/adm/pedidos", allowed: (p) => p.can_orders },
    { label: "Logística", href: "/adm/logistica", allowed: (p) => p.can_expedition },
    { label: "Expedição", href: "/adm/expedicao", allowed: (p) => p.can_expedition },
    { label: "Mapa de separação", href: "/adm/expedicao/mapa-separacao", allowed: (p) => p.can_separation_map },
    { label: "Emissão fiscal", href: "/adm/emissao-fiscal", allowed: (p) => p.can_fiscal_issue },
    { label: "Importar XML compra", href: "/adm/importar-xml", allowed: (p) => p.can_fiscal_issue },
    { label: "Fiscal de produtos", href: "/adm/fiscal-produtos", allowed: (p) => p.can_fiscal_products },
    { label: "Regras fiscais", href: "/adm/regras-fiscais", allowed: (p) => p.can_fiscal_rules },
    { label: "Cadastros", href: "/adm/cadastros", allowed: (p) => p.can_registrations },
    { label: "Usuários", href: "/adm/usuarios", allowed: (p) => p.can_users },
    { label: "Lojas", href: "/adm/lojas", allowed: (p) => p.can_stores },
    { label: "Produtos", href: "/adm/produtos", allowed: (p) => p.can_products },
    { label: "Emitentes", href: "/adm/emitentes", allowed: (p) => p.can_emitters },
    { label: "Financeiro", href: "/adm/financeiro", allowed: (p) => p.can_financial },
    { label: "Extrato de crédito", href: "/adm/credito", allowed: (p) => p.can_credit },
    { label: "Estoque", href: "/adm/estoque", allowed: (p) => p.can_stock },
    { label: "Entrada de estoque", href: "/adm/estoque/entrada", allowed: (p) => p.can_stock },
    { label: "Inventário", href: "/adm/estoque/inventario", allowed: (p) => p.can_stock },
    { label: "Movimentação", href: "/adm/estoque/movimentacao", allowed: (p) => p.can_stock },
    { label: "Relatório de margem", href: "/adm/estoque/relatorio", allowed: (p) => p.can_stock },
    { label: "Planejamento de compras", href: "/adm/estoque/compras", allowed: (p) => p.can_stock },
    { label: "Gerar XML de pedidos", href: "/adm/estoque/xml-pedido", allowed: (p) => p.can_stock },
  ];

  const franchiseeItems = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Pedidos e entregas", href: "/pedidos" },
    { label: "Novo pedido", href: "/pedido" },
    { label: "Financeiro", href: "/financeiro" },
    { label: "Extrato de crédito", href: "/extrato" },
  ];

  const items = isAdminMode
    ? adminItems
        .filter((it) => it.allowed(adminPermissions))
        .map((it) => ({ label: it.label, href: it.href }))
    : franchiseeItems;

  if (!mode) return <div className="min-h-screen bg-slate-50" />;

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      {/* Modal de novidades — apenas para franqueados, não aparece no admin */}
      {!isAdminMode && !loading ? <WhatsNewModal /> : null}

      {menuOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 w-80 max-w-[88vw] border-r border-slate-200 bg-white transition-transform duration-200",
          menuOpen ? "translate-x-0 pointer-events-auto" : "-translate-x-full pointer-events-none",
        ].join(" ")}
        aria-hidden={!menuOpen}
      >
        <div className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain px-6 py-6 [-webkit-overflow-scrolling:touch] touch-pan-y">
          <div className="flex items-center justify-between">
            <BrandMark isAdmin={isAdminMode} />
            <TopButton onClick={() => setMenuOpen(false)} title="Fechar">
              <CloseIcon />
            </TopButton>
          </div>

          <div className="mt-8 shrink-0">
            <div className="px-1 pb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Menu
            </div>
            <div className="space-y-2">
              {items.map((it) => (
                <NavItem
                  key={it.href}
                  href={it.href}
                  label={it.label}
                  onNavigate={() => setMenuOpen(false)}
                />
              ))}
            </div>
          </div>

          <div className="mt-auto pt-6 shrink-0">
            <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Portal</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {isAdminMode ? "Administrador" : "Cliente"}
              </div>
              {!isAdminMode ? (
                <div className="mt-1 text-xs text-slate-500 truncate">{loading ? "..." : storeName}</div>
              ) : (
                <div className="mt-1 text-xs text-slate-500">Área administrativa</div>
              )}
            </div>
          </div>
        </div>
      </aside>

      <div className="min-h-screen">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/85 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-4 md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <TopButton onClick={() => setMenuOpen(true)} title="Abrir menu">
                <MenuIcon />
              </TopButton>

              <div className="min-w-0">
                <div className="truncate text-[26px] font-semibold tracking-[-0.04em] text-slate-900">
                  {title}
                </div>
                <div className="mt-1 truncate text-sm text-slate-500">
                  {subtitle ?? (isAdminMode ? "Administrativo" : "Cliente")}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden xl:flex items-center gap-3">
                <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 shadow-[0_6px_18px_rgba(15,23,42,0.05)]">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Usuário</div>
                  <div className="mt-1 max-w-[220px] truncate text-sm font-semibold text-slate-900">
                    {loading ? "..." : userEmail}
                  </div>
                </div>

                {!isAdminMode ? (
                  <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 shadow-[0_6px_18px_rgba(15,23,42,0.05)]">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Loja</div>
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
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Logado como</div>
                      <div className="mt-2 text-sm font-semibold text-slate-900 truncate">
                        {loading ? "..." : userEmail}
                      </div>

                      {!isAdminMode ? (
                        <div className="mt-2 text-xs text-slate-500 truncate">
                          Loja: {loading ? "..." : storeName}
                        </div>
                      ) : null}

                      <div className="mt-1 text-xs text-slate-500">
                        Portal: {isAdminMode ? "Administrador" : "Cliente"}
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
          <div className="rounded-[30px] border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="p-4 md:p-6">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}