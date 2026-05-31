import { formatCurrency } from "@/lib/format/currency";
import type { CreditOpenInstallmentItem } from "@/lib/contracts/transactions";
import { Button } from "@/components/ui/button";

export type AllocationMode = "byAmount" | "bySelection";

type Props = {
  items: CreditOpenInstallmentItem[];
  loading: boolean;
  error: string | null;
  mode: AllocationMode;
  onModeChange: (mode: AllocationMode) => void;
  selectedByInstallment: Record<number, string>;
  onSelectedAmountChange: (installmentId: number, value: string) => void;
  enteredAmount: string;
  selectedTotal: number;
  onAutoDistributeFromAmount: () => void;
  onUseSelectedAsAmount: () => void;
  onClear: () => void;
};

export function CreditAllocationSelector({
  items,
  loading,
  error,
  mode,
  onModeChange,
  selectedByInstallment,
  onSelectedAmountChange,
  enteredAmount,
  selectedTotal,
  onAutoDistributeFromAmount,
  onUseSelectedAsAmount,
  onClear
}: Props) {
  return (
    <section className="space-y-3 rounded-2xl border border-indigo-300/75 bg-indigo-200/45 p-4 dark:border-indigo-800/70 dark:bg-indigo-900/45">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Pago crédito</p>
          <p className="text-xs text-indigo-800 dark:text-indigo-200">Selecciona mensualidades y monto total/parcial a cubrir.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="ghost"
              className={mode === "byAmount"
                ? "h-8 border border-blue-400/65 bg-blue-500/25 px-2 text-xs font-semibold text-blue-800 dark:border-blue-600/70 dark:bg-blue-500/35 dark:text-blue-100"
                : "h-8 border border-blue-300/45 bg-blue-500/12 px-2 text-xs font-semibold text-blue-700 hover:border-blue-400/65 hover:bg-blue-500/22 dark:border-blue-700/60 dark:bg-blue-500/20 dark:text-blue-300 dark:hover:bg-blue-500/30"}
              onClick={() => onModeChange("byAmount")}
            >
              Primero monto
            </Button>

            <Button
              type="button"
              variant="ghost"
              className={mode === "bySelection"
                ? "h-8 border border-purple-400/65 bg-purple-500/25 px-2 text-xs font-semibold text-purple-800 dark:border-purple-600/70 dark:bg-purple-500/35 dark:text-purple-100"
                : "h-8 border border-purple-300/45 bg-purple-500/12 px-2 text-xs font-semibold text-purple-700 hover:border-purple-400/65 hover:bg-purple-500/22 dark:border-purple-700/60 dark:bg-purple-500/20 dark:text-purple-300 dark:hover:bg-purple-500/30"}
              onClick={() => onModeChange("bySelection")}
            >
              Primero cargos
            </Button>

        </div>
      </div>

      {loading ? <p className="text-xs text-slate-600 dark:text-slate-400">Cargando mensualidades pendientes...</p> : null}
      {error ? <p className="text-xs font-medium text-rose-700 dark:text-rose-300">{error}</p> : null}

      {!loading && !error && items.length === 0 ? (
        <p className="text-xs text-slate-600 dark:text-slate-400">Sin mensualidades abiertas en esta cuenta crédito.</p>
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" className="h-7 border border-rose-300/50 bg-rose-500/12 px-2 text-xs font-semibold text-rose-700 hover:border-rose-400/65 hover:bg-rose-500/22 dark:border-rose-700/60 dark:bg-rose-500/20 dark:text-rose-300 dark:hover:bg-rose-500/30" onClick={onAutoDistributeFromAmount}>
              Auto distribuir desde monto
            </Button>
            <Button type="button" variant="ghost" className="h-7 border border-red-300/50 bg-red-500/12 px-2 text-xs font-semibold text-red-700 hover:border-red-400/65 hover:bg-red-500/22 dark:border-red-700/60 dark:bg-red-500/20 dark:text-red-300 dark:hover:bg-red-500/30" onClick={onUseSelectedAsAmount}>
              Usar total seleccionado
            </Button>
            <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={onClear}>
              Limpiar selección
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <tr>
                  <th className="px-2 py-2 text-left font-semibold">Cargo</th>
                  <th className="px-2 py-2 text-left font-semibold">Vence</th>
                  <th className="px-2 py-2 text-left font-semibold">Pendiente</th>
                  <th className="px-2 py-2 text-left font-semibold">Aplicar pago</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const selected = selectedByInstallment[item.installmentId] ?? "";
                  return (
                    <tr key={item.installmentId} className="border-t border-slate-200 dark:border-slate-800">
                      <td className="px-2 py-2 text-slate-700 dark:text-slate-300">
                        <p className="font-medium">{item.description || `Cargo #${item.sourceTransactionId}`}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {item.planType === "MSI" ? `MSI ${item.installmentNumber}/${item.months}` : "Normal"}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-slate-600 dark:text-slate-400">{new Date(item.dueDate).toLocaleDateString("es-MX")}</td>
                      <td className="px-2 py-2 font-medium text-slate-800 dark:text-slate-200">{formatCurrency(item.remainingAmount)}</td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          max={item.remainingAmount}
                          value={selected}
                          onChange={(event) => onSelectedAmountChange(item.installmentId, event.target.value)}
                          className="h-8 w-28 rounded-lg border border-slate-300 bg-white px-2 text-right text-xs text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          placeholder="0.00"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-1 rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-950">
            <p className="text-slate-600 dark:text-slate-400">Monto captura: <span className="font-semibold text-slate-900 dark:text-slate-100">{enteredAmount ? formatCurrency(Number(enteredAmount) || 0) : "—"}</span></p>
            <p className="text-slate-600 dark:text-slate-400">Total seleccionado: <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(selectedTotal)}</span></p>
            <p className="text-slate-600 dark:text-slate-400">
              Diferencia: <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency((Number(enteredAmount) || 0) - selectedTotal)}</span>
            </p>
          </div>
        </>
      ) : null}
    </section>
  );
}
