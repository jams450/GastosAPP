import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { DashboardViewMode } from "@/app/(app)/dashboard/_components/dashboard-view-mode";
import { formatAmount, formatDate } from "@/app/(app)/dashboard/_components/dashboard-format";
import type { DashboardAccountOverview } from "@/lib/contracts/dashboard";
import { getBalanceToneClass } from "@/lib/accounts/metrics";
import { resolveAccountCredit } from "@/app/(app)/dashboard/_lib/dashboard-metrics";
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
  timezone: string;
};

type ModalAttributeSnapshot = {
  inert: boolean;
  ariaHidden: string | null;
  visibility: string;
  zIndex: string;
};

type ModalBodySnapshot = {
  scrollY: number;
  overflow: string;
  position: string;
  top: string;
  width: string;
  siblings: Array<{
    element: Element;
    inert: boolean;
    ariaHidden: string | null;
  }>;
};

type ActiveModalLock = {
  portal: HTMLElement;
  portalSnapshot: ModalAttributeSnapshot;
};

const MODAL_PORTAL_ATTRIBUTE = "data-dashboard-modal-portal";
const MODAL_PORTAL_BASE_Z_INDEX = 1000;
let activeModalLocks: ActiveModalLock[] = [];
let modalBodySnapshot: ModalBodySnapshot | null = null;

function snapshotModalAttributes(element: HTMLElement): ModalAttributeSnapshot {
  return {
    inert: element.hasAttribute("inert"),
    ariaHidden: element.getAttribute("aria-hidden"),
    visibility: element.style.visibility,
    zIndex: element.style.zIndex
  };
}

function restoreModalAttributes(element: HTMLElement, snapshot: ModalAttributeSnapshot) {
  if (snapshot.inert) element.setAttribute("inert", "");
  else element.removeAttribute("inert");
  if (snapshot.ariaHidden === null) element.removeAttribute("aria-hidden");
  else element.setAttribute("aria-hidden", snapshot.ariaHidden);
  element.style.visibility = snapshot.visibility;
  element.style.zIndex = snapshot.zIndex;
}

function restoreInertAttributes(element: Element, snapshot: { inert: boolean; ariaHidden: string | null }) {
  if (snapshot.inert) element.setAttribute("inert", "");
  else element.removeAttribute("inert");
  if (snapshot.ariaHidden === null) element.removeAttribute("aria-hidden");
  else element.setAttribute("aria-hidden", snapshot.ariaHidden);
}

function focusTopModal(): boolean {
  const topPortal = activeModalLocks[activeModalLocks.length - 1]?.portal;
  if (!topPortal || topPortal.style.visibility === "hidden") return false;

  const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const focusable = Array.from(topPortal.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => !element.hasAttribute("disabled") && element.getClientRects().length > 0);
  const target = focusable[0] ?? topPortal.querySelector<HTMLElement>("[role=dialog]");
  if (!target || !target.isConnected) return false;
  target.focus();
  return document.activeElement === target;
}

function reconcileModalPortals() {
  activeModalLocks.forEach(({ portal, portalSnapshot }, index) => {
    const isTopModal = index === activeModalLocks.length - 1;
    portal.style.zIndex = String(MODAL_PORTAL_BASE_Z_INDEX + index);
    if (isTopModal) {
      restoreModalAttributes(portal, portalSnapshot);
      portal.style.zIndex = String(MODAL_PORTAL_BASE_Z_INDEX + index);
    } else {
      portal.setAttribute("inert", "");
      portal.setAttribute("aria-hidden", "true");
      portal.style.visibility = "hidden";
    }
  });
}

