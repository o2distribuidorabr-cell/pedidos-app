"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";
import TopNav from "@/app/components/TopNav";

export default function AdmLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const ok = await requireAdminOrRedirect(router);
      if (!ok) return;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <TopNav />
      {children}
    </>
  );
}