import { X } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { AdminNavigation } from "./admin-navigation";
import { AdminSession } from "./admin-session";

type MobileNavigationDrawerProps = {
  readonly pathname: string;
  readonly username: string;
  readonly loggingOut: boolean;
  readonly onLogout: () => void;
  readonly onClose: () => void;
  readonly closeRef: RefObject<HTMLButtonElement | null>;
  readonly drawerRef: RefObject<HTMLElement | null>;
};

export function MobileNavigationDrawer({ pathname, username, loggingOut, onLogout, onClose, closeRef, drawerRef }: MobileNavigationDrawerProps) {
  return <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navegación móvil administrativa"><button type="button" className="absolute inset-0 bg-[var(--color-overlay)]" onClick={onClose} aria-label="Cerrar menú" /><aside ref={drawerRef} id="mobile-navigation-drawer" className="shell-drawer app-sidebar relative h-full w-[min(21rem,88vw)] overflow-y-auto p-3 shadow-[var(--shadow-md)]"><div className="shell-sidebar-header flex flex-col gap-3 border-b pb-4"><div className="shell-sidebar-brand flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className="shell-brand-mark inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-sm font-black tracking-[-0.12em]">AM</span><p className="shell-brand-copy text-muted text-[11px] font-semibold uppercase tracking-[0.2em]">Amitzi Finance</p></div><Button ref={closeRef} type="button" variant="ghost" className="shell-control shrink-0 p-0" onClick={onClose} aria-label="Cerrar menú"><X className="h-5 w-5" aria-hidden="true" /></Button></div><p className="shell-brand-subtitle text-xs text-muted">Control financiero personal</p></div><AdminNavigation pathname={pathname} mobile onNavigate={onClose} /><div className="mt-6"><AdminSession username={username} loggingOut={loggingOut} onLogout={onLogout} /></div></aside></div>;
}
