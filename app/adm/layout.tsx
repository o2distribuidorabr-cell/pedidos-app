import type { ReactNode } from "react";
import TopNav from "../components/TopNav";

export default function AdmLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TopNav />
      <div style={{ padding: 16 }}>{children}</div>
    </>
  );
}