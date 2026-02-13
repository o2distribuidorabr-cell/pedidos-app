"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";
import TopNav from "@/components/TopNav"; // ✅ ajuste o caminho se necessário

export default function AdmLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    // ✅ garante que o TopNav saiba que está no portal admin
    localStorage.setItem("portal_mode", "admin");

    (async () => {
      const ok = await requireAdminOrRedirect(router);
      if (!ok) return; // redirecionou
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#f6f7fb" }}>
      <TopNav />
      {children}
    </div>
  );
}