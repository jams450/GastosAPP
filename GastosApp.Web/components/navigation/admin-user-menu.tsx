import { ChevronDown, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type AdminUserMenuProps = {
  readonly username: string;
  readonly loggingOut: boolean;
  readonly onLogout: () => void;
};

export function AdminUserMenu({ username, loggingOut, onLogout }: AdminUserMenuProps) {
  const [userOpen, setUserOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userTriggerRef = useRef<HTMLButtonElement>(null);
  const shortName = username.slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!userOpen) return;
    const onDocumentClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !userMenuRef.current?.contains(event.target)) setUserOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUserOpen(false);
        userTriggerRef.current?.focus();
      }
    };
    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocumentClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [userOpen]);

  return <div ref={userMenuRef} className="relative hidden sm:block"><button ref={userTriggerRef} type="button" className="shell-control flex items-center gap-2 rounded-[var(--radius-sm)] px-1.5 text-left transition-colors hover:bg-[var(--color-shell-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-focus)]" onClick={() => setUserOpen((open) => !open)} aria-expanded={userOpen} aria-haspopup="menu"><span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent)] text-xs font-bold text-white">{shortName}</span><span className="max-w-28 truncate text-sm font-semibold text-primary">{username}</span><ChevronDown className="h-4 w-4 text-muted" aria-hidden="true" /></button>{userOpen ? <div className="absolute right-0 z-30 mt-2 w-48 rounded-xl border border-strong bg-[var(--color-surface-1)] p-2 shadow-[var(--shadow-md)]" role="menu"><p className="px-2 py-1 text-xs text-muted">Sesión activa</p><Button type="button" role="menuitem" variant="ghost" className="w-full justify-start" loading={loggingOut} onClick={onLogout}><LogOut className="h-4 w-4" aria-hidden="true" />Cerrar sesión</Button></div> : null}</div>;
}
