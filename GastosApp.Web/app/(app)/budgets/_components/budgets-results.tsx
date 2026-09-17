import { Plus, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tableActionStyles } from "@/lib/ui/table-action-styles";
import type { BudgetCatalogIndex } from "../_lib/budgets-ui";
import type { BudgetRow } from "../_hooks/use-budgets-admin";
import { BudgetsMobileList } from "./budgets-mobile-list";
import { BudgetsTable } from "./budgets-table";

type Props = {
  rows: BudgetRow[];
  loading: boolean;
  errorMessage?: string | null;
  catalogs: BudgetCatalogIndex;
  onCreate: () => void;
  onEdit: (row: BudgetRow) => void;
  onToggleActive: (row: BudgetRow) => void;
};

export function BudgetsResults({ rows, loading, errorMessage, catalogs, onCreate, onEdit, onToggleActive }: Props) {
  const isEmpty = !loading && !errorMessage && rows.length === 0;

  if (isEmpty) {
    return (
      <section className="app-panel flex flex-col items-center gap-3 border-dashed px-6 py-12 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <WalletCards className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <h2 className="m-0 text-base font-semibold text-primary">Sin presupuestos en este periodo</h2>
          <p className="m-0 max-w-md text-sm text-muted">
            Crea un límite por categoría o subcategoría para seguir el gasto del mes y disparar alertas por Telegram al cruzar tus umbrales.
          </p>
        </div>
        <Button type="button" variant="ghost" className={`h-9 rounded-none px-3 text-xs font-bold ${tableActionStyles.create}`} onClick={onCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Nuevo presupuesto
        </Button>
      </section>
    );
  }

  return (
    <section aria-busy={loading}>
      <BudgetsMobileList rows={rows} loading={loading} errorMessage={errorMessage} catalogs={catalogs} onEdit={onEdit} onToggleActive={onToggleActive} />
      <div className="hidden md:block">
        <BudgetsTable rows={rows} loading={loading} errorMessage={errorMessage} catalogs={catalogs} onEdit={onEdit} onToggleActive={onToggleActive} />
      </div>
    </section>
  );
}
