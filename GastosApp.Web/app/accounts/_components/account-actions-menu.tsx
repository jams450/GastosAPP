import { Button } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";
import type { Account } from "@/lib/contracts/accounts";
import { Pencil, Power } from "lucide-react";

type Props = {
  account: Account;
  mobile?: boolean;
  onEdit: (account: Account) => void;
  onToggleActive: (account: Account) => void;
};

export function AccountActionsMenu({ account, mobile = false, onEdit, onToggleActive }: Props) {
  const baseClass = "h-8 border px-2 text-[11px] font-semibold";

  return (
    <div className={cn("flex justify-end gap-1.5", mobile && "grid grid-cols-2 gap-1.5")} role="group" aria-label={`Acciones para cuenta ${account.name}`}>
      <Button
        type="button"
        variant="ghost"
        className={cn(baseClass, "border-[#0F3158] bg-[#0F3158]/20 text-blue-200 hover:border-[#144277] hover:bg-[#144277]/25")}
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
            ? "border-amber-400/50 bg-amber-500/15 text-amber-200 hover:border-amber-300/70 hover:bg-amber-500/25"
            : "border-emerald-400/50 bg-emerald-500/15 text-emerald-200 hover:border-emerald-300/70 hover:bg-emerald-500/25"
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
