import type { Account } from "@/lib/contracts/accounts";

export type AccountUpsertPayload = {
  name: string;
  color: string;
  active: boolean;
  startDate: string;
  isCredit: boolean;
  dueDay: number | null;
  paymentDueDay: number | null;
  earnsInterest: boolean;
  annualInterestRate: number;
  initialBalance: number;
  currentBalance: number;
  creditLimit: number | null;
};

export type AccountFormErrors = Partial<Record<keyof AccountUpsertPayload, string>>;

export function toAccountRequestPayload(form: AccountUpsertPayload): AccountUpsertPayload {
  return {
    name: form.name.trim(),
    color: form.color,
    active: form.active,
    startDate: form.startDate,
    isCredit: form.isCredit,
    dueDay: form.isCredit ? form.dueDay : null,
    paymentDueDay: form.isCredit ? form.paymentDueDay : null,
    earnsInterest: form.earnsInterest,
    annualInterestRate: form.earnsInterest ? form.annualInterestRate : 0,
    initialBalance: form.initialBalance,
    currentBalance: form.currentBalance,
    creditLimit: form.isCredit ? form.creditLimit : null
  };
}

export function toAccountUpsertPayload(account?: Account): AccountUpsertPayload {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  if (!account) {
    return {
      name: "",
      color: "#0ea5e9",
      active: true,
      startDate: date,
      isCredit: false,
      dueDay: null,
      paymentDueDay: null,
      earnsInterest: false,
      annualInterestRate: 0,
      initialBalance: 0,
      currentBalance: 0,
      creditLimit: null
    };
  }

  return {
    name: account.name,
    color: account.color,
    active: account.active,
    startDate: account.startDate ? account.startDate.slice(0, 10) : date,
    isCredit: account.isCredit,
    dueDay: account.dueDay,
    paymentDueDay: account.paymentDueDay,
    earnsInterest: account.earnsInterest,
    annualInterestRate: account.annualInterestRate,
    initialBalance: account.initialBalance,
    currentBalance: account.currentBalance,
    creditLimit: account.creditLimit
  };
}

export function validateAccountPayload(payload: AccountUpsertPayload): AccountFormErrors {
  const errors: AccountFormErrors = {};

  if (!payload.name.trim()) {
    errors.name = "Nombre requerido";
  }

  if (!/^#[0-9a-fA-F]{6}$/.test(payload.color)) {
    errors.color = "Color inválido";
  }

  if (!payload.startDate) {
    errors.startDate = "Fecha de inicio requerida";
  }

  if (payload.isCredit && (!payload.dueDay || payload.dueDay < 1 || payload.dueDay > 31)) {
    errors.dueDay = "Día de corte requerido (1-31)";
  }

  if (payload.paymentDueDay !== null && (payload.paymentDueDay < 1 || payload.paymentDueDay > 31)) {
    errors.paymentDueDay = "Pago límite debe estar entre 1 y 31";
  }

  if (payload.isCredit && (!payload.creditLimit || payload.creditLimit <= 0)) {
    errors.creditLimit = "Límite de crédito debe ser mayor a 0";
  }

  if (payload.earnsInterest && payload.annualInterestRate <= 0) {
    errors.annualInterestRate = "Tasa anual debe ser mayor a 0";
  }

  return errors;
}
