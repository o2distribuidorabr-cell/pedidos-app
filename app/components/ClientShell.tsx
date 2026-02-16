"use client";

import React from "react";
import { usePathname } from "next/navigation";

export default function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Mantém a regra do /login sem padding, mas sem TopNav
  const hideNav = pathname === "/login";

  return <div style={{ paddingTop: hideNav ? 0 : 0 }}>{children}</div>;
}