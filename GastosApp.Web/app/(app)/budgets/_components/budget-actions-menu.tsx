import { Pencil, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BudgetPeriodStatus } from "@/lib/contracts/budgets";
import { cn } from "@/lib/ui/cn";
import { tableActionBaseClass, tableActionStyles } from "@/lib/ui/table-action-styles";

type Props = {
  status: BudgetPeriodStatus;
  mobile?: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
};

export function BudgetActionsMenu({ status, mobile = false, onEdit, onToggleActive }: Props) {
  return (
    <div
      className={cn("flex justify-end gap-1.5", mobile && "grid grid-cols-2 gap-1.5")}
      role="group"
      aria-label={`Acciones para el presupuesto ${status.name}`}
    >
      <Button
        type="button"
        variant="ghost"
        className={cn(tableActionBaseClass, tableActionStyles.edit)}
        onClick={onEdit}
        aria-label={`Editar presupuesto ${status.name}`}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Editar</span>
      </Button>

      <Button
        type="button"
        variant="ghost"
        className={cn(tableActionBaseClass, status.active ? tableActionStyles.deactivate : tableActionStyles.activate)}
        onClick={onToggleActive}
        aria-label={`${status.active ? "Desactivar" : "Activar"} presupuesto ${status.name}`}
      >
        <Power className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{status.active ? "Desactivar" : "Activar"}</span>
      </Button>
    </div>
  );
}
