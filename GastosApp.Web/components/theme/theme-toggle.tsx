"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

function getThemeFromDocument(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getThemeFromDocument());
    setMounted(true);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    localStorage.setItem("theme", nextTheme);
    setTheme(nextTheme);
  }

  if (!mounted) {
    return <div className="h-10 w-28 rounded-xl border border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/70" />;
  }

  return (
    <Button type="button" variant="secondary" className="h-10 px-3 text-xs" onClick={toggleTheme}>
      {theme === "dark" ? "☀️ Modo claro" : "🌙 Modo oscuro"}
    </Button>
  );
}
