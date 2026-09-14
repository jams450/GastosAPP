import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";

type AdminSessionProps = {
  readonly username: string;
  readonly loggingOut: boolean;
  readonly onLogout: () => void;
};

export function AdminSession({ username, loggingOut, onLogout }: AdminSessionProps) {
  const shortName = username.slice(0, 2).toUpperCase();

  return <section className="shell-session space-y-3 rounded-[var(--radius-md)] p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Sesión activa</p><div className="flex items-center gap-3"><span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-accent)] text-xs font-bold text-white">{shortName}</span><div className="min-w-0"><p className="truncate text-sm font-semibold text-primary">{username}</p><p className="text-[11px] text-muted">Administrador</p></div></div><ThemeToggle className="w-full" /><Button type="button" variant="ghost" loading={loggingOut} loadingText="Saliendo..." className="w-full" onClick={onLogout}><LogOut className="h-4 w-4" aria-hidden="true" />Cerrar sesión</Button></section>;
}
