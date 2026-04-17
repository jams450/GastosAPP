import type { DashboardViewMode } from "@/app/dashboard/_components/dashboard-view-mode";
import { formatAmount } from "@/app/dashboard/_components/dashboard-format";
import type { DashboardAccountOverview } from "@/lib/contracts/dashboard";
import { getBalanceToneClass } from "@/lib/accounts/metrics";

type AccountCardProps = {
  account: DashboardAccountOverview;
  viewMode: DashboardViewMode;
};

export function AccountCard({ account, viewMode }: AccountCardProps) {
  const debt = ((account.creditLimit ?? 0) - account.closingBalance) * -1;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-sky-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:hover:border-sky-600">
      <CardHeader account={account} debt={debt} />

      {viewMode === "detail" ? <DetailContent account={account} /> : <CompactContent account={account} viewMode={viewMode} />}
    </article>
  );
}

function CardHeader({ account, debt }: { account: DashboardAccountOverview; debt: number }) {
  return (
    <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="m-0 truncate text-base font-semibold text-slate-900 dark:text-slate-100">{account.name}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {account.isCredit ? "Crédito" : "Efectivo"} · {account.active ? "Activa" : "Inactiva"}
        </p>
      </div>

      <TopHeaderMetrics account={account} debt={debt} />
    </header>
  );
}

function DetailContent({ account }: { account: DashboardAccountOverview }) {
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Inicial" value={account.initialBalance} />
        <Kpi label="Apertura mes" value={account.openingBalance} />
        <Kpi label="Ingresos mes" value={account.monthIncome} toneClass="text-emerald-700 dark:text-emerald-400" />
        <Kpi label="Gastos mes" value={account.monthExpense} toneClass="text-rose-700 dark:text-rose-400" />
      </div>

      {account.isCredit ? <CreditDetails account={account} /> : null}
    </>
  );
}

function CompactContent({ account, viewMode }: { account: DashboardAccountOverview; viewMode: DashboardViewMode }) {
  const isThreeColumns = viewMode === "grid3";

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Kpi label="Apertura" value={account.openingBalance} compact />

      {account.isCredit ? (
        <Kpi
          label={isThreeColumns ? "Deuda" : "Deuda total"}
          value={((account.creditLimit ?? 0) - account.closingBalance) * -1}
          toneClass="text-rose-700 dark:text-rose-400"
          compact
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
          <p className="m-0 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{isThreeColumns ? "Ing/Gto" : "Ingresos / Gastos"}</p>
          <p className="m-0 text-xs font-semibold text-slate-900 dark:text-slate-100">
            {formatAmount(account.monthIncome)} / {formatAmount(account.monthExpense)}
          </p>
        </div>
      )}
    </div>
  );
}

function TopHeaderMetrics({ account, debt }: { account: DashboardAccountOverview; debt: number }) {
  return account.isCredit ? (
    <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2 lg:grid-cols-4">
      <HeaderMetric label="Crédito" value={account.creditLimit ?? 0} toneClass={getBalanceToneClass(account.creditLimit ?? 0)} />
      <HeaderMetric label="Cierre" value={account.closingBalance} toneClass={getBalanceToneClass(account.closingBalance)} />
      <HeaderMetric label="Neto" value={account.monthNet} toneClass={getBalanceToneClass(account.monthNet)} />
      <HeaderMetric label="Deuda" value={debt} toneClass="text-rose-700 dark:text-rose-400" />
    </div>
  ) : (
    <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
      <HeaderMetric label="Cierre" value={account.closingBalance} toneClass={getBalanceToneClass(account.closingBalance)} />
      <HeaderMetric label="Neto mes" value={account.monthNet} toneClass={getBalanceToneClass(account.monthNet)} />
    </div>
  );
}

function HeaderMetric({ label, value, toneClass }: { label: string; value: number; toneClass: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900 sm:min-w-28">
      <p className="m-0 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`m-0 text-base font-semibold ${toneClass}`}>{formatAmount(value)}</p>
    </div>
  );
}

function CreditDetails({ account }: { account: DashboardAccountOverview }) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi label="Día de corte" value={account.cutoffDay ?? "No definido"} compact />
      <Kpi label="Pago límite" value={account.paymentDueDay ?? "No definida"} compact />
      <Kpi label="Pendiente (informativo)" value={account.pendingInformative} toneClass={getBalanceToneClass(account.pendingInformative)} compact />
    </div>
  );
}

function Kpi({
  label,
  value,
  toneClass,
  compact = false
}: {
  label: string;
  value: number | string;
  toneClass?: string;
  compact?: boolean;
}) {
  const formattedValue = typeof value === "number" ? formatAmount(value) : value;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
      <p className="m-0 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`m-0 ${compact ? "text-sm" : "text-base"} font-semibold ${toneClass ?? "text-slate-900 dark:text-slate-100"}`}>
        {formattedValue}
      </p>
    </div>
  );
}
