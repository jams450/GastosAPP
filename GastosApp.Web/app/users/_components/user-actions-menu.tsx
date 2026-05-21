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
  const baseClass = mobile ? "h-8 rounded-lg px-2 text-[11px]" : "h-7 rounded-lg px-2 text-[11px]";

  return (
    <div className={cn("flex gap-1", mobile && "grid grid-cols-3 gap-1.5")}>
      <Button
        type="button"
        variant="secondary"
        className={cn(
          baseClass,
          "border border-slate-300 bg-slate-100 font-semibold text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
        )}
        onClick={() => onEdit(user)}
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
            ? "border border-amber-300 bg-amber-50 font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40"
            : "border border-emerald-300 bg-emerald-50 font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
        )}
        onClick={() => onToggleActive(user)}
      >
        <Power className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{user.active ? "Desactivar" : "Activar"}</span>
      </Button>

      <Button
        type="button"
        variant="danger"
        className={cn(
          baseClass,
          "border border-rose-400 bg-rose-500 font-semibold text-white hover:bg-rose-600 dark:border-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600"
        )}
        onClick={() => onDelete(user)}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Borrar</span>
      </Button>
    </div>
  );
}
