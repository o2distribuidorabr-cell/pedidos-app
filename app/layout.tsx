// app/layout.tsx (SERVER - NÃO colocar "use client")

import "./globals.css";

export const metadata = {
  title: "Pedidos",
  description: "Portal de pedidos",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-br">
      <body>{children}</body>
    </html>
  );
}