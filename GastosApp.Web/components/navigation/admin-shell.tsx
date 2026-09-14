"use client";

import { Menu } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { csrfFetch } from "@/lib/security/csrf-client";
import { AdminNavigation } from "./admin-navigation";
import { AdminSession } from "./admin-session";
import { AdminUserMenu } from "./admin-user-menu";
import { MobileNavigationDrawer } from "./mobile-navigation-drawer";
import { useMobileNavigation } from "./use-mobile-navigation";

type AdminShellProps = { username: string; section: string; title: string; subtitle?: string; meta?: ReactNode; actions?: ReactNode; children: ReactNode };

export function AdminShell({ username, section, title, subtitle, meta, actions, children }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const { mobileOpen, setMobileOpen, closeRef, triggerRef, drawerRef } = useMobileNavigation();

  async function onLogout() {
    setLoggingOut(true);
    try { await csrfFetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }
    finally { setLoggingOut(false); }
  }

  const logout = () => void onLogout();
  const closeMobileNavigation = () => setMobileOpen(false);

  return <main className="app-page"><div className="tabler-shell flex gap-0 lg:gap-5">
    <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 p-2 lg:block"><Card className="app-sidebar flex h-full flex-col rounded-2xl p-0"><div className="border-b border-strong px-5 py-5"><p className="text-muted text-[11px] font-semibold uppercase tracking-[0.2em]">GastosApp</p><h2 className="mt-1 text-lg font-semibold text-primary">Control Center</h2></div><div className="flex-1 p-3"><AdminNavigation pathname={pathname} /></div><div className="m-3 mt-auto"><AdminSession username={username} loggingOut={loggingOut} onLogout={logout} /></div></Card></aside>
    <div className="min-w-0 flex-1 space-y-4 p-2 md:space-y-5"><header className="app-card flex items-center justify-between gap-3 p-3 sm:p-4"><div className="flex items-center gap-3"><Button ref={triggerRef} type="button" variant="ghost" className="h-10 w-10 p-0 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menú" aria-expanded={mobileOpen} aria-controls="mobile-navigation-drawer"><Menu className="h-5 w-5" aria-hidden="true" /></Button><div><p className="text-muted text-[11px] font-semibold uppercase tracking-[0.16em]">{section}</p><h1 className="mt-1 text-xl font-semibold tracking-tight text-primary md:text-2xl">{title}</h1>{subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}</div></div><div className="flex items-center gap-2">{meta ? <div className="hidden sm:block">{meta}</div> : null}<AdminUserMenu username={username} loggingOut={loggingOut} onLogout={logout} />{actions}</div></header>{children}</div>
  </div>{mobileOpen ? <MobileNavigationDrawer pathname={pathname} username={username} loggingOut={loggingOut} onLogout={logout} onClose={closeMobileNavigation} closeRef={closeRef} drawerRef={drawerRef} /> : null}</main>;
}
