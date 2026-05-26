import type { AdminUser } from "@/lib/contracts/users-admin";
import { AlertCircle, Inbox } from "lucide-react";
import { UserActionsMenu } from "./user-actions-menu";

type Props = {
  rows: AdminUser[];
  loading: boolean;
  errorMessage?: string | null;
  onEdit: (user: AdminUser) => void;
  onToggleActive: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
};

export function UsersMobileList({ rows, loading, errorMessage, onEdit, onToggleActive, onDelete }: Props) {
  if (loading) {
    return (
      <div className="space-y-2.5 md:hidden">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="tabler-card animate-pulse border-slate-300/90 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
            <div className="h-3 w-28 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="mt-2 h-2.5 w-44 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="mt-3 h-8 rounded-lg bg-slate-200 dark:bg-slate-800" />
          </div>
        ))}
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="tabler-card border-rose-300 bg-rose-50 p-4 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300 md:hidden">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold">Error al cargar usuarios</p>
            <p className="mt-1 text-xs font-medium">{errorMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="tabler-card border-dashed border-slate-300 bg-slate-50 px-3 py-8 text-center dark:border-slate-700 dark:bg-slate-900/40 md:hidden">
        <Inbox className="mx-auto h-6 w-6 text-slate-500 dark:text-slate-400" aria-hidden="true" />
        <p className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-200">Sin resultados</p>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">No hay usuarios con filtros actuales.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {rows.map((user) => (
        <article key={user.userId} className="tabler-card border-slate-300/90 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
          <header className="flex items-start justify-between gap-2 border-b border-slate-200/80 pb-2 dark:border-slate-800">
            <div>
              <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{user.name}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">{user.email}</p>
            </div>
            <p className="rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              ID #{user.userId}
            </p>
          </header>

          <div className="flex items-center gap-2 py-2">
            <span className="tabler-badge tabler-badge-muted tabler-badge-solid">{user.admin ? "Admin" : "Usuario"}</span>
            <span className={user.active ? "tabler-badge tabler-badge-success tabler-badge-solid" : "tabler-badge tabler-badge-danger tabler-badge-solid"}>{user.active ? "Activo" : "Inactivo"}</span>
          </div>

          <footer>
            <UserActionsMenu user={user} mobile onEdit={onEdit} onToggleActive={onToggleActive} onDelete={onDelete} />
          </footer>
        </article>
      ))}
    </div>
  );
}
