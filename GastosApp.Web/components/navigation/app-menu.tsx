"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";

type AppMenuProps = {
  username?: string;
  compact?: boolean;
};

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/accounts", label: "Cuentas" },
  { href: "/transactions", label: "Transacciones" },
  { href: "/catalogs", label: "Catálogos" }
] as const;

export function AppMenu({ username, compact = false }: AppMenuProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onWindowClick(event: MouseEvent) {
      if (!userMenuRef.current) {
        return;
      }

      if (!userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
        setMobileOpen(false);
      }
    }

    window.addEventListener("mousedown", onWindowClick);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onWindowClick);
      window.removeEventListener("keydown", onEscape);
    };
  }, []);

  async function onLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUserMenuOpen(false);
      setMobileOpen(false);
      router.replace("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  const shortName = username?.slice(0, 2).toUpperCase() ?? "NA";

  return (
    <div className="relative">
      <div className="hidden items-center gap-3 md:flex">
        <nav className="flex items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white/85 p-1.5 shadow-sm backdrop-blur dark:border-slate-700/80 dark:bg-slate-950/65">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center justify-center rounded-xl px-3 font-medium transition",
                  compact ? "h-8 text-xs" : "h-10 text-sm",
                  isActive
                    ? "bg-sky-600 text-white shadow-sm shadow-sky-500/40"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="relative" ref={userMenuRef}>
          <Button
            type="button"
            variant="secondary"
            className={cn(
              "group gap-2 rounded-2xl border border-slate-200/80 bg-white/85 pr-2 shadow-sm backdrop-blur dark:border-slate-700/80 dark:bg-slate-950/65",
              compact ? "h-9 pl-2.5 text-xs" : "h-11 pl-3 text-sm"
            )}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            onClick={() => setUserMenuOpen((value) => !value)}
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-600/10 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
              {shortName}
            </span>
            <span className="max-w-28 truncate text-left text-xs font-semibold text-slate-700 dark:text-slate-200 md:max-w-36">
              {username ?? "Usuario"}
            </span>
            <svg
              className={cn("h-4 w-4 text-slate-500 transition-transform dark:text-slate-400", userMenuOpen && "rotate-180")}
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path d="M5 8l5 5 5-5" className="stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>

          {userMenuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+0.6rem)] z-40 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-300/30 dark:border-slate-700 dark:bg-slate-950 dark:shadow-black/40"
            >
              <div className="mb-3 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 dark:border-slate-700/80 dark:bg-slate-900/70">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Sesión activa</p>
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{username ?? "Usuario"}</p>
              </div>

              <div className="space-y-2">
                <ThemeToggle className="w-full justify-start rounded-xl px-3 text-sm" />
                <Button
                  type="button"
                  variant="secondary"
                  loading={loggingOut}
                  loadingText="Saliendo..."
                  className="h-10 w-full justify-start rounded-xl px-3 text-sm"
                  onClick={() => void onLogout()}
                >
                  Cerrar sesión
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 md:hidden">
        <Button
          type="button"
          variant="secondary"
          className="h-9 rounded-xl px-3 text-xs"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav-menu"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3 5h14M3 10h14M3 15h14" className="stroke-current" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          Menú
        </Button>
      </div>

      {mobileOpen ? (
        <div
          id="mobile-nav-menu"
          className="absolute right-0 top-11 z-30 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-300/30 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40"
        >
          <div className="mb-3 rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 dark:border-slate-700/80 dark:bg-slate-950/70">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Usuario</p>
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{username ?? "Invitado"}</p>
          </div>

          <div className="flex flex-col gap-2">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "inline-flex h-10 items-center rounded-xl border px-3 text-sm font-medium transition",
                    isActive
                      ? "border-sky-600 bg-sky-600 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}

            <ThemeToggle className="w-full justify-start rounded-xl px-3 text-sm" />
            <Button
              type="button"
              variant="secondary"
              loading={loggingOut}
              loadingText="Saliendo..."
              className="h-10 justify-start rounded-xl px-3 text-sm"
              onClick={() => void onLogout()}
            >
              Cerrar sesión
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
