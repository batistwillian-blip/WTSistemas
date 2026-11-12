"use client";

import { useEffect, useState } from "react";

/** Troca entre o tema escuro (padrão) e o claro. A escolha fica num cookie, então vale em todas as telas e no próximo acesso. */
export function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => setLight(document.documentElement.dataset.theme === "light"), []);
  const toggle = () => {
    const next = !light;
    setLight(next);
    if (next) document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    document.cookie = `tema=${next ? "claro" : "escuro"}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <button type="button" className="theme-btn" onClick={toggle} aria-pressed={light}>
      {light ? "🌙 Usar tema escuro" : "☀️ Usar tema claro"}
    </button>
  );
}
