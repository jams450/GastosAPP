import assert from "node:assert/strict";
import { test } from "node:test";
import { activeAccounts, byMonthlyActivity, resolveAccountBalanceDisplay, resolveAccountCredit, sumClosingBalance, summarizeCredit } from "./dashboard-metrics.ts";
import type { DashboardAccountOverview } from "@/lib/contracts/dashboard";

function account(overrides: Partial<DashboardAccountOverview> = {}): DashboardAccountOverview {
  const base: DashboardAccountOverview = {
    accountId: 1,
    name: "Tarjeta",
    active: true,
    isCredit: true,
    cutoffDay: null,
    paymentDueDay: null,
    initialBalance: 0,
    openingBalance: 0,
    currentBalance: 0,
    monthIncome: 0,
    monthExpense: 0,
    monthTransferIn: 0,
    monthTransferOut: 0,
    monthNet: 0,
    closingBalance: 0,
    creditLimit: null,
    periodStart: null,
    periodEnd: null,
    periodSpent: 0,
    estimatedCutoffCharges: 0,
    cutoffPayments: 0,
    cutoffPending: 0,
    msiOutstanding: 0,
    normalOutstanding: 0,
    currentDebt: 0,
    creditAvailable: null
  };

  const merged = { ...base, ...overrides };
  // Salvo que el test fije la deuda canónica, se deriva como el backend: normal + MSI.
  return { ...merged, currentDebt: overrides.currentDebt ?? merged.normalOutstanding + merged.msiOutstanding };
}

test("resolveAccountCredit suma deuda normal + MSI y deriva disponible", () => {
  const metrics = resolveAccountCredit(account({ creditLimit: 10000, normalOutstanding: 2500, msiOutstanding: 1500 }));

  assert.equal(metrics.debt, 4000);
  assert.equal(metrics.available, 6000);
  assert.equal(metrics.utilization, 40);
  assert.equal(metrics.exceeded, false);
});

test("resolveAccountCredit permite disponible negativo y marca excedido sobre 100%", () => {
  const metrics = resolveAccountCredit(account({ creditLimit: 1000, normalOutstanding: 900, msiOutstanding: 600 }));

  assert.equal(metrics.debt, 1500);
  assert.equal(metrics.available, -500);
  assert.equal(metrics.utilization, 150);
  assert.equal(metrics.exceeded, true);
});

test("resolveAccountCredit sin límite no inventa disponible ni porcentaje", () => {
  const metrics = resolveAccountCredit(account({ creditLimit: null, normalOutstanding: 300, msiOutstanding: 200 }));

  assert.equal(metrics.debt, 500);
  assert.equal(metrics.available, null);
  assert.equal(metrics.utilization, null);
  assert.equal(metrics.exceeded, false);
});

test("resolveAccountCredit prefiere creditAvailable del backend cuando existe", () => {
  const metrics = resolveAccountCredit(
    account({ creditLimit: 10000, normalOutstanding: 2500, msiOutstanding: 1500, creditAvailable: 1234.5 })
  );

  assert.equal(metrics.available, 1234.5);
});

test("resolveAccountCredit usa currentDebt canónico del backend sobre los saldos pendientes", () => {
  const metrics = resolveAccountCredit(
    account({ creditLimit: 5000, currentDebt: 1234, normalOutstanding: 100, msiOutstanding: 200 })
  );

  assert.equal(metrics.debt, 1234);
  assert.equal(metrics.available, 3766);
});

test("resolveAccountBalanceDisplay muestra deuda y disponible canónicos para la tarjeta 10000/5000", () => {
  const display = resolveAccountBalanceDisplay(
    account({ creditLimit: 10000, currentDebt: 5000, currentBalance: 5000 })
  );

  assert.equal(display.kind, "credit");
  if (display.kind !== "credit") throw new Error("esperado crédito");
  assert.equal(display.creditLimit, 10000);
  assert.equal(display.debt, 5000);
  assert.equal(display.available, 5000);
  assert.equal(display.exceeded, false);
});

test("resolveAccountBalanceDisplay ignora el saldo genérico en la tarjeta 200000 con compra de 1000", () => {
  const display = resolveAccountBalanceDisplay(
    account({ creditLimit: 200000, currentDebt: 1000, currentBalance: -1000 })
  );

  assert.equal(display.kind, "credit");
  if (display.kind !== "credit") throw new Error("esperado crédito");
  assert.equal(display.debt, 1000);
  assert.equal(display.available, 199000);
});

