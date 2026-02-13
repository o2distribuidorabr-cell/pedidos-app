// app/layout.tsx

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
    <html lang="pt-br" style={{ colorScheme: "light" }}>
      <body>{children}</body>
    </html>
  );
}