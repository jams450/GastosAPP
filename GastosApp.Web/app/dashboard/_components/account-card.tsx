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
  const isDetailLike = viewMode === "detail" || viewMode === "headers";
  const isHeaderOnly = viewMode === "headers";

  return (
    <article
      className={isDetailLike
        ? "border-b border-slate-200 px-1 py-6 last:border-b-0 dark:border-slate-800"
        : "rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-sky-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:hover:border-sky-600"}
    >
      <CardHeader account={account} debt={debt} viewMode={viewMode} />

      {isHeaderOnly ? null : isDetailLike ? <DetailContent account={account} /> : <CompactContent account={account} viewMode={viewMode} />}
    </article>
  );
}

function CardHeader({
  account,
  debt,
  viewMode
}: {
  account: DashboardAccountOverview;
  debt: number;
  viewMode: DashboardViewMode;
}) {
  const isDetail = viewMode === "detail" || viewMode === "headers";
  const isTwoColumns = viewMode === "grid2";
  const isThreeColumns = viewMode === "grid3";

  return (
    <header className={isDetail ? "mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start" : isTwoColumns || isThreeColumns ? "mb-3 space-y-2" : "mb-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"}>
      <div className={isDetail || isTwoColumns || isThreeColumns ? "min-w-0" : "min-w-0 flex-1"}>
        <p className={isDetail ? "m-0 truncate text-xl font-semibold text-slate-900 dark:text-slate-100" : "m-0 truncate text-base font-semibold text-slate-900 dark:text-slate-100"}>{account.name}</p>
        <p className={isDetail ? "mt-1 text-sm text-slate-500 dark:text-slate-400" : "mt-1 text-xs text-slate-500 dark:text-slate-400"}>
          {account.isCredit ? "Crédito" : "Efectivo"} · {account.active ? "Activa" : "Inactiva"}
        </p>
      </div>

      <TopHeaderMetrics account={account} debt={debt} viewMode={viewMode} />
    </header>
  );
}

function DetailContent({ account }: { account: DashboardAccountOverview }) {
  return (
    <>
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Inicial" value={account.initialBalance} plain />
        <Kpi label="Apertura mes" value={account.openingBalance} plain />
        <Kpi label="Ingresos mes" value={account.monthIncome} toneClass="text-emerald-700 dark:text-emerald-400" plain />
        <Kpi label="Gastos mes" value={account.monthExpense} toneClass="text-rose-700 dark:text-rose-400" plain />
      </div>

      {account.isCredit ? <CreditDetails account={account} /> : null}
    </>
  );
}

function CompactContent({ account, viewMode }: { account: DashboardAccountOverview; viewMode: DashboardViewMode }) {
  const isThreeColumns = viewMode === "grid3";

  return (
    <div className={isThreeColumns ? "grid grid-cols-1 gap-3" : "grid gap-2 sm:grid-cols-2"}>
      <Kpi label="Apertura" value={account.openingBalance} compact />

      {account.isCredit ? (
        <Kpi
          label={isThreeColumns ? "Deuda" : "Deuda total"}
          value={((account.creditLimit ?? 0) - account.closingBalance) * -1}
          toneClass="text-rose-700 dark:text-rose-400"
          compact
        />
      ) : (
        <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900">
          <p className="m-0 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{isThreeColumns ? "Ing/Gto" : "Ingresos / Gastos"}</p>
          <p className="m-0 text-xs font-semibold text-slate-900 dark:text-slate-100">
            {formatAmount(account.monthIncome)} / {formatAmount(account.monthExpense)}
          </p>
        </div>
      )}
    </div>
  );
}

function TopHeaderMetrics({
  account,
  debt,
  viewMode
}: {
  account: DashboardAccountOverview;
  debt: number;
  viewMode: DashboardViewMode;
}) {
  const isDetail = viewMode === "detail" || viewMode === "headers";
  const isTwoColumns = viewMode === "grid2";
  const isThreeColumns = viewMode === "grid3";

  return account.isCredit ? (
    <div className={isDetail ? "grid w-full gap-2 sm:grid-cols-2 xl:grid-cols-4 lg:min-w-[40rem]" : isTwoColumns ? "grid w-full grid-cols-2 gap-2" : isThreeColumns ? "grid w-full grid-cols-2 gap-2" : "grid w-full gap-2 sm:w-auto sm:grid-cols-2 lg:grid-cols-4"}>
      <HeaderMetric label="Crédito" value={account.creditLimit ?? 0} toneClass={getBalanceToneClass(account.creditLimit ?? 0)} large={isDetail} />
      <HeaderMetric label="Cierre" value={account.closingBalance} toneClass={getBalanceToneClass(account.closingBalance)} large={isDetail} />
      <HeaderMetric label="Neto" value={account.monthNet} toneClass={getBalanceToneClass(account.monthNet)} large={isDetail} />
      <HeaderMetric label="Deuda" value={debt} toneClass="text-rose-700 dark:text-rose-400" large={isDetail} />
    </div>
  ) : (
    <div className={isDetail ? "grid w-full gap-2 sm:grid-cols-2 lg:min-w-[20rem]" : isTwoColumns ? "grid w-full grid-cols-2 gap-2" : isThreeColumns ? "grid w-full grid-cols-2 gap-2" : "grid w-full gap-2 sm:w-auto sm:grid-cols-2"}>
      <HeaderMetric label="Cierre" value={account.closingBalance} toneClass={getBalanceToneClass(account.closingBalance)} large={isDetail} />
      <HeaderMetric label="Neto mes" value={account.monthNet} toneClass={getBalanceToneClass(account.monthNet)} large={isDetail} />
    </div>
  );
}

function HeaderMetric({
  label,
  value,
  toneClass,
  large = false
}: {
  label: string;
  value: number;
  toneClass: string;
  large?: boolean;
}) {
  return (
    <div className={large
      ? "px-0 py-1"
      : "rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900 sm:min-w-28"}
    >
      <p className={large ? "m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400" : "m-0 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400"}>{label}</p>
      <p className={`m-0 ${large ? "text-2xl leading-tight" : "text-base"} font-semibold ${toneClass}`}>{formatAmount(value)}</p>
    </div>
  );
}

function CreditDetails({ account }: { account: DashboardAccountOverview }) {
  return (
    <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi label="Día de corte" value={account.cutoffDay ?? "No definido"} plain />
      <Kpi label="Pago límite" value={account.paymentDueDay ?? "No definida"} plain />
      <Kpi label="Pendiente (informativo)" value={account.pendingInformative} toneClass={getBalanceToneClass(account.pendingInformative)} plain />
    </div>
  );
}

function Kpi({
  label,
  value,
  toneClass,
  compact = false,
  plain = false
}: {
  label: string;
  value: number | string;
  toneClass?: string;
  compact?: boolean;
  plain?: boolean;
}) {
  const formattedValue = typeof value === "number" ? formatAmount(value) : value;

  return (
    <div className={plain
      ? "px-0 py-0"
      : compact
        ? "rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900"
        : "rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"}
    >
      <p className={plain ? "m-0 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400" : "m-0 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400"}>{label}</p>
      <p className={`m-0 ${plain ? "text-lg" : compact ? "text-sm" : "text-base"} font-semibold ${toneClass ?? "text-slate-900 dark:text-slate-100"}`}>
        {formattedValue}
      </p>
    </div>
  );
}
