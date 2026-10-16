import type { DashboardAccountOverview } from "@/lib/contracts/dashboard";

/**
 * Métricas de crédito derivadas en un único lugar para que tarjetas y KPIs
 * nunca muestren resultados distintos (criterio de aceptación Fase 1).
 *
 * Convención:
 * - `debt` = deuda canónica de la cuenta (`currentDebt`, normal + MSI) tal como la expone
 *   el backend. `normalOutstanding + msiOutstanding` sólo se usa si el contrato no la trae.
 * - `available` = disponible = `creditLimit - debt`; puede ser negativo (excedido).
 *   Si el backend ya expone `creditAvailable`, ese valor manda.
 * - `creditLimit === null` (dato ausente) ⇒ sin disponible y sin porcentaje.
 */
export type AccountCreditMetrics = {
  creditLimit: number | null;
  debt: number;
  available: number | null;
  /** Porcentaje de utilización; `null` cuando no hay límite utilizable. */
  utilization: number | null;
  /** `true` cuando la utilización supera 100% o el disponible queda negativo. */
  exceeded: boolean;
};

export function resolveAccountCredit(account: DashboardAccountOverview): AccountCreditMetrics {
  const creditLimit = account.creditLimit;
  const debt = account.currentDebt;

  const available =
    account.creditAvailable !== null
      ? account.creditAvailable
      : creditLimit !== null
        ? creditLimit - debt
        : null;

  const utilization = creditLimit !== null && creditLimit > 0 ? (debt / creditLimit) * 100 : null;
  const exceeded = utilization !== null ? utilization > 100 : available !== null && available < 0;

  return { creditLimit, debt, available, utilization, exceeded };
}

export type AccountBalanceDisplay =
  | {
      kind: "credit";
      creditLimit: number | null;
      /** Deuda canónica pendiente (`currentDebt`, normal + MSI). No se deriva del saldo contable. */
      debt: number;
      /** Disponible canónico; `null` cuando no hay límite registrado ni dato del backend. */
      available: number | null;
      /** `true` cuando la utilización supera 100% o el disponible queda negativo. */
      exceeded: boolean;
    }
  | {
      kind: "cash";
      /** Saldo contable de la cuenta de efectivo; conserva el comportamiento previo. */
      balance: number;
    };

/**
 * Selector de presentación puro para el saldo de una cuenta.
 *
 * Las tarjetas de crédito nunca muestran el saldo contable genérico como deuda o
 * disponible: usan la deuda canónica (`currentDebt`) y el disponible (`creditAvailable`
 * o `creditLimit - debt`). Las cuentas de efectivo conservan su saldo contable.
 */
export function resolveAccountBalanceDisplay(account: DashboardAccountOverview): AccountBalanceDisplay {
  if (!account.isCredit) {
    return { kind: "cash", balance: account.currentBalance };
  }

  const metrics = resolveAccountCredit(account);
  return {
    kind: "credit",
    creditLimit: metrics.creditLimit,
    debt: metrics.debt,
    available: metrics.available,
    exceeded: metrics.exceeded
  };
}

export type CreditOverviewTotals = {
  /** Suma de disponibles con dato; `null` si ninguna cuenta activa lo expone. */
  available: number | null;
  debt: number;
  pendingNormal: number;
  pendingMsi: number;
  accounts: number;
};

export function summarizeCredit(accounts: DashboardAccountOverview[]): CreditOverviewTotals {
  const creditAccounts = accounts.filter((account) => account.isCredit && account.active);

  let available: number | null = null;
  let debt = 0;
  let pendingNormal = 0;
  let pendingMsi = 0;

  for (const account of creditAccounts) {
    const metrics = resolveAccountCredit(account);
    if (metrics.available !== null) {
      available = (available ?? 0) + metrics.available;
    }

    debt += metrics.debt;
    pendingNormal += account.normalOutstanding;
    pendingMsi += account.msiOutstanding;
  }

  return { available, debt, pendingNormal, pendingMsi, accounts: creditAccounts.length };
}

export function activeAccounts(accounts: DashboardAccountOverview[]): DashboardAccountOverview[] {
  return accounts.filter((account) => account.active);
}

/** Suma de saldos de cierre para el conjunto recibido (usar con `activeAccounts`). */
export function sumClosingBalance(accounts: DashboardAccountOverview[]): number {
  return accounts.reduce((total, account) => total + account.closingBalance, 0);
}

/** Cuentas activas ordenadas por movimiento del periodo (mayor primero). */
export function byMonthlyActivity(accounts: DashboardAccountOverview[]): DashboardAccountOverview[] {
  return [...accounts].sort((a, b) => Math.abs(b.monthNet) - Math.abs(a.monthNet));
}
