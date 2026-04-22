import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  historyMonth: string;
  onHistoryMonthChange: (month: string) => void;
  onReload: () => void;
  historyLoading: boolean;
  historyError: string | null;
  successMessage: string | null;
  historyColumns: ColumnDef<any>[];
  transferColumns: ColumnDef<any>[];
  regularHistoryItems: any[];
  transferGroups: any[];
};

export function HistoryPanel({
  historyMonth,
  onHistoryMonthChange,
  onReload,
  historyLoading,
  historyError,
  successMessage,
  historyColumns,
  transferColumns,
  regularHistoryItems,
  transferGroups
}: Props) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:max-w-xs">
        <Input label="Mes" type="month" value={historyMonth} onChange={(event) => onHistoryMonthChange(event.target.value)} />
        <Button
          type="button"
          variant="secondary"
          className="h-9"
          loading={historyLoading}
          loadingText="Cargando..."
          onClick={onReload}
        >
          Recargar historial
        </Button>
      </div>

      {historyError ? <Alert variant="danger">{historyError}</Alert> : null}
      {successMessage ? <Alert variant="info">{successMessage}</Alert> : null}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Transacciones normales</h3>
        <DataGrid
          columns={historyColumns}
          rows={regularHistoryItems}
          mode="client"
          density="compact"
          loading={historyLoading}
          emptyMessage="No hay transacciones normales en este mes"
        />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Transferencias por grupo</h3>
        <DataGrid
          columns={transferColumns}
          rows={transferGroups}
          mode="client"
          density="compact"
          loading={historyLoading}
          emptyMessage="No hay transferencias en este mes"
        />
      </div>
    </div>
  );
}