function acquireModalBodyLock(portal: HTMLElement): () => void {
  let released = false;
  const existingLock = activeModalLocks.find((lock) => lock.portal === portal);
  const lock: ActiveModalLock = existingLock ?? {
    portal,
    portalSnapshot: snapshotModalAttributes(portal)
  };

  if (activeModalLocks.length === 0) {
    const siblings = Array.from(document.body.children).filter(
      (element) => !element.hasAttribute(MODAL_PORTAL_ATTRIBUTE)
    );

    modalBodySnapshot = {
      scrollY: window.scrollY,
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      siblings: siblings.map((element) => ({
        element,
        inert: element.hasAttribute("inert"),
        ariaHidden: element.getAttribute("aria-hidden")
      }))
    };

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${modalBodySnapshot.scrollY}px`;
    document.body.style.width = "100%";
    siblings.forEach((element) => {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    });
  }

  if (!existingLock) {
    activeModalLocks = [...activeModalLocks, lock];
  }
  reconcileModalPortals();

  return () => {
    if (released) {
      return;
    }

    released = true;
    activeModalLocks = activeModalLocks.filter((activeLock) => activeLock !== lock);
    restoreModalAttributes(lock.portal, lock.portalSnapshot);
    reconcileModalPortals();

    if (activeModalLocks.length > 0) {
      focusTopModal();
      return;
    }

    if (!modalBodySnapshot) {
      return;
    }

    const snapshot = modalBodySnapshot;
    modalBodySnapshot = null;
    document.body.style.overflow = snapshot.overflow;
    document.body.style.position = snapshot.position;
    document.body.style.top = snapshot.top;
    document.body.style.width = snapshot.width;
    window.scrollTo(0, snapshot.scrollY);
    snapshot.siblings.forEach(({ element, inert, ariaHidden }) => {
      restoreInertAttributes(element, { inert, ariaHidden });
    });
  };
}

export function AccountCard({ account, viewMode, timezone }: AccountCardProps) {
  const isDetailLike = viewMode === "detail" || viewMode === "headers";
  const isHeaderOnly = viewMode === "headers";

  return (
    <article
      className={isDetailLike
        ? account.isCredit
          ? "border-b border-slate-200 px-1 py-6 last:border-b-0 dark:border-slate-800"
          : "border-b border-slate-200 px-1 py-4 last:border-b-0 dark:border-slate-800"
        : "dashboard-card dashboard-card-interactive p-4"}
    >
      <CardHeader account={account} viewMode={viewMode} />

      {isHeaderOnly ? null : isDetailLike ? <DetailContent account={account} timezone={timezone} /> : <CompactContent account={account} viewMode={viewMode} />}
    </article>
  );
}

function CardHeader({
  account,
  viewMode
}: {
  account: DashboardAccountOverview;
  viewMode: DashboardViewMode;
}) {
  const isDetail = viewMode === "detail" || viewMode === "headers";
  const isCashDetail = isDetail && !account.isCredit;
  const isTwoColumns = viewMode === "grid2";
  const isThreeColumns = viewMode === "grid3";

  return (
    <header className={isDetail ? isCashDetail ? "mb-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start" : "mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start" : isTwoColumns || isThreeColumns ? "mb-3 space-y-2" : "mb-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"}>
      <div className={isDetail || isTwoColumns || isThreeColumns ? "min-w-0" : "min-w-0 flex-1"}>
        <p className={isDetail ? "m-0 line-clamp-2 text-xl font-semibold text-primary" : "m-0 line-clamp-2 text-base font-semibold text-primary"}>{account.name}</p>
        <p className={isDetail ? "mt-1 text-sm text-muted" : "mt-1 text-xs text-muted"}>
          {account.isCredit ? "Crédito" : "Efectivo"} · {account.active ? "Activa" : "Inactiva"}
        </p>
      </div>

      <TopHeaderMetrics account={account} viewMode={viewMode} />
    </header>
  );
}

function DetailContent({ account, timezone }: { account: DashboardAccountOverview; timezone: string }) {
  return (
    <>
      {account.isCredit ? (
        <CreditDetails account={account} timezone={timezone} />
      ) : (
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Saldo actual" value={account.currentBalance} toneClass={getBalanceToneClass(account.currentBalance)} plain />
          <Kpi label="Apertura mes" value={account.openingBalance} plain />
          <Kpi label="Ingresos mes" value={account.monthIncome} toneClass="dashboard-money-income" plain />
          <Kpi label="Gastos mes" value={account.monthExpense * -1} toneClass="dashboard-money-expense" plain />
        </div>
      )}
    </>
  );
}

function CompactContent({ account, viewMode }: { account: DashboardAccountOverview; viewMode: DashboardViewMode }) {
  const isThreeColumns = viewMode === "grid3";

  return (
    <div className={isThreeColumns ? "grid grid-cols-1 gap-3" : "grid gap-2 sm:grid-cols-2"}>
      <Kpi label="Saldo actual" value={account.currentBalance} compact variant="accent" toneClass={getBalanceToneClass(account.currentBalance)} />
      <Kpi label="Apertura" value={account.openingBalance} compact />

      {account.isCredit ? (
        <Kpi
          label={isThreeColumns ? "Deuda" : "Deuda total"}
          value={resolveAccountCredit(account).debt}
          toneClass="dashboard-money-expense"
          compact
          variant="expense"
        />
      ) : (
        <div className="dashboard-subtle dashboard-subtle-neutral rounded-[var(--radius-sm)] px-3 py-2">
          <p className="m-0 text-[11px] uppercase tracking-wide text-muted">{isThreeColumns ? "Ing/Gto" : "Ingresos / Gastos"}</p>
          <p className="m-0 text-xs font-semibold text-primary">
            {formatAmount(account.monthIncome)} / {formatAmount(account.monthExpense)}
          </p>
        </div>
      )}
    </div>
  );
}

function TopHeaderMetrics({
  account,
  viewMode
}: {
  account: DashboardAccountOverview;
  viewMode: DashboardViewMode;
}) {
  const isDetail = viewMode === "detail" || viewMode === "headers";
  const isCashDetail = isDetail && !account.isCredit;
  const isTwoColumns = viewMode === "grid2";
  const isThreeColumns = viewMode === "grid3";

  return account.isCredit ? (
    <div className={isDetail ? "grid w-full gap-2 sm:grid-cols-[repeat(2,minmax(10.5rem,1fr))] sm:gap-4 lg:min-w-[28rem]" : isTwoColumns || isThreeColumns ? "grid w-full grid-cols-1 gap-2 sm:grid-cols-2" : "grid w-full gap-2 sm:w-auto sm:grid-cols-2"}>
      <HeaderMetric label="Límite de crédito" value={account.creditLimit} large={isDetail} />
      <HeaderMetric label="Saldo actual" value={account.currentBalance} toneClass={getBalanceToneClass(account.currentBalance)} large={isDetail} />
    </div>
  ) : (
    <div className={isCashDetail ? "grid w-full gap-2 sm:grid-cols-[repeat(2,minmax(10.5rem,1fr))] sm:gap-4 lg:min-w-[22.5rem]" : isTwoColumns ? "grid w-full grid-cols-2 gap-2" : isThreeColumns ? "grid w-full grid-cols-2 gap-2" : "grid w-full gap-2 sm:w-auto sm:grid-cols-2"}>
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
  value: number | null;
  toneClass?: string;
  large?: boolean;
}) {
  const formatted = value === null ? "No disponible" : formatAmount(value);
  const tone = value === null ? "text-muted" : toneClass ?? "text-primary";

  // En detalle los dos importes van sin caja, así que se separan con un divisor
  // vertical solo cuando quedan lado a lado (de `sm` en adelante).
  const containerClass = large
    ? "px-0 py-1 sm:border-l sm:border-[var(--color-border)] sm:pl-4 sm:first:border-l-0 sm:first:pl-0"
    : "rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900 sm:min-w-28";

  return (
    <div className={containerClass}>
      <p className={large ? "m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted" : "m-0 text-[11px] uppercase tracking-wide text-muted"}>{label}</p>
       <p className={`m-0 ${large ? "text-2xl leading-tight" : "text-base"} font-semibold tabular-nums ${tone}`}>{formatted}</p>
    </div>
  );
}

function CreditDetails({ account, timezone }: { account: DashboardAccountOverview; timezone: string }) {
  const debt = resolveAccountCredit(account).debt;
  const incomeTotal = account.monthIncome + account.monthTransferIn;
  const expenseTotal = account.monthExpense + account.monthTransferOut;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<CreditInstallmentItem[]>([]);
  const dialogTitleId = useId();
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const root = document.createElement("div");
    root.setAttribute(MODAL_PORTAL_ATTRIBUTE, "true");
    document.body.appendChild(root);
    setPortalRoot(root);

    return () => {
      root.remove();
    };
  }, []);

  useEffect(() => {
    if (!open || !portalRoot) {
      return;
    }

    return acquireModalBodyLock(portalRoot);
  }, [open, portalRoot]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusableElements = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => !element.hasAttribute("disabled"));
    const firstFocusable = focusableElements()[0];
    firstFocusable?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const elements = focusableElements();
      if (elements.length === 0) {
        event.preventDefault();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    dialog.addEventListener("keydown", handleKeyDown);
    return () => dialog.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      return;
    }

    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      if (activeModalLocks.length > 0) {
        focusTopModal();
        return;
      }

      const openButton = openButtonRef.current;
      if (openButton?.isConnected) {
        openButton.focus();
      }
    }
  }, [open]);

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
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
        <CreditSection title="Balance" variant="balance" className="sm:col-span-2">
          <Kpi dense label="Apertura" value={account.openingBalance} plain />
          <Kpi dense label="Cierre" value={account.closingBalance} toneClass={getBalanceToneClass(account.closingBalance)} plain />
          <Kpi dense label="Neto" value={account.monthNet} toneClass={getBalanceToneClass(account.monthNet)} plain />
          <Kpi dense label="Deuda" value={debt} toneClass="dashboard-money-expense" plain />
        </CreditSection>
        <CreditSection title="Movimientos" variant="movements">
          <Kpi dense label="Ingresos +" value={incomeTotal} toneClass="dashboard-money-income" plain />
          <Kpi dense label="Gastos -" value={expenseTotal * -1} toneClass="dashboard-money-expense" plain />
        </CreditSection>
        <CreditSection title="Compromisos" variant="commitments">
          <Kpi dense label="Pend. MSI" value={account.msiOutstanding} toneClass="dashboard-money-credit" plain />
          <Kpi dense label="Pend. normal" value={account.normalOutstanding} toneClass="dashboard-money-credit" plain />
        </CreditSection>
        <CreditSection title="Corte" variant="cutoff" className="sm:col-span-2">
          <Kpi dense label="Día de corte" value={account.cutoffDay ?? "No definido"} plain formatAsCurrency={false} />
          <Kpi dense label="Pago límite" value={account.paymentDueDay ?? "No definido"} plain formatAsCurrency={false} />
          <Kpi dense label="Pago estimado" value={account.estimatedCutoffCharges} toneClass="dashboard-money-credit" plain />
          <Kpi dense label="Pagos realizados" value={account.cutoffPayments} toneClass="dashboard-money-income" plain />
          <Kpi dense label="Pendiente del corte" value={account.cutoffPending * -1} toneClass="dashboard-money-expense" plain />
        </CreditSection>
      </div>

      <div className="mt-3 flex justify-end">
        <Button ref={openButtonRef} type="button" variant="ghost" className="h-8 w-full border-blue-400/60 bg-blue-500/15 px-3 text-xs text-blue-700 hover:border-blue-500/70 hover:bg-blue-500/25 hover:text-blue-800 dark:border-blue-700/60 dark:bg-blue-500/25 dark:text-blue-300 dark:hover:border-blue-500/70 dark:hover:bg-blue-500/35 dark:hover:text-blue-100 sm:w-auto" onClick={() => void openPendingModal()}>
          Ver cargos pendientes
        </Button>
      </div>

      {open && portalRoot ? createPortal(
        <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--color-overlay)] p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <Card ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={dialogTitleId} className="app-card flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl shadow-[var(--shadow-md)]">
            <div className="border-default flex items-start justify-between gap-3 border-b px-5 py-4">
              <div>
                <h3 id={dialogTitleId} className="text-primary text-lg font-semibold">Cargos pendientes · {account.name}</h3>
                <p className="text-muted text-xs">Separado por MSI y normal (revolvente).</p>
              </div>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cerrar</Button>
            </div>

            {loading ? <p className="text-muted px-5 pt-4 text-sm">Cargando cargos pendientes...</p> : null}
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {error ? <p className="border border-[var(--color-danger)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p> : null}

            {!loading && !error ? (
              <div className="grid gap-4 lg:grid-cols-2">
<PendingGroup title="MSI" toneClass="text-[var(--color-accent)]" items={msiItems} total={totalMsi} timezone={timezone} />
                 <PendingGroup title="Normal" toneClass="text-[var(--color-warning)]" items={normalItems} total={totalNormal} timezone={timezone} />
              </div>
            ) : null}
            </div>

            <div className="border-default flex justify-end border-t px-5 py-4">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cerrar</Button>
            </div>
          </Card>
        </div>,
        portalRoot
      ) : null}
    </>
  );
}

function CreditSection({
  title,
  children,
  variant = "movements",
  className = ""
}: {
  title: string;
  children: ReactNode;
  variant?: "balance" | "movements" | "commitments" | "cutoff";
  className?: string;
}) {
  const variantClass = variant === "balance"
    ? "dashboard-credit-balance"
    : variant === "cutoff"
      ? "dashboard-credit-cutoff"
      : variant === "commitments"
        ? "dashboard-subtle-credit"
        : "dashboard-subtle-neutral";

  return (
    <section className={`dashboard-subtle dashboard-credit-section ${variantClass} rounded-xl p-4 ${className}`}>
      <p className="m-0 mb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{title}</p>
      {/* `auto-fit` + mínimo por celda: si el panel no da para todas las columnas,
          los importes bajan a la fila siguiente en vez de quedar pegados. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-x-4 gap-y-3">{children}</div>
    </section>
  );
}

function PendingGroup({
  title,
  toneClass,
  items,
  total,
  timezone
}: {
  title: string;
  toneClass: string;
  items: CreditInstallmentItem[];
  total: number;
  timezone: string;
}) {
  return (
    <section className="app-panel space-y-2 rounded-xl border border-default p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className={`text-sm font-semibold ${toneClass}`}>{title}</h4>
        <p className="text-muted text-xs">{items.length} cargos</p>
      </div>

      <div className="border-default max-h-72 overflow-x-auto overflow-y-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-[var(--color-surface-3)] text-secondary">
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
                <td className="text-muted px-2 py-3" colSpan={4}>Sin cargos pendientes</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.installmentId} className="border-default border-t">
                  <td className="text-secondary px-2 py-2">{item.description}</td>
                  <td className="text-secondary px-2 py-2">{item.installmentNumber}/{item.months}</td>
                  <td className="text-secondary px-2 py-2">{formatDate(item.dueDate, timezone)}</td>
                  <td className="text-primary px-2 py-2 text-right font-semibold">{formatAmount(item.remainingAmount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-primary text-right text-sm font-semibold">Total: {formatAmount(total)}</p>
    </section>
  );
}

function Kpi({
  label,
  value,
  toneClass,
  variant = "neutral",
  compact = false,
  plain = false,
  dense = false,
  fullWidth = false,
  formatAsCurrency = true
}: {
  label: string;
  value: number | string;
  toneClass?: string;
  /** Rol del panel dentro de la tarjeta; solo aplica a la variante compact. */
  variant?: "neutral" | "accent" | "income" | "expense" | "credit";
  compact?: boolean;
  plain?: boolean;
  dense?: boolean;
  fullWidth?: boolean;
  formatAsCurrency?: boolean;
}) {
  const formattedValue = typeof value === "number" ? (formatAsCurrency ? formatAmount(value) : String(value)) : value;
  const subtleClass = variant === "neutral" ? "dashboard-subtle" : `dashboard-subtle dashboard-subtle-${variant}`;

  return (
    <div className={`${plain ? "px-0 py-0" : `${subtleClass} rounded-[var(--radius-sm)] px-3 py-2`}${fullWidth ? " col-span-2" : ""}`}
    >
      <p className={dense
        ? "m-0 text-[10px] uppercase tracking-wide text-muted"
        : plain
          ? "m-0 text-xs uppercase tracking-wide text-muted"
          : "m-0 text-[11px] uppercase tracking-wide text-muted"}>{label}</p>
      <p className={`m-0 ${dense ? "text-sm" : plain ? "text-lg" : compact ? "text-sm" : "text-base"} font-semibold tabular-nums ${toneClass ?? "text-primary"}`}>
        {formattedValue}
      </p>
    </div>
  );
}