test("resolveAccountBalanceDisplay no deja que +5000/-1000 de saldo genérico afecten deuda o disponible", () => {
  const positive = resolveAccountBalanceDisplay(
    account({ creditLimit: 10000, currentDebt: 5000, currentBalance: 5000 })
  );
  const negative = resolveAccountBalanceDisplay(
    account({ creditLimit: 10000, currentDebt: 5000, currentBalance: -1000 })
  );

  assert.equal(positive.kind, "credit");
  assert.equal(negative.kind, "credit");
  if (positive.kind !== "credit" || negative.kind !== "credit") throw new Error("esperado crédito");
  assert.equal(positive.debt, 5000);
  assert.equal(positive.available, 5000);
  assert.equal(negative.debt, 5000);
  assert.equal(negative.available, 5000);
});

test("resolveAccountBalanceDisplay conserva el saldo de las cuentas de efectivo", () => {
  const display = resolveAccountBalanceDisplay(
    account({ isCredit: false, creditLimit: null, currentDebt: 0, currentBalance: 1500.5 })
  );

  assert.equal(display.kind, "cash");
  if (display.kind !== "cash") throw new Error("esperado efectivo");
  assert.equal(display.balance, 1500.5);
});

test("resolveAccountBalanceDisplay sin límite registrado no inventa disponible", () => {
  const display = resolveAccountBalanceDisplay(
    account({ creditLimit: null, currentDebt: 800, currentBalance: 800 })
  );

  assert.equal(display.kind, "credit");
  if (display.kind !== "credit") throw new Error("esperado crédito");
  assert.equal(display.creditLimit, null);
  assert.equal(display.debt, 800);
  assert.equal(display.available, null);
});

test("resolveAccountBalanceDisplay conserva el disponible negativo cuando el crédito está excedido", () => {
  const display = resolveAccountBalanceDisplay(
    account({ creditLimit: 1000, currentDebt: 1500, currentBalance: 1500 })
  );

  assert.equal(display.kind, "credit");
  if (display.kind !== "credit") throw new Error("esperado crédito");
  assert.equal(display.available, -500);
  assert.equal(display.exceeded, true);
});

test("summarizeCredit ignora cuentas inactivas y no-crédito", () => {
  const totals = summarizeCredit([
    account({ accountId: 1, creditLimit: 10000, normalOutstanding: 1000, msiOutstanding: 500 }),
    account({ accountId: 2, creditLimit: 5000, normalOutstanding: 100, msiOutstanding: 0, active: false }),
    account({ accountId: 3, isCredit: false, creditLimit: 9999, normalOutstanding: 9999 })
  ]);

  assert.equal(totals.accounts, 1);
  assert.equal(totals.available, 8500);
  assert.equal(totals.debt, 1500);
  assert.equal(totals.pendingNormal, 1000);
  assert.equal(totals.pendingMsi, 500);
});

test("summarizeCredit devuelve available null si ninguna cuenta activa lo expone", () => {
  const totals = summarizeCredit([account({ accountId: 1, creditLimit: null, normalOutstanding: 100 })]);

  assert.equal(totals.available, null);
  assert.equal(totals.debt, 100);
});

test("activeAccounts y byMonthlyActivity filtran inactivas y ordenan por movimiento", () => {
  const active = activeAccounts([
    account({ accountId: 1, active: true }),
    account({ accountId: 2, active: false })
  ]);
  assert.deepEqual(active.map((item) => item.accountId), [1]);

  const ordered = byMonthlyActivity([
    account({ accountId: 1, monthNet: 100 }),
    account({ accountId: 2, monthNet: -500 }),
    account({ accountId: 3, monthNet: 250 })
  ]);
  assert.deepEqual(ordered.map((item) => item.accountId), [2, 3, 1]);
});

test("sumClosingBalance suma saldos y excluye inactivas cuando se combina con activeAccounts", () => {
  const accounts = [
    account({ accountId: 1, closingBalance: 1200.5 }),
    account({ accountId: 2, closingBalance: 300, active: false })
  ];

  assert.equal(sumClosingBalance(activeAccounts(accounts)), 1200.5);
  assert.equal(sumClosingBalance(accounts), 1500.5);
});
