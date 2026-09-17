import { BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatAmount } from "@/app/(app)/dashboard/_components/dashboard-format";
import type { DashboardAccountOverview } from "@/lib/contracts/dashboard";

type AccountFlowBarsProps = {
  title: string;
  description: string;
  accounts: DashboardAccountOverview[];
  emptyMessage: string;
};

type FlowRow = {
  key: string;
  /** Etiquetas completas (sm+); `shortLabel` evita truncar el raíl en móvil. */
  label: string;
  shortLabel: string;
  value: number;
  barClass: string;
  textClass: string;
};

/** Las transferencias se listan aparte de ingreso/gasto: mover dinero entre cuentas propias no es flujo real. */
const LEGEND = [
  { label: "Ingresos reales", swatchClass: "dashboard-bar-income" },
  { label: "Gastos reales", swatchClass: "dashboard-bar-expense" },
  { label: "Transferencias recibidas", swatchClass: "dashboard-bar-transfer-in" },
  { label: "Transferencias enviadas", swatchClass: "dashboard-bar-transfer-out" }
];

function flowRows(account: DashboardAccountOverview): FlowRow[] {
  return [
    {
      key: "income",
      label: "Ingresos",
      shortLabel: "Ingresos",
      value: account.monthIncome,
      barClass: "dashboard-bar-income",
      textClass: "dashboard-money-income"
    },
    {
      key: "expense",
      label: "Gastos",
      shortLabel: "Gastos",
      value: account.monthExpense,
      barClass: "dashboard-bar-expense",
      textClass: "dashboard-money-expense"
    },
    {
      key: "transferIn",
      label: "Transferencias +",
      shortLabel: "Transf. +",
      value: account.monthTransferIn,
      barClass: "dashboard-bar-transfer-in",
      textClass: "text-primary"
    },
    {
      key: "transferOut",
      label: "Transferencias −",
      shortLabel: "Transf. −",
      value: account.monthTransferOut,
      barClass: "dashboard-bar-transfer-out",
      textClass: "text-primary"
    }
  ];
}

function accountAriaLabel(account: DashboardAccountOverview) {
  const facts = [
    `ingresos ${formatAmount(account.monthIncome)}`,
    `gastos ${formatAmount(account.monthExpense)}`,
    `transferencias recibidas ${formatAmount(account.monthTransferIn)}`,
    `transferencias enviadas ${formatAmount(account.monthTransferOut)}`,
    `neto ${formatAmount(account.monthNet)}`
  ];

  return `${account.name}: ${facts.join(", ")}`;
}

export function AccountFlowBars({ title, description, accounts, emptyMessage }: AccountFlowBarsProps) {
  const maxAmount = accounts.reduce(
    (max, account) =>
      Math.max(
        max,
        Math.abs(account.monthIncome),
        Math.abs(account.monthExpense),
        Math.abs(account.monthTransferIn),
        Math.abs(account.monthTransferOut)
      ),
    0
  );

  // Un valor en cero no dibuja barra: un raíl visible sugeriría un monto que no existe.
  const widthFor = (value: number) =>
    value === 0 || maxAmount === 0 ? 0 : Math.min(Math.max((Math.abs(value) / maxAmount) * 100, 4), 100);

  return (
    <Card className="dashboard-card p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-1">
          <h3 className="m-0 text-base font-semibold text-primary">{title}</h3>
          <p className="m-0 text-xs text-muted">{description}</p>
        </div>
      </div>

      {accounts.length === 0 ? (
        <p className="app-panel m-0 border-dashed px-4 py-7 text-center text-sm text-muted">{emptyMessage}</p>
      ) : (
        <>
          <div className="mb-4 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
            <p className="m-0 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Leyenda</p>
            <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0">
              {LEGEND.map((item) => (
                <li key={item.label} className="flex items-center gap-1.5 text-[11px] font-medium text-secondary">
                  <span aria-hidden="true" className={`h-2 w-4 shrink-0 rounded-full ${item.swatchClass}`} />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>

          <ul className="m-0 grid list-none gap-3 p-0">
            {accounts.map((account) => {
              const rows = flowRows(account);
              return (
                <li
                  key={account.accountId}
                  className="dashboard-subtle grid gap-2 rounded-[var(--radius-sm)] p-3"
                  role="img"
                  aria-label={accountAriaLabel(account)}
                >
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium text-primary" title={account.name}>
                      {account.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      Neto {formatAmount(account.monthNet)}
                    </span>
                  </div>

                  <div className="grid gap-1.5">
                    <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Movimiento real</p>
                    {rows.slice(0, 2).map((row) => (
                      <FlowBarRow key={row.key} row={row} width={widthFor(row.value)} />
                    ))}
                  </div>

                  <div className="grid gap-1.5 border-t border-[var(--color-border)] pt-2">
                    <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                      Transferencias entre tus cuentas
                    </p>
                    {rows.slice(2).map((row) => (
                      <FlowBarRow key={row.key} row={row} width={widthFor(row.value)} />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}

function FlowBarRow({ row, width }: { row: FlowRow; width: number }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto]">
      <span className="text-[11px] uppercase tracking-wide text-muted">
        <span className="sm:hidden">{row.shortLabel}</span>
        <span className="hidden sm:inline">{row.label}</span>
      </span>
      <span className="dashboard-track h-2 overflow-hidden rounded-full">
        <span className={`block h-full rounded-full ${row.barClass}`} style={{ width: `${width}%` }} />
      </span>
      <span className={`text-xs font-semibold tabular-nums ${row.textClass}`}>{formatAmount(row.value)}</span>
    </div>
  );
}
