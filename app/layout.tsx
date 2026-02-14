import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "O2 Pedidos",
  description: "Portal de pedidos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}