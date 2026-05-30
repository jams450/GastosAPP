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
    <main className="app-page">
      <div className="tabler-shell flex gap-0 lg:gap-5">
        <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 lg:block">
          <Card className="app-sidebar flex h-full flex-col rounded-none border p-0">
            <div className="border-b border-strong px-5 py-5">
              <p className="text-muted text-[11px] font-semibold uppercase tracking-[0.2em]">GastosApp</p>
              <h2 className="text-primary mt-1 text-lg font-semibold">Control Center</h2>
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
                        "flex h-11 items-center rounded-md border border-transparent px-3.5 text-sm font-semibold transition",
                        isActive
                          ? "tabler-badge tabler-badge-solid tabler-badge-primary border-blue-300/60 bg-blue-500/30 text-[11px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300 shadow-[0_0_0_1px_rgba(59,130,246,0.45)]"
                          : "text-secondary hover:tabler-badge hover:tabler-badge-solid hover:tabler-badge-primary hover:border-blue-300/60 hover:bg-blue-500/25 hover:text-blue-50"
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
                                "flex h-9 items-center rounded-md border border-transparent px-3 text-xs font-semibold transition",
                                childActive
                                  ? "tabler-badge tabler-badge-solid tabler-badge-primary border-blue-300/60 bg-blue-500/30 text-[11px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300"
                                  : "text-muted hover:tabler-badge hover:tabler-badge-solid hover:tabler-badge-primary hover:border-blue-300/60 hover:bg-blue-500/25 hover:text-blue-50"
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

            <section className="m-3 mt-auto space-y-3 rounded-2xl border border-blue-200/50 bg-blue-50/30 p-3 dark:border-blue-900/40 dark:bg-blue-950/20">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Sesión activa</p>
              <div className="flex items-center gap-3 rounded-xl border border-blue-200/40 bg-blue-50/35 px-3 py-2 dark:border-blue-900/40 dark:bg-blue-950/30">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-300/50 bg-blue-500/20 text-xs font-semibold text-blue-800 dark:border-blue-700/60 dark:bg-blue-500/30 dark:text-blue-100">
                  {shortName}
                </span>
                <div className="min-w-0">
                  <p className="text-primary truncate text-sm font-semibold">{username}</p>
                  <p className="text-[11px] text-blue-700/80 dark:text-blue-200/90">Administrador</p>
                </div>
              </div>
                  <ThemeToggle className="w-full rounded-xl border-blue-300/50 bg-blue-500/15 text-blue-800 hover:border-blue-400/70 hover:bg-blue-500/30 hover:text-blue-900 dark:border-blue-700/60 dark:bg-blue-500/25 dark:text-blue-100 dark:hover:border-blue-500/70 dark:hover:bg-blue-500/35 dark:hover:text-blue-50" />

              <Button type="button" variant="secondary" loading={loggingOut} loadingText="Saliendo..." className="h-9 w-full rounded-xl border-blue-300/50 bg-blue-500/15 text-blue-800 hover:border-blue-400/70 hover:bg-blue-500/30 hover:text-blue-900 dark:border-blue-700/60 dark:bg-blue-500/25 dark:text-blue-100 dark:hover:border-blue-500/70 dark:hover:bg-blue-500/35 dark:hover:text-blue-50" onClick={() => void onLogout()}>
                Cerrar sesión
              </Button>
            </section>
          </Card>
        </aside>

        <div className="min-w-0 flex-1 space-y-4 p-2 md:space-y-5">
          <Card className="mr-2 p-0 sm:p-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-muted text-[11px] font-semibold uppercase tracking-[0.16em]">{section}</p>
                <h1 className="text-primary mt-1 text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
                {subtitle ? <p className="text-muted mt-1 text-sm">{subtitle}</p> : null}
              </div>
              {meta ? <div className="hidden sm:block">{meta}</div> : null}
            </div>

            {mobileOpen ? (
              <div id="admin-mobile-nav" className="app-sidebar mt-4 space-y-3 border p-3 lg:hidden">
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
                            "flex h-10 items-center rounded-md border px-3 text-sm font-semibold transition",
                            isActive
                              ? "border-accent bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
                              : "border-default bg-[var(--color-surface-2)] text-secondary hover:border-accent hover:bg-[var(--color-accent-soft)] hover:text-primary"
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
                                    "flex h-9 items-center rounded-md border px-3 text-xs font-semibold transition",
                                    childActive
                                      ? "border-accent bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
                                      : "border-default bg-[var(--color-surface-2)] text-muted hover:border-accent hover:bg-[var(--color-accent-soft)] hover:text-primary"
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
                <section className="space-y-2 rounded-2xl border border-blue-200/50 bg-blue-50/30 p-2 dark:border-blue-900/40 dark:bg-blue-950/20">
                  <ThemeToggle className="w-full rounded-xl border-blue-300/50 bg-blue-500/15 text-blue-800 hover:border-blue-400/70 hover:bg-blue-500/30 hover:text-blue-900 dark:border-blue-700/60 dark:bg-blue-500/25 dark:text-blue-100 dark:hover:border-blue-500/70 dark:hover:bg-blue-500/35 dark:hover:text-blue-50" />


                  <Button type="button" variant="secondary" loading={loggingOut} loadingText="Saliendo..." className="h-10 w-full justify-start rounded-xl border-blue-300/50 bg-blue-500/15 text-blue-800 hover:border-blue-400/70 hover:bg-blue-500/30 hover:text-blue-900 dark:border-blue-700/60 dark:bg-blue-500/25 dark:text-blue-100 dark:hover:border-blue-500/70 dark:hover:bg-blue-500/35 dark:hover:text-blue-50" onClick={() => void onLogout()}>
                    Cerrar sesión
                  </Button>
                </section>
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
