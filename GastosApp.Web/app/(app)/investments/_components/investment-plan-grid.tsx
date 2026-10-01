import { formatDate, formatMonthLabel } from "@/app/(app)/dashboard/_components/dashboard-format";
import { institutionLabel } from "@/lib/contracts/investment-institutions";
import type { InvestmentPlan } from "@/lib/contracts/investments";
import type { InvestmentProjectionRow } from "@/lib/contracts/investments";
import { OFFER_FRESHNESS_COPY } from "../_lib/investments-ui";
import { TierSchedule } from "./investment-catalog";
import { projectionValue } from "./investment-dashboard";

export function InvestmentPlanGrid({ plan, series, starting }: { plan: InvestmentPlan; series: Map<number, InvestmentProjectionRow[]>; starting: number | null }) {
  return <div className="mt-4 overflow-x-auto focus-ring" tabIndex={0} role="region" aria-label="Asignaciones del plan mensual">
    <table className="w-full min-w-[850px] text-left text-sm">
      <caption className="pb-3 text-left text-xs text-muted">{plan.isPersisted ? "Capital observado al generar el plan; instantánea congelada, no saldo actual." : "Borrador: saldos observados al consultar. Todavía no son asignaciones generadas."} Interés y capital final corresponden al cierre de {formatMonthLabel(plan.planMonth)}.</caption>
      <thead><tr className="border-b border-default"><th scope="col" className="p-3">Producto / cuenta</th><th scope="col" className="p-3 text-right">Capital inicial</th><th scope="col" className="p-3">Tramos y verificación</th><th scope="col" className="p-3 text-right">Interés estimado</th><th scope="col" className="p-3 text-right">Capital final estimado</th></tr></thead>
      <tbody>{plan.allocations.map((allocation) => {
        const row = series.get(allocation.investmentProductId)?.[0];
        return <tr key={allocation.investmentProductId} className="border-b border-default align-top">
          <th scope="row" className="p-3 font-normal"><p className="font-semibold text-primary">{allocation.productName}</p><p className="mt-1 text-xs text-muted">{allocation.institutionLabel || institutionLabel(allocation.institution)}</p><p className="mt-1 text-xs text-secondary">Cuenta #{allocation.accountId} · vínculo del {plan.isPersisted ? "plan generado" : "borrador"}</p></th>
          <td className="p-3 text-right tabular-nums">{projectionValue(allocation.allocatedAmount)}</td>
          <td className="max-w-sm space-y-2 p-3"><TierSchedule tiers={allocation.tiers} /><p className="text-xs text-muted">Oferta de {formatMonthLabel(allocation.offerCapturedForMonth)} · {allocation.conditionsConfirmed ? "Condiciones verificadas" : "Condiciones por verificar"}</p>{allocation.offerFreshness ? <p className="text-xs text-muted">{OFFER_FRESHNESS_COPY[allocation.offerFreshness]}</p> : null}<p className="text-xs text-muted">Vigencia: {formatDate(allocation.offerValidFrom, "UTC")} a {formatDate(allocation.offerValidTo, "UTC")}{allocation.validityInferred ? " (fin inferido)" : ""}.</p><p className="text-xs text-muted">Tasa marginal: cada tramo remunera solo su porción.</p></td>
          <td className="p-3 text-right tabular-nums">{projectionValue(row?.interest)}</td>
          <td className="p-3 text-right font-semibold tabular-nums">{projectionValue(row?.closingBalance)}</td>
        </tr>;
      })}</tbody>
      {plan.isPersisted && plan.allocations.length ? <tfoot><tr className="border-t border-default bg-[var(--color-surface-2)] font-semibold"><th scope="row" className="p-3">Total del plan</th><td className="p-3 text-right tabular-nums">{projectionValue(starting)}</td><td className="p-3 text-xs font-normal text-muted">Sin aportaciones nuevas</td><td className="p-3 text-right tabular-nums">{projectionValue(sumRows(plan, series, "interest"))}</td><td className="p-3 text-right tabular-nums">{projectionValue(sumRows(plan, series, "closingBalance"))}</td></tr></tfoot> : null}
    </table>
    {!plan.allocations.length ? <p className="py-4 text-sm text-muted">Ningún producto cumple los requisitos para este mes. Revisa los motivos de exclusión.</p> : null}
  </div>;
}

function sumRows(plan: InvestmentPlan, series: Map<number, InvestmentProjectionRow[]>, key: "openingBalance" | "interest" | "closingBalance"): number | null {
  const rows = plan.allocations.map((allocation) => series.get(allocation.investmentProductId)?.[0]);
  if (rows.some((row) => !row)) return null;
  return rows.reduce((sum, row) => sum + Math.round(row![key] * 100), 0) / 100;
}
