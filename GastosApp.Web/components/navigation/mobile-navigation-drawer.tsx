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
  return <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú principal"><button type="button" className="absolute inset-0 bg-[var(--color-overlay)]" onClick={onClose} aria-label="Cerrar menú" /><aside ref={drawerRef} id="mobile-navigation-drawer" className="shell-drawer app-sidebar relative h-full w-[min(21rem,88vw)] overflow-y-auto p-3 shadow-[var(--shadow-md)]"><div className="mb-4 flex items-center justify-between border-b border-strong px-2 pb-4"><div><p className="text-muted text-[11px] font-semibold uppercase tracking-[0.2em]">GastosApp</p><h2 className="text-lg font-semibold text-primary">Control Center</h2></div><Button ref={closeRef} type="button" variant="ghost" className="shell-control p-0" onClick={onClose} aria-label="Cerrar menú"><X className="h-5 w-5" aria-hidden="true" /></Button></div><AdminNavigation pathname={pathname} mobile onNavigate={onClose} /><div className="mt-6"><AdminSession username={username} loggingOut={loggingOut} onLogout={onLogout} /></div></aside></div>;
}
