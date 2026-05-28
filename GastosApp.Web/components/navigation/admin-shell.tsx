"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { csrfFetch } from "@/lib/security/csrf-client";
import { cn } from "@/lib/ui/cn";
import { appNavItems, isRouteActive } from "./nav-config";

type AdminShellProps = {
  username: string;
  section: string;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

export function AdminShell({ username, section, title, subtitle, meta, actions, children }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const shortName = username.slice(0, 2).toUpperCase();

  async function onLogout() {
    setLoggingOut(true);
    try {
      await csrfFetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <main className="tabler-page">
      <div className="tabler-shell flex gap-0 lg:gap-5">
        <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 lg:block">
          <Card className="flex h-full flex-col rounded-none border-zinc-800/90 bg-black p-0 shadow-[0_16px_50px_rgba(0,0,0,0.7)]">
            <div className="border-b border-zinc-800 px-5 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">GastosApp</p>
              <h2 className="mt-1 text-lg font-semibold text-zinc-100">Control Center</h2>
            </div>

            <nav className="flex-1 space-y-1.5 p-3" aria-label="Navegación administrativa">
              {appNavItems.map((item) => {
                const isActive = isRouteActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <div key={item.href} className="space-y-1">
                    <Link
                      href={item.href}
                      className={cn(
                        "flex h-11 items-center border border-transparent px-3.5 text-sm font-semibold transition",
                        isActive
                          ? "rounded-md border-[#0F3158] bg-[#0F3158] text-white shadow-[0_0_0_1px_rgba(15,49,88,0.45)]"
                          : "text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100"
                      )}
                    >
                      <Icon className="mr-2.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      {item.label}
                    </Link>

                    {item.children ? (
                      <div className="space-y-1 pl-6">
                        {item.children.map((child) => {
                          const childActive = isRouteActive(pathname, child.href);
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={cn(
                                "flex h-9 items-center border border-transparent px-3 text-xs font-semibold transition",
                                childActive
                                  ? "rounded-md border-[#0F3158] bg-[#0F3158] text-white"
                                  : "text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200"
                              )}
                            >
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </nav>

            <div className="m-3 mt-auto border border-zinc-800 bg-zinc-950 p-3">
              <div className="mb-3 flex items-center gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center bg-zinc-800 text-xs font-semibold text-zinc-100">
                  {shortName}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-100">{username}</p>
                  <p className="text-[11px] text-zinc-400">Administrador</p>
                </div>
              </div>
              <div className="mb-2">
                <ThemeToggle className="w-full" />
              </div>
              <Button type="button" variant="secondary" loading={loggingOut} loadingText="Saliendo..." className="h-9 w-full" onClick={() => void onLogout()}>
                Cerrar sesión
              </Button>
            </div>
          </Card>
        </aside>

        <div className="min-w-0 flex-1 space-y-4 md:space-y-5">
          <Card className="mt-3 mr-2 p-0 sm:p-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">{section}</p>
                <h1 className="mt-1 pt-3 text-xl font-semibold tracking-tight text-zinc-100 md:text-2xl">{title}</h1>
                {subtitle ? <p className="mt-1 text-sm text-zinc-400">{subtitle}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                {meta ? <div className="hidden sm:block">{meta}</div> : null}
                <Button type="button" variant="secondary" className="h-10 px-3 lg:hidden" onClick={() => setMobileOpen((p) => !p)} aria-expanded={mobileOpen} aria-controls="admin-mobile-nav">
                  Menú
                </Button>
              </div>
            </div>

            {mobileOpen ? (
              <div id="admin-mobile-nav" className="mt-4 space-y-3 border border-zinc-800 bg-black p-3 lg:hidden">
                <nav className="grid gap-2 sm:grid-cols-2" aria-label="Navegación móvil administrativa">
                  {appNavItems.map((item) => {
                    const isActive = isRouteActive(pathname, item.href);
                    const Icon = item.icon;
                    return (
                      <div key={item.href} className="space-y-1">
                        <Link
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "flex h-10 items-center border px-3 text-sm font-semibold transition",
                            isActive
                              ? "rounded-md border-[#0F3158] bg-[#0F3158] text-white"
                              : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                          )}
                        >
                          <Icon className="mr-2.5 h-4 w-4 shrink-0" aria-hidden="true" />
                          {item.label}
                        </Link>

                        {item.children ? (
                          <div className="space-y-1 pl-4">
                            {item.children.map((child) => {
                              const childActive = isRouteActive(pathname, child.href);
                              return (
                                <Link
                                  key={child.href}
                                  href={child.href}
                                  onClick={() => setMobileOpen(false)}
                                  className={cn(
                                    "flex h-9 items-center border px-3 text-xs font-semibold transition",
                                    childActive
                                      ? "rounded-md border-[#0F3158] bg-[#0F3158] text-white"
                                      : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                                  )}
                                >
                                  {child.label}
                                </Link>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </nav>
                <ThemeToggle className="w-full" />
                <Button type="button" variant="secondary" loading={loggingOut} loadingText="Saliendo..." className="h-10 w-full justify-start" onClick={() => void onLogout()}>
                  Cerrar sesión
                </Button>
              </div>
            ) : null}

            {actions ? <div className="mt-4">{actions}</div> : null}
          </Card>

          <div>{children}</div>
        </div>
      </div>
    </main>
  );
}
