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

type AppShellProps = {
  readonly username: string;
  readonly children: ReactNode;
};

export function AppShell({ username, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const { mobileOpen, setMobileOpen, closeRef, triggerRef, drawerRef } = useMobileNavigation();

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

  const logout = () => void onLogout();
  const closeMobileNavigation = () => setMobileOpen(false);

  return <main className="app-page"><div className="tabler-shell flex gap-0 lg:gap-[var(--shell-content-gap)]">
     <aside className="sticky top-0 hidden h-dvh w-[var(--shell-sidebar-width)] shrink-0 p-3 lg:block"><Card className="app-sidebar flex h-full flex-col rounded-[var(--radius-lg)] p-0"><div className="border-b border-strong px-5 py-5"><p className="text-muted text-[var(--type-shell-kicker)] font-semibold uppercase tracking-[0.2em]">GastosApp</p><h2 className="mt-1 text-[var(--type-shell-title)] font-semibold text-primary">Control Center</h2><p className="mt-1 text-xs text-muted">Finanzas personales</p></div><div className="flex-1 p-3"><AdminNavigation pathname={pathname} /></div><div className="m-3 mt-auto"><AdminSession username={username} loggingOut={loggingOut} onLogout={logout} /></div></Card></aside>
     <div className="min-w-0 flex-1 space-y-4 p-3 md:space-y-5 md:p-4"><header className="shell-topbar flex min-h-14 items-center justify-between gap-3 px-3 py-2 sm:px-4"><Button ref={triggerRef} type="button" variant="ghost" className="shell-control p-0 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menú" aria-expanded={mobileOpen} aria-controls="mobile-navigation-drawer"><Menu className="h-5 w-5" aria-hidden="true" /></Button><span className="hidden text-xs font-medium text-muted lg:block">Espacio financiero</span><AdminUserMenu username={username} loggingOut={loggingOut} onLogout={logout} /></header>{children}</div>
   </div>{mobileOpen ? <MobileNavigationDrawer pathname={pathname} username={username} loggingOut={loggingOut} onLogout={logout} onClose={closeMobileNavigation} closeRef={closeRef} drawerRef={drawerRef} /> : null}</main>;
}
