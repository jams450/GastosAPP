"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";

type AppMenuProps = {
  username?: string;
  compact?: boolean;
};

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transacciones" },
  { href: "/catalogs", label: "Catálogos" }
] as const;

export function AppMenu({ username, compact = false }: AppMenuProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function onLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="relative">
      <div className="hidden items-center gap-2 md:flex">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex items-center justify-center rounded-xl border px-3 font-medium transition",
                compact ? "h-8 text-xs" : "h-10 text-sm",
                isActive
                  ? "border-sky-600 bg-sky-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              )}
            >
              {item.label}
            </Link>
          );
        })}

        {username ? <span className="mx-1 text-xs text-slate-500 dark:text-slate-400">{username}</span> : null}
        <ThemeToggle />
        <Button
          type="button"
          variant="secondary"
          loading={loggingOut}
          loadingText="Saliendo..."
          className={compact ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm"}
          onClick={onLogout}
        >
          Cerrar sesión
        </Button>
      </div>

      <div className="flex items-center gap-2 md:hidden">
        <ThemeToggle />
        <Button type="button" variant="secondary" className="h-9 px-3 text-xs" onClick={() => setMobileOpen((prev) => !prev)}>
          Menú
        </Button>
      </div>

      {mobileOpen ? (
        <div className="absolute right-0 top-12 z-30 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 text-xs text-slate-500 dark:text-slate-400">{username ? `Usuario: ${username}` : "Navegación"}</div>
          <div className="flex flex-col gap-2">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "inline-flex h-9 items-center rounded-lg border px-3 text-xs font-medium transition",
                    isActive
                      ? "border-sky-600 bg-sky-600 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}

            <Button type="button" variant="secondary" loading={loggingOut} loadingText="Saliendo..." className="h-9 text-xs" onClick={onLogout}>
              Cerrar sesión
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
