import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// As fontes são baixadas no build e servidas pelo próprio sistema (nada é carregado do Google no navegador).
const ui = Archivo({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const num = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-num", display: "swap" });

export const metadata: Metadata = {
  title: "Caixa Consolidado",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${ui.variable} ${num.variable}`}>
      <body>{children}</body>
    </html>
  );
}
