"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";

type Theme = "light" | "dark";
type ThemeToggleProps = { className?: string; compact?: boolean };

function getThemeFromDocument(): Theme { return document.documentElement.classList.contains("dark") ? "dark" : "light"; }

export function ThemeToggle({ className, compact = false }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setTheme(getThemeFromDocument()); setMounted(true); }, []);
  function toggleTheme() {
    const currentTheme = getThemeFromDocument();
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    localStorage.setItem("theme", nextTheme);
    setTheme(nextTheme);
  }
  if (!mounted) return <div className={cn("h-10 rounded-[var(--radius-md)] border border-default bg-[var(--color-shell-surface)]", compact ? "w-10" : "w-28", className)} aria-hidden="true" />;
  const isDark = theme === "dark";
  const label = isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
  return <Button type="button" variant="secondary" className={cn("h-10 px-3 text-xs", compact && "w-10 p-0", className)} onClick={toggleTheme} aria-label={label} title={isDark ? "Modo claro" : "Modo oscuro"}>{isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}{compact ? null : <span>{isDark ? "Modo claro" : "Modo oscuro"}</span>}</Button>;
}
