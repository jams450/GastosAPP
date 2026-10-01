import type { BudgetUsageStatus } from "@/lib/contracts/budgets";
import { cn } from "@/lib/ui/cn";
import { buildBudgetComposition, buildBudgetBreakdown } from "../_lib/budget-items-model";
import { budgetMeterClass, clampPercent, formatPercent } from "../_lib/budgets-ui";

type Props = {
  /** Campos del estado del periodo: se aceptan completos o el subconjunto heredado. */
  amountMxn: number;
  spent: number;
  committed?: number;
  projected?: number;
  status: BudgetUsageStatus;
};

/**
 * Barra de consumo en dos capas, distinguibles **sin color**:
 * la capa sólida es el gasto ejecutado y la capa rayada es lo comprometido, de modo que
 * la diferencia se percibe por textura y no solo por tono. La marca vertical indica la
 * proyección pendiente cuando `projected > 0`.
 *
 * El `aria-valuetext` enuncia el desglose explícito ("61% gastado, 15% comprometido, 76% total")
 * porque una sola cifra escondería que parte del consumo todavía no es dinero gastado.
 */
export function BudgetProgress({ amountMxn, spent, committed = 0, projected = 0, status }: Props) {
  const breakdown = buildBudgetBreakdown({ amountMxn, spent, committed, projected });
  const composition = buildBudgetComposition({ amountMxn, spent, committed, projected });

  const spentWidth = clampPercent(composition.spentPercent);
  const committedWidth = clampPercent(composition.committedPercent);
  const projectionWidth = clampPercent(composition.projectionPercent);
  const totalWidth = clampPercent(composition.totalPercent);
  const hasProjection = breakdown.projected > 0;

  const valueTextParts = [`${formatPercent(composition.spentPercent)} gastado`];
  if (breakdown.committed > 0) {
    valueTextParts.push(`${formatPercent(composition.committedPercent)} comprometido`);
    valueTextParts.push(`${formatPercent(composition.totalPercent)} total`);
  }
  if (hasProjection) {
    valueTextParts.push(`${formatPercent(composition.projectionPercent)} con proyección`);
  }

  return (
    <div
      className="dashboard-track relative h-1.5 w-full overflow-hidden rounded-full"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(totalWidth)}
      aria-valuetext={valueTextParts.join(", ")}
      title={valueTextParts.join(", ")}
    >
      {/* Capa sólida: gasto ejecutado. */}
      <div
        className={cn(
          "absolute inset-y-0 left-0 h-full rounded-l-full transition-[width] duration-300 motion-reduce:transition-none",
          budgetMeterClass(status)
        )}
        style={{ width: `${spentWidth}%` }}
        data-layer="spent"
      />

      {/* Capa rayada: comprometido. La textura la distingue del gasto sin depender del color. */}
      {committedWidth > 0 ? (
        <div
          className={cn(
            "absolute inset-y-0 h-full transition-[width] duration-300 motion-reduce:transition-none",
            "budget-progress-committed"
          )}
          style={{ left: `${spentWidth}%`, width: `${committedWidth}%` }}
          data-layer="committed"
        />
      ) : null}

      {/* Marca de proyección: dónde terminaría el consumo si se confirma lo promedio. */}
      {hasProjection ? (
        <div
          className="absolute inset-y-0 w-0.5 bg-[var(--color-text-primary)]"
          style={{ left: `calc(${projectionWidth}% - 1px)` }}
          data-layer="projection"
        />
      ) : null}
    </div>
  );
}
