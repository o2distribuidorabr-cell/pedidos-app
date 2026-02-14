"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button, Badge } from "@/app/components/ui";

type ProfileRow = { store_id: string | null };
type StoreRow = { id: string; name: string };

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

export default function FranchiseeTopbar() {
  const router = useRouter();
  const pathname = usePathname();

  const [email, setEmail] = useState<string>("-");
  const [storeName, setStoreName] = useState<string>("-");
  const [loading, setLoading] = useState(true);

  const links = useMemo(
    () => [
      { href: "/pedido", label: "Novo pedido" },
      { href: "/pedidos", label: "Histórico" },
      { href: "/financeiro", label: "Financeiro" },
      { href: "/extrato", label: "Extrato" },
    ],
    []
  );

  function isActive(href: string) {
    // ativa exata e também subrotas (ex.: /pedidos/123)
    if (href === "/pedido") return pathname === "/pedido" || pathname.startsWith("/pedido/");
    return pathname === href || pathname.startsWith(href + "/");
  }

  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;

      if (!user) {
        router.push("/login");
        return;
      }

      setEmail(user.email ?? "-");

      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("id", user.id)
        .maybeSingle();

      if (pErr) {
        setStoreName("—");
        setLoading(false);
        return;
      }

      const storeId = (profile as ProfileRow | null)?.store_id ?? null;
      if (!storeId) {
        setStoreName("Sem loja");
        setLoading(false);
        return;
      }

      const { data: store, error: sErr } = await supabase
        .from("stores")
        .select("id,name")
        .eq("id", storeId)
        .maybeSingle();

      if (sErr) {
        setStoreName("—");
        setLoading(false);
        return;
      }

      setStoreName((store as StoreRow | null)?.name ?? "-");
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onLogout() {
    try {
      await supabase.auth.signOut();
    } finally {
      router.push("/login");
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
        {/* Brand (mesmo padrão de topo do ADM: logo + nome) */}
        <Link href="/pedido" className="flex items-center gap-3">
          <div className="relative h-9 w-24 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <Image src="/logo.png" alt="Logo" fill sizes="96px" style={{ objectFit: "contain" }} />
          </div>
          <div className="hidden md:block">
            <div className="text-sm font-semibold text-slate-900 leading-4">Portal do cliente</div>
            <div className="text-xs text-slate-500">
              {loading ? "Carregando..." : storeName}
            </div>
          </div>
        </Link>

        {/* Nav (mesmo estilo “tabs” do ADM) */}
        <nav className="ml-2 hidden flex-1 items-center gap-2 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cx(
                "rounded-xl px-3 py-2 text-sm font-semibold transition",
                isActive(l.href)
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          <Badge tone="blue">CLIENTE</Badge>

          {/* Info compacto (igual padrão ADM: info em 2 linhas) */}
          <div className="hidden lg:flex flex-col items-end leading-tight">
            <div className="text-xs font-semibold text-slate-500">Usuário</div>
            <div className="text-sm font-semibold text-slate-900">{email}</div>
          </div>

          <Button variant="secondary" onClick={onLogout}>
            Sair
          </Button>
        </div>
      </div>

      {/* Nav mobile */}
      <div className="mx-auto w-full max-w-6xl px-4 pb-3 md:hidden">
        <div className="grid grid-cols-2 gap-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cx(
                "rounded-xl border px-3 py-2 text-center text-sm font-semibold",
                isActive(l.href)
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700"
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}