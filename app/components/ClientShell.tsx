"use client";

import { usePathname } from "next/navigation";
import TopNav from "./TopNav";

export default function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideNav = pathname === "/login";

  return (
    <>
      {!hideNav && <TopNav />}
      <div style={{ paddingTop: hideNav ? 0 : 80 }}>{children}</div>
    </>
  );
}