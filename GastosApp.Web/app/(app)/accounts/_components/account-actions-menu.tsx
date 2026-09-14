import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import { tableActionBaseClass, tableActionStyles } from "@/lib/ui/table-action-styles";
import type { Account } from "@/lib/contracts/accounts";
import { Pencil, Power } from "lucide-react";

type Props = {
  account: Account;
  mobile?: boolean;
  onEdit: (account: Account) => void;
  onToggleActive: (account: Account) => void;
};

export function AccountActionsMenu({ account, mobile = false, onEdit, onToggleActive }: Props) {
  const baseClass = tableActionBaseClass;

  return (
    <div className={cn("flex justify-end gap-1.5", mobile && "grid grid-cols-2 gap-1.5")} role="group" aria-label={`Acciones para cuenta ${account.name}`}>
      <Button
        type="button"
        variant="ghost"
        className={cn(baseClass, tableActionStyles.edit)}
        onClick={() => onEdit(account)}
        aria-label={`Editar cuenta ${account.name}`}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Editar</span>
      </Button>

      <Button
        type="button"
        variant="ghost"
        className={cn(
          baseClass,
          account.active
            ? tableActionStyles.deactivate
            : tableActionStyles.activate
        )}
        onClick={() => onToggleActive(account)}
        aria-label={`${account.active ? "Desactivar" : "Activar"} cuenta ${account.name}`}
      >
        <Power className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{account.active ? "Desactivar" : "Activar"}</span>
      </Button>
    </div>
  );
}
