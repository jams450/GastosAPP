import { useState } from "react";
import type { DashboardViewMode } from "@/app/dashboard/_components/dashboard-view-mode";
import { formatAmount } from "@/app/dashboard/_components/dashboard-format";
import type { DashboardAccountOverview } from "@/lib/contracts/dashboard";
import { getBalanceToneClass } from "@/lib/accounts/metrics";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type CreditInstallmentItem = {
  installmentId: number;
  planType: "MSI" | "Revolving";
  installmentNumber: number;
  months: number;
  dueDate: string;
  remainingAmount: number;
  description: string;
};

type AccountCardProps = {
  account: DashboardAccountOverview;
  viewMode: DashboardViewMode;
};

export function AccountCard({ account, viewMode }: AccountCardProps) {
  const debt = ((account.creditLimit ?? 0) - account.currentBalance) * -1;
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
        <Kpi label="Saldo actual" value={account.currentBalance} toneClass={getBalanceToneClass(account.currentBalance)} plain />
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
      <Kpi label="Saldo actual" value={account.currentBalance} compact toneClass={getBalanceToneClass(account.currentBalance)} />
      <Kpi label="Apertura" value={account.openingBalance} compact />

      {account.isCredit ? (
        <Kpi
          label={isThreeColumns ? "Deuda" : "Deuda total"}
          value={((account.creditLimit ?? 0) - account.currentBalance) * -1}
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
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<CreditInstallmentItem[]>([]);

  async function openPendingModal() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/bff/transactions/credit/open-installments/${account.accountId}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("No se pudieron cargar cargos pendientes");
      }

      const payload = (await response.json().catch(() => [])) as Array<Record<string, unknown>>;
      const normalized = Array.isArray(payload)
        ? payload
          .map((row) => {
            const installmentId = Number(row.installmentId ?? 0);
            const planType = row.planType === "MSI" ? "MSI" : "Revolving";
            const installmentNumber = Number(row.installmentNumber ?? 1);
            const months = Number(row.months ?? 1);
            const dueDate = String(row.dueDate ?? "");
            const remainingAmount = Number(row.remainingAmount ?? 0);
            const description = typeof row.description === "string" ? row.description : "Cargo crédito";

            if (installmentId <= 0 || remainingAmount <= 0) {
              return null;
            }

            return {
              installmentId,
              planType,
              installmentNumber,
              months,
              dueDate,
              remainingAmount,
              description
            } satisfies CreditInstallmentItem;
          })
          .filter((item): item is CreditInstallmentItem => Boolean(item))
        : [];

      setItems(normalized);
    } catch {
      setError("No se pudo cargar el detalle de cargos pendientes.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  const msiItems = items.filter((item) => item.planType === "MSI");
  const normalItems = items.filter((item) => item.planType !== "MSI");
  const totalMsi = msiItems.reduce((sum, item) => sum + item.remainingAmount, 0);
  const totalNormal = normalItems.reduce((sum, item) => sum + item.remainingAmount, 0);

  return (
    <>
      <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi label="Día de corte" value={account.cutoffDay ?? "No definido"} plain formatAsCurrency={false} />
        <Kpi label="Pago límite" value={account.paymentDueDay ?? "No definido"} plain formatAsCurrency={false} />
        <Kpi label="Pago estimado al corte" value={account.estimatedCutoffPayment} toneClass="text-amber-700 dark:text-amber-400" plain />
        <Kpi label="Pendiente MSI" value={account.msiOutstanding} toneClass="text-indigo-700 dark:text-indigo-400" plain />
        <Kpi label="Pendiente normal" value={account.normalOutstanding} toneClass="text-fuchsia-700 dark:text-fuchsia-400" plain />
        <div className="self-end">
          <Button type="button" variant="ghost" className="h-9 w-full border-blue-400/60 bg-blue-500/15 text-blue-700 hover:border-blue-500/70 hover:bg-blue-500/25 hover:text-blue-800 dark:border-blue-700/60 dark:bg-blue-500/25 dark:text-blue-300 dark:hover:border-blue-500/70 dark:hover:bg-blue-500/35 dark:hover:text-blue-100" onClick={() => void openPendingModal()}>
            Ver cargos pendientes
          </Button>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-5xl space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Cargos pendientes · {account.name}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Separado por MSI y normal (revolvente).</p>
              </div>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cerrar</Button>
            </div>

            {loading ? <p className="text-sm text-slate-600 dark:text-slate-300">Cargando cargos pendientes...</p> : null}
            {error ? <p className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">{error}</p> : null}

            {!loading && !error ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <PendingGroup title="MSI" toneClass="text-indigo-700 dark:text-indigo-300" items={msiItems} total={totalMsi} />
                <PendingGroup title="Normal" toneClass="text-fuchsia-700 dark:text-fuchsia-300" items={normalItems} total={totalNormal} />
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}
    </>
  );
}

function PendingGroup({
  title,
  toneClass,
  items,
  total
}: {
  title: string;
  toneClass: string;
  items: CreditInstallmentItem[];
  total: number;
}) {
  return (
    <section className="space-y-2 rounded-xl border border-indigo-200/55 bg-indigo-50/30 p-3 dark:border-indigo-900/40 dark:bg-indigo-950/15">
      <div className="flex items-center justify-between gap-2">
        <h4 className={`text-sm font-semibold ${toneClass}`}>{title}</h4>
        <p className="text-xs text-slate-500 dark:text-slate-400">{items.length} cargos</p>
      </div>

      <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
            <tr>
              <th className="px-2 py-2 text-left font-semibold">Cargo</th>
              <th className="px-2 py-2 text-left font-semibold">Mensualidad</th>
              <th className="px-2 py-2 text-left font-semibold">Vence</th>
              <th className="px-2 py-2 text-right font-semibold">Falta</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-2 py-3 text-slate-500 dark:text-slate-400" colSpan={4}>Sin cargos pendientes</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.installmentId} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-2 text-slate-700 dark:text-slate-200">{item.description}</td>
                  <td className="px-2 py-2 text-slate-700 dark:text-slate-200">{item.installmentNumber}/{item.months}</td>
                  <td className="px-2 py-2 text-slate-700 dark:text-slate-200">{formatDate(item.dueDate)}</td>
                  <td className="px-2 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">{formatAmount(item.remainingAmount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-right text-sm font-semibold text-slate-900 dark:text-slate-100">Total: {formatAmount(total)}</p>
    </section>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function Kpi({
  label,
  value,
  toneClass,
  compact = false,
  plain = false,
  formatAsCurrency = true
}: {
  label: string;
  value: number | string;
  toneClass?: string;
  compact?: boolean;
  plain?: boolean;
  formatAsCurrency?: boolean;
}) {
  const formattedValue = typeof value === "number" ? (formatAsCurrency ? formatAmount(value) : String(value)) : value;

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
