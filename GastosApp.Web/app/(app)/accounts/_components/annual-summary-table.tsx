import { Inbox } from "lucide-react";
import type { AccountAnnualSummary, AccountAnnualSummaryMonth } from "@/lib/contracts/account-annual-summary";
import { formatCurrency } from "@/lib/format/currency";
import { formatAnnualMonthName } from "../_lib/accounts-annual-ui";

type Props = { summary: AccountAnnualSummary };

type Cell = { text: string; className: string };

/** Mes sin movimientos: la celda va vacía y en tono neutro, nunca como un cero con color. */
const NO_ACTIVITY_CELL: Cell = { text: "—", className: "text-muted" };

function incomeCell(month: AccountAnnualSummaryMonth): Cell {
  if (!month.hasActivity) return NO_ACTIVITY_CELL;
  return { text: `+${formatCurrency(Math.abs(month.income))}`, className: "dashboard-money-income" };
}

function expenseCell(month: AccountAnnualSummaryMonth): Cell {
  if (!month.hasActivity) return NO_ACTIVITY_CELL;
  return { text: `−${formatCurrency(Math.abs(month.expense))}`, className: "dashboard-money-expense" };
}

/** Las transferencias se muestran aparte y en tono neutro: no son ingreso ni gasto. */
function transferCell(month: AccountAnnualSummaryMonth): Cell {
  if (!month.hasActivity) return NO_ACTIVITY_CELL;
  return { text: `${month.netTransfers < 0 ? "−" : "+"}${formatCurrency(Math.abs(month.netTransfers))}`, className: "text-primary" };
}

function ActivityBadge({ hasActivity }: { hasActivity: boolean }) {
  if (hasActivity) {
    return <span className="sr-only">Con movimientos</span>;
  }

  return <span className="tabler-badge tabler-badge-solid tabler-badge-muted">Sin movimientos</span>;
}

const HEAD_CLASS = "text-muted px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em]";
const CELL_CLASS = "px-3 py-2 text-right font-semibold tabular-nums";

export function AnnualSummaryTable({ summary }: Props) {
  const { months, year } = summary;

  if (months.length === 0) {
    return (
      <div className="app-panel border-dashed px-4 py-8 text-center" role="status">
        <Inbox className="text-muted mx-auto h-6 w-6" aria-hidden="true" />
        <p className="text-primary mt-2 text-sm font-bold">Sin meses registrados</p>
        <p className="text-muted mt-1 text-xs">El backend no devolvió meses para {year}.</p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden md:block">
        <div className="app-panel overflow-hidden">
          <div className="max-w-full overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-full text-sm">
              <caption className="sr-only">
                Movimientos y saldo al cierre de cada mes de {year}. Un mes sin movimientos conserva el saldo del mes anterior, por eso su saldo de
                cierre nunca es cero.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={`${HEAD_CLASS} text-left`}>Mes</th>
                  <th scope="col" className={`${HEAD_CLASS} text-right`}>Ingresos</th>
                  <th scope="col" className={`${HEAD_CLASS} text-right`}>Gastos</th>
                  <th scope="col" className={`${HEAD_CLASS} text-right`}>Transferencias netas</th>
                  <th scope="col" className={`${HEAD_CLASS} text-right`}>Saldo al cierre</th>
                  <th scope="col" className={`${HEAD_CLASS} text-left`}>Movimientos</th>
                </tr>
              </thead>
              <tbody>
                {months.map((month) => {
                  const income = incomeCell(month);
                  const expense = expenseCell(month);
                  const transfers = transferCell(month);

                  return (
                    <tr key={month.month} className="border-default border-t">
                      <th scope="row" className="text-primary px-3 py-2 text-left font-medium">
                        {formatAnnualMonthName(month.month)}
                      </th>
                      <td className={`${CELL_CLASS} ${income.className}`}>{income.text}</td>
                      <td className={`${CELL_CLASS} ${expense.className}`}>{expense.text}</td>
                      <td className={`${CELL_CLASS} ${transfers.className}`}>{transfers.text}</td>
                      <td className={`${CELL_CLASS} text-primary`}>{formatCurrency(month.closingBalance)}</td>
                      <td className="px-3 py-2 text-left">
                        <ActivityBadge hasActivity={month.hasActivity} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ul className="m-0 grid list-none gap-3 p-0 md:hidden">
        {months.map((month) => {
          const income = incomeCell(month);
          const expense = expenseCell(month);
          const transfers = transferCell(month);

          return (
            <li key={month.month} className="app-panel p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-primary m-0 text-sm font-extrabold">{formatAnnualMonthName(month.month)}</p>
                <ActivityBadge hasActivity={month.hasActivity} />
              </div>

              <p className="text-muted m-0 mt-2 text-[11px] font-semibold uppercase tracking-[0.08em]">Saldo al cierre</p>
              <p className="text-primary m-0 text-lg font-semibold tabular-nums">{formatCurrency(month.closingBalance)}</p>

              <dl className="border-default m-0 mt-3 grid grid-cols-3 gap-2 border-t pt-2 text-xs">
                <div className="min-w-0">
                  <dt className="text-muted m-0">Ingresos</dt>
                  <dd className={`m-0 font-semibold tabular-nums ${income.className}`}>{income.text}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted m-0">Gastos</dt>
                  <dd className={`m-0 font-semibold tabular-nums ${expense.className}`}>{expense.text}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted m-0">Transf.</dt>
                  <dd className={`m-0 font-semibold tabular-nums ${transfers.className}`}>{transfers.text}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </>
  );
}
