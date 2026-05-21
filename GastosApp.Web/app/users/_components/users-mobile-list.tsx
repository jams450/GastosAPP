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
    return <p className="px-1 py-4 text-sm text-slate-500 dark:text-slate-400">Cargando usuarios...</p>;
  }

  if (rows.length === 0) {
    return <p className="px-1 py-4 text-sm text-slate-500 dark:text-slate-400">No hay usuarios</p>;
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
