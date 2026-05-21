import type { AdminUser } from "@/lib/contracts/users-admin";
import { UserActionsMenu } from "./user-actions-menu";

type Props = {
  rows: AdminUser[];
  loading: boolean;
  onEdit: (user: AdminUser) => void;
  onToggleActive: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
};

export function UsersMobileList({ rows, loading, onEdit, onToggleActive, onDelete }: Props) {
  if (loading) {
    return (
      <div className="space-y-2.5 md:hidden">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="animate-pulse rounded-2xl border border-slate-200/80 bg-white/95 p-3 dark:border-slate-800 dark:bg-slate-950/95">
            <div className="h-3 w-28 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="mt-2 h-2.5 w-44 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="mt-3 h-8 rounded-lg bg-slate-200 dark:bg-slate-800" />
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/80 px-3 py-5 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
        No hay usuarios con filtros actuales.
      </div>
    );
  }

  return (
    <div className="space-y-2.5 md:hidden">
      {rows.map((user) => (
        <article key={user.userId} className="rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/95">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{user.name}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">{user.email}</p>
            <div className="flex items-center gap-2 pt-1">
              <span className={user.admin ? "text-xs font-medium text-indigo-700 dark:text-indigo-300" : "text-xs font-medium text-slate-700 dark:text-slate-300"}>
                {user.admin ? "Admin" : "Usuario"}
              </span>
              <span
                className={user.active
                  ? "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"}
              >
                {user.active ? "Activo" : "Inactivo"}
              </span>
            </div>
          </div>

          <div className="mt-3">
            <UserActionsMenu user={user} mobile onEdit={onEdit} onToggleActive={onToggleActive} onDelete={onDelete} />
          </div>
        </article>
      ))}
    </div>
  );
}
