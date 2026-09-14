import type { Account } from "@/lib/contracts/accounts";

const badgeBase = "tabler-badge tabler-badge-solid";

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
