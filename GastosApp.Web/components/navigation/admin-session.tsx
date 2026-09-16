import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";

type AdminSessionProps = {
  readonly username: string;
  readonly loggingOut: boolean;
  readonly onLogout: () => void;
  readonly compact?: boolean;
};

export function AdminSession({ username, loggingOut, onLogout, compact = false }: AdminSessionProps) {
  const shortName = username.slice(0, 2).toUpperCase();
  const avatar = <span className={`inline-flex ${compact ? "h-10 w-10" : "h-9 w-9"} items-center justify-center rounded-lg bg-[var(--color-accent)] text-xs font-bold text-white`} aria-label={`Usuario ${username}`}>{shortName}</span>;

  if (compact) {
    /* Compact rail: icon-only stack. Logout keeps an empty loadingText so the
       44px control shows the spinner without pushing text out of the rail. */
    return <section className="shell-session flex flex-col items-center gap-2 rounded-[var(--radius-md)] p-2" aria-label="Cuenta Amitzi">{avatar}<ThemeToggle compact className="shell-control p-0" /><Button type="button" variant="ghost" loading={loggingOut} loadingText="" className="shell-control p-0" onClick={onLogout} aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut className="h-4 w-4" aria-hidden="true" /></Button></section>;
  }

  return <section className="shell-session space-y-3 rounded-[var(--radius-md)] p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Cuenta Amitzi</p><div className="flex items-center gap-3">{avatar}<div className="min-w-0"><p className="truncate text-sm font-semibold text-primary">{username}</p><p className="text-[11px] text-muted">Administrador</p></div></div><div className="space-y-3"><ThemeToggle className="w-full" /><Button type="button" variant="ghost" loading={loggingOut} loadingText="Saliendo..." className="w-full" onClick={onLogout} aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut className="h-4 w-4" aria-hidden="true" />Cerrar sesión</Button></div></section>;
}
