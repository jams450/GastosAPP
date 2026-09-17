import type { ReactNode } from "react";
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, Coins, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { AccountAnnualSummary } from "@/lib/contracts/account-annual-summary";
import { formatCurrency } from "@/lib/format/currency";
import type { AnnualSummaryCopy } from "../_lib/accounts-annual-ui";

type Props = {
  summary: AccountAnnualSummary;
  copy: AnnualSummaryCopy;
};

type KpiItem = {
  key: string;
  title: string;
  subtitle?: string;
  note?: string;
  value: string;
  valueClass: string;
  icon: ReactNode;
};

/** Signo explícito: el color nunca es el único indicador de dirección del dinero. */
function signedAmount(value: number): string {
  return `${value < 0 ? "−" : "+"}${formatCurrency(Math.abs(value))}`;
}

function magnitudeAmount(value: number, sign: "+" | "−"): string {
  return `${sign}${formatCurrency(Math.abs(value))}`;
}

function buildItems(summary: AccountAnnualSummary, copy: AnnualSummaryCopy): KpiItem[] {
  return [
    {
      key: "opening",
      title: copy.openingTitle,
      subtitle: "Acumulado antes del 1 de enero",
      value: formatCurrency(summary.openingBalance),
      valueClass: "text-primary",
      icon: <Wallet className="h-4 w-4" aria-hidden="true" />
    },
    {
      key: "income",
      title: "Ingresos del año",
      value: magnitudeAmount(summary.yearIncome, "+"),
      valueClass: "dashboard-money-income",
      icon: <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
    },
    {
      key: "expense",
      title: "Gastos del año",
      value: magnitudeAmount(summary.yearExpense, "−"),
      valueClass: "dashboard-money-expense",
      icon: <ArrowDownRight className="h-4 w-4" aria-hidden="true" />
    },
    {
      key: "transfers",
      title: "Transferencias netas",
      note: "Mover dinero entre tus cuentas no es ingreso ni gasto.",
      value: signedAmount(summary.yearNetTransfers),
      valueClass: "text-primary",
      icon: <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
    },
    {
      key: "closing",
      title: copy.closingTitle,
      note: copy.balanceNote ?? undefined,
      value: formatCurrency(summary.closingBalance),
      valueClass: "text-primary",
      icon: <Coins className="h-4 w-4" aria-hidden="true" />
    }
  ];
}

export function AnnualSummaryKpis({ summary, copy }: Props) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label={`Indicadores del año ${summary.year}`}>
      {buildItems(summary, copy).map((item) => (
        <Card key={item.key} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 text-xs font-semibold uppercase tracking-[0.1em] text-muted">{item.title}</p>
              {item.subtitle ? <p className="m-0 mt-1 text-[11px] font-medium text-muted">{item.subtitle}</p> : null}
            </div>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">{item.icon}</span>
          </div>
          <p className={`m-0 mt-4 truncate text-2xl font-semibold tabular-nums tracking-tight ${item.valueClass}`} title={item.value}>
            {item.value}
          </p>
          {item.note ? <p className="m-0 mt-3 text-[11px] font-medium leading-snug text-muted">{item.note}</p> : null}
        </Card>
      ))}
    </section>
  );
}
