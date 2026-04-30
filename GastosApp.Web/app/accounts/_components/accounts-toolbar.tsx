import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  search: string;
  status: "all" | "active" | "inactive";
  type: "all" | "credit" | "cash";
  onSearchChange: (value: string) => void;
  onStatusChange: (value: "all" | "active" | "inactive") => void;
  onTypeChange: (value: "all" | "credit" | "cash") => void;
  onCreate: () => void;
};

export function AccountsToolbar({ search, status, type, onSearchChange, onStatusChange, onTypeChange, onCreate }: Props) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Filtros de cuentas</h2>
        <Button type="button" onClick={onCreate}>Nueva cuenta</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Input label="Buscar" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Nombre de cuenta" />

        <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
          Estado
          <select
            value={status}
            onChange={(event) => onStatusChange(event.target.value as "all" | "active" | "inactive")}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="all">Todas</option>
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
          </select>
        </label>

        <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
          Tipo
          <select
            value={type}
            onChange={(event) => onTypeChange(event.target.value as "all" | "credit" | "cash")}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="all">Todos</option>
            <option value="credit">Crédito</option>
            <option value="cash">Efectivo</option>
          </select>
        </label>
      </div>
    </div>
  );
}
