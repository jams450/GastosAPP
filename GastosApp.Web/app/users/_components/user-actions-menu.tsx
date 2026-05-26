import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import type { AdminUser } from "@/lib/contracts/users-admin";
import { Pencil, Power, Trash2 } from "lucide-react";

type Props = {
  user: AdminUser;
  mobile?: boolean;
  onEdit: (user: AdminUser) => void;
  onToggleActive: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
};

export function UserActionsMenu({ user, mobile = false, onEdit, onToggleActive, onDelete }: Props) {
  const baseClass = mobile ? "h-9 rounded-lg px-2 text-[11px] font-bold" : "h-9 rounded-lg px-2 text-[11px] font-bold";

  return (
    <div className={cn("flex gap-1.5", mobile && "grid grid-cols-3 gap-1.5")} role="group" aria-label={`Acciones para ${user.email}`}>
      <Button
        type="button"
        variant="secondary"
        className={cn(baseClass, "border border-slate-400 bg-white text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800")}
        onClick={() => onEdit(user)}
        aria-label={`Editar usuario ${user.email}`}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Editar</span>
      </Button>

      <Button
        type="button"
        variant="ghost"
        className={cn(
          baseClass,
          user.active
            ? "border border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40"
            : "border border-emerald-400 bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
        )}
        onClick={() => onToggleActive(user)}
        aria-label={`${user.active ? "Desactivar" : "Activar"} usuario ${user.email}`}
      >
        <Power className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{user.active ? "Desactivar" : "Activar"}</span>
      </Button>

      <Button
        type="button"
        variant="danger"
        className={cn(baseClass, "border border-rose-600 bg-rose-600 text-white hover:bg-rose-700 dark:border-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600")}
        onClick={() => onDelete(user)}
        aria-label={`Borrar usuario ${user.email}`}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Borrar</span>
      </Button>
    </div>
  );
}
