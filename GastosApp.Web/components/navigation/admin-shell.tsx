"use client";

import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { csrfFetch } from "@/lib/security/csrf-client";
import { AdminNavigation } from "./admin-navigation";
import { AdminSession } from "./admin-session";
import { AdminUserMenu } from "./admin-user-menu";
import { MobileNavigationDrawer } from "./mobile-navigation-drawer";
import { PageHeader } from "./page-header";
import { useMobileNavigation } from "./use-mobile-navigation";

type AdminShellProps = { username: string; section: string; title: string; subtitle?: string; meta?: ReactNode; actions?: ReactNode; children: ReactNode };

const sidebarStorageKey = "gastosapp:shell-sidebar-compact";

export function AdminShell({ username, section, title, subtitle, meta, actions, children }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [compactSidebar, setCompactSidebar] = useState(false);
  const { mobileOpen, setMobileOpen, closeRef, triggerRef, drawerRef } = useMobileNavigation();

  useEffect(() => {
    setCompactSidebar(window.localStorage.getItem(sidebarStorageKey) === "true");
  }, []);

  function toggleSidebar() {
    setCompactSidebar((compact) => {
      const nextCompact = !compact;
      window.localStorage.setItem(sidebarStorageKey, String(nextCompact));
      return nextCompact;
    });
  }

  async function onLogout() {
    setLoggingOut(true);
    try { await csrfFetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }
    finally { setLoggingOut(false); }
  }

  const logout = () => void onLogout();
  const closeMobileNavigation = () => setMobileOpen(false);

  return <main className="app-page"><div className="tabler-shell flex gap-0 lg:gap-[var(--shell-content-gap)]">
    <aside id="desktop-navigation-sidebar" className={`shell-sidebar-transition sticky top-0 hidden h-dvh shrink-0 p-2 transition-[width] lg:block ${compactSidebar ? "shell-sidebar-compact" : "w-[var(--shell-sidebar-width)]"}`}><Card className="app-sidebar flex h-full flex-col rounded-[var(--radius-lg)] p-0"><div className="shell-sidebar-header flex flex-col gap-3 border-b px-4 py-4"><div className="shell-sidebar-brand flex items-center gap-2"><span className="shell-brand-mark inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-sm font-black tracking-[-0.12em]">AM</span><p className="shell-brand-copy text-muted text-[var(--type-shell-kicker)] font-semibold uppercase tracking-[0.2em]">Amitzi Finance</p></div><div className="shell-sidebar-tools flex items-center justify-between gap-3"><p className="shell-brand-subtitle min-w-0 text-xs text-muted">Control financiero personal</p><Button type="button" variant="ghost" className="shell-control hidden shrink-0 p-0 lg:inline-flex" onClick={toggleSidebar} aria-label={compactSidebar ? "Expandir barra lateral" : "Compactar barra lateral"} aria-expanded={!compactSidebar} aria-controls="desktop-navigation-sidebar" title={compactSidebar ? "Expandir barra lateral" : "Compactar barra lateral"}>{compactSidebar ? <PanelLeftOpen className="h-5 w-5" aria-hidden="true" /> : <PanelLeftClose className="h-5 w-5" aria-hidden="true" />}</Button></div></div><div className="flex-1 p-3"><AdminNavigation pathname={pathname} compact={compactSidebar} /></div><div className="m-3 mt-auto"><AdminSession username={username} loggingOut={loggingOut} onLogout={logout} compact={compactSidebar} /></div></Card></aside>
    <div className="min-w-0 flex-1 space-y-4 p-2 md:space-y-5"><header className="shell-topbar flex items-center justify-between gap-3 p-3 sm:p-4"><div className="flex min-w-0 items-center gap-3"><Button ref={triggerRef} type="button" variant="ghost" className="shell-control p-0 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menú" aria-expanded={mobileOpen} aria-controls="mobile-navigation-drawer"><Menu className="h-5 w-5" aria-hidden="true" /></Button><div className="min-w-0"><p className="shell-workspace-meta">Amitzi Finance · Workspace</p><p className="shell-workspace truncate">Control financiero personal</p></div></div><AdminUserMenu username={username} loggingOut={loggingOut} onLogout={logout} /></header><PageHeader section={section} title={title} subtitle={subtitle} meta={meta} actions={actions} />{children}</div>
  </div>{mobileOpen ? <MobileNavigationDrawer pathname={pathname} username={username} loggingOut={loggingOut} onLogout={logout} onClose={closeMobileNavigation} closeRef={closeRef} drawerRef={drawerRef} /> : null}</main>;
}
