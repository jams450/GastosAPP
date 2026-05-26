"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Home, Tags, Users, Wallet } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { csrfFetch } from "@/lib/security/csrf-client";
import { cn } from "@/lib/ui/cn";

type AppMenuProps = {
  username?: string;
  compact?: boolean;
};

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/accounts", label: "Cuentas", icon: Wallet },
  { href: "/transactions", label: "Transacciones", icon: ArrowLeftRight },
  { href: "/catalogs", label: "Catálogos", icon: Tags },
  { href: "/users", label: "Usuarios", icon: Users }
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
      await csrfFetch("/api/auth/logout", { method: "POST" });
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
    <div className="relative z-40">
      <div className="hidden items-center gap-3 md:flex">
        <nav className="flex items-center gap-2 border border-zinc-800 bg-black/95 p-2 shadow-[0_12px_34px_rgba(0,0,0,0.55)]">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center justify-center border px-3.5 font-semibold transition",
                  compact ? "h-8 text-xs" : "h-10 text-sm",
                  isActive
                    ? "border-zinc-500/60 bg-zinc-700 text-white shadow-[0_0_0_1px_rgba(113,113,122,0.45)]"
                    : "border-transparent text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100"
                )}
              >
                <Icon className={cn("mr-2 h-4 w-4 shrink-0", compact && "h-3.5 w-3.5")} aria-hidden="true" />
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
              "group gap-2 border border-zinc-700 bg-zinc-950 pr-2 text-zinc-200 shadow-[0_10px_30px_rgba(0,0,0,0.45)]",
              compact ? "h-9 pl-2.5 text-xs" : "h-11 pl-3 text-sm"
            )}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            onClick={() => setUserMenuOpen((value) => !value)}
          >
            <span className="inline-flex h-6 w-6 items-center justify-center bg-zinc-800 text-[10px] font-semibold text-zinc-100">{shortName}</span>
            <span className="max-w-28 truncate text-left text-xs font-semibold text-zinc-100 md:max-w-36">{username ?? "Usuario"}</span>
            <svg className={cn("h-4 w-4 text-zinc-400 transition-transform", userMenuOpen && "rotate-180")} viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 8l5 5 5-5" className="stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>

          {userMenuOpen ? (
            <div role="menu" className="absolute right-0 top-[calc(100%+0.6rem)] z-[90] w-64 border border-zinc-800 bg-black p-3 shadow-[0_18px_44px_rgba(0,0,0,0.65)]">
              <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Sesión activa</p>
                <p className="truncate text-sm font-semibold text-zinc-100">{username ?? "Usuario"}</p>
              </div>

              <div className="space-y-2">
                <ThemeToggle className="w-full justify-start rounded-lg px-3 text-sm" />
                <Button type="button" variant="secondary" loading={loggingOut} loadingText="Saliendo..." className="h-10 w-full justify-start rounded-lg px-3 text-sm" onClick={() => void onLogout()}>
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
          className="h-9 rounded-lg border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-100"
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
        <div id="mobile-nav-menu" className="absolute right-0 top-11 z-[90] w-72 rounded-xl border border-zinc-800 bg-black p-3 shadow-[0_18px_44px_rgba(0,0,0,0.65)]">
              <div className="mb-3 border border-zinc-800 bg-zinc-950 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Usuario</p>
            <p className="truncate text-sm font-semibold text-zinc-100">{username ?? "Invitado"}</p>
          </div>

          <div className="flex flex-col gap-2">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "inline-flex h-10 items-center rounded-lg border px-3 text-sm font-semibold transition",
                    isActive
                      ? "border-blue-500/40 bg-blue-600 text-white"
                      : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                  )}
                >
                  <Icon className="mr-2.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}

            <ThemeToggle className="h-10 w-full justify-start rounded-lg px-3 text-sm" />
            <Button type="button" variant="secondary" loading={loggingOut} loadingText="Saliendo..." className="h-10 w-full justify-start rounded-lg px-3 text-sm" onClick={() => void onLogout()}>
              Cerrar sesión
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
