import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Archivo, IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

// As fontes são baixadas no build e servidas pelo próprio sistema (nada é carregado do Google no navegador).
const ui = Archivo({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const wt = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-wt", display: "swap" });
const num = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-num", display: "swap" });

export const metadata: Metadata = {
  title: "WT Sistemas",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Tema escuro é o padrão; quem escolheu o claro no botão do menu tem o cookie "tema=claro".
  const light = (await cookies()).get("tema")?.value === "claro";
  return (
    <html lang="pt-BR" className={`${ui.variable} ${num.variable} ${wt.variable}`} data-theme={light ? "light" : undefined}>
      <body>{children}</body>
    </html>
  );
}
