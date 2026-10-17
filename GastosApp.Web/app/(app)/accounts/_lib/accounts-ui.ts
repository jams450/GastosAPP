import type { Account } from "@/lib/contracts/accounts";

const badgeBase = "tabler-badge tabler-badge-solid";

/**
 * Catálogo de cuentas como dos secciones canónicas. Es lógica pura (sin imports de runtime)
 * para poder verificar la separación y la honestidad de los datos con Node.
 *
 * Regla: un campo canónico ausente se muestra como no disponible; nunca como cero y nunca
 * inferido del saldo contable (`currentBalance`).
 */
export const ACCOUNT_METRIC_UNAVAILABLE_LABEL = "No disponible";

export type AccountsCatalogSectionKey = "cash" | "credit";

export type AccountMetric =
  | "currentBalance"
  | "initialBalance"
  | "creditLimit"
  | "normalOutstanding"
  | "msiOutstanding"
  | "currentDebt"
  | "creditAvailable";

export type AccountsCatalogSection = {
  key: AccountsCatalogSectionKey;
  title: string;
  accounts: Account[];
  /** Columnas de resumen de la sección. En crédito excluye saldos contables a propósito. */
  metrics: AccountMetric[];
};

const CASH_METRICS: AccountMetric[] = ["currentBalance", "initialBalance"];
const CREDIT_METRICS: AccountMetric[] = [
  "creditLimit",
  "normalOutstanding",
  "msiOutstanding",
  "currentDebt",
  "creditAvailable"
];

const METRIC_LABELS: Record<AccountMetric, string> = {
  currentBalance: "Saldo actual",
  initialBalance: "Saldo inicial",
  creditLimit: "Límite de crédito",
  normalOutstanding: "Deuda normal",
  msiOutstanding: "Deuda MSI",
  currentDebt: "Deuda total",
  creditAvailable: "Crédito disponible"
};

export function buildAccountsCatalogSections(accounts: Account[]): AccountsCatalogSection[] {
  return [
    { key: "cash", title: "Efectivo", accounts: accounts.filter((account) => !account.isCredit), metrics: CASH_METRICS },
    { key: "credit", title: "Crédito", accounts: accounts.filter((account) => account.isCredit), metrics: CREDIT_METRICS }
  ];
}

/**
 * Valor canónico de una métrica. Devuelve `null` cuando el dato no está disponible, sin
 * sustituirlo por cero ni por otra columna.
 */
export function accountMetricValue(account: Account, metric: AccountMetric): number | null {
  // Sin límite declarado no puede existir crédito disponible, aunque un payload inconsistente
  // traiga un número: se reporta como no disponible en vez de mostrar un dato inventado.
  if (metric === "creditAvailable" && account.creditLimit === null) {
    return null;
  }

  return account[metric] ?? null;
}

export function getAccountMetricLabel(metric: AccountMetric): string {
  return METRIC_LABELS[metric];
}

export function getAccountTypeLabel(account: Account) {
  return account.isCredit ? "Crédito" : "Efectivo";
}

export function getAccountTypeBadgeClass(account: Account) {
  return `${badgeBase} ${account.isCredit ? "tabler-badge-primary" : "tabler-badge-success"}`;
}

export function getAccountStatusLabel(account: Account) {
  return account.active ? "Activa" : "Inactiva";
}

export function getAccountStatusBadgeClass(account: Account) {
  return `${badgeBase} ${account.active ? "tabler-badge-success" : "tabler-badge-danger"}`;
}
