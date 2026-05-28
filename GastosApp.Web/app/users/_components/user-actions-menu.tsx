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
  const baseClass = "h-8 border px-2 text-[11px] font-semibold";

  return (
    <div className={cn("flex justify-end gap-1.5", mobile && "grid grid-cols-3 gap-1.5")} role="group" aria-label={`Acciones para ${user.email}`}>
      <Button
        type="button"
        variant="ghost"
        className={cn(
          baseClass,
          "border-[#0F3158] bg-[#0F3158]/20 text-blue-200 hover:border-[#144277] hover:bg-[#144277]/25"
        )}
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
            ? "border-amber-400/50 bg-amber-500/15 text-amber-200 hover:border-amber-300/70 hover:bg-amber-500/25"
            : "border-emerald-400/50 bg-emerald-500/15 text-emerald-200 hover:border-emerald-300/70 hover:bg-emerald-500/25"
        )}
        onClick={() => onToggleActive(user)}
        aria-label={`${user.active ? "Desactivar" : "Activar"} usuario ${user.email}`}
      >
        <Power className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{user.active ? "Desactivar" : "Activar"}</span>
      </Button>

      <Button
        type="button"
        variant="ghost"
        className={cn(
          baseClass,
          "border-rose-400/50 bg-rose-500/15 text-rose-200 hover:border-rose-300/70 hover:bg-rose-500/25"
        )}
        onClick={() => onDelete(user)}
        aria-label={`Borrar usuario ${user.email}`}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Borrar</span>
      </Button>
    </div>
  );
}
