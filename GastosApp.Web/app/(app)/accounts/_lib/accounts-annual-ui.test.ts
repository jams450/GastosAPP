import assert from "node:assert/strict";
import { test } from "node:test";
import type { AccountAnnualSummaryMonth } from "../../../../lib/contracts/account-annual-summary.ts";
import {
  accountAnnualSummaryHref,
  annualSummaryCopy,
  buildAnnualBalanceChart,
  buildAnnualFlowChart,
  currentYearInMexicoCity,
  earliestSummaryYear,
  formatAnnualMonthName,
  formatAnnualMonthShort,
  hasAnnualActivity
} from "./accounts-annual-ui.ts";

function month(partial: Partial<AccountAnnualSummaryMonth> & { month: number; closingBalance: number }): AccountAnnualSummaryMonth {
  return { income: 0, expense: 0, netTransfers: 0, hasActivity: false, ...partial };
}

test("accountAnnualSummaryHref apunta al histórico sin fijar el año", () => {
  assert.equal(accountAnnualSummaryHref(12), "/accounts/12?tab=mensual");
});

test("etiquetas de mes cubren 1..12 y no inventan nombres fuera de rango", () => {
  assert.equal(formatAnnualMonthShort(1), "ene");
  assert.equal(formatAnnualMonthShort(12), "dic");
  assert.equal(formatAnnualMonthName(9), "Septiembre");
  assert.equal(formatAnnualMonthShort(13), "13");
  assert.equal(formatAnnualMonthName(0), "0");
});

test("earliestSummaryYear usa el inicio de la cuenta y si no una ventana corta", () => {
  assert.equal(earliestSummaryYear("2019-03-01", 2026), 2019);
  assert.equal(earliestSummaryYear(null, 2026), 2021);
  // Un inicio posterior al año actual es incoherente: se ignora.
  assert.equal(earliestSummaryYear("2030-01-01", 2026), 2021);
});

test("hasAnnualActivity detecta meses sin movimientos", () => {
  const empty = [month({ month: 1, closingBalance: 500 }), month({ month: 2, closingBalance: 500 })];
  assert.equal(hasAnnualActivity(empty), false);
  assert.equal(hasAnnualActivity([...empty, month({ month: 3, closingBalance: 400, expense: 100, hasActivity: true })]), true);
});

test("annualSummaryCopy no proyecta y aclara el signo solo en crédito", () => {
  assert.equal(annualSummaryCopy(false).balanceNote, null);
  assert.match(annualSummaryCopy(true).balanceNote ?? "", /deuda o saldo a favor/i);
  assert.match(annualSummaryCopy(false).flowCaption, /transferencias van aparte/i);
});

test("buildAnnualFlowChart ignora transferencias y reporta el pico", () => {
  const model = buildAnnualFlowChart([
    month({ month: 1, closingBalance: 100, income: 1000, hasActivity: true }),
    month({ month: 2, closingBalance: 2500, netTransfers: 1500, hasActivity: true }),
    month({ month: 3, closingBalance: 2300, expense: 200, hasActivity: true })
  ]);

  assert.equal(model.peak, 1000);
  assert.equal(model.hasData, true);
  // Mes 2 solo tiene transferencias: no genera barras.
  assert.equal(model.bars[1].incomeHeight, 0);
  assert.equal(model.bars[1].expenseHeight, 0);
  // Las alturas son proporcionales al pico.
  assert.ok(model.bars[0].incomeHeight > model.bars[2].expenseHeight);
});

test("buildAnnualFlowChart marca el año sin flujo", () => {
  const model = buildAnnualFlowChart([month({ month: 1, closingBalance: 100, netTransfers: 50, hasActivity: true })]);
  assert.equal(model.hasData, false);
  assert.equal(model.peak, 0);
});

test("buildAnnualBalanceChart conserva el saldo arrastrado de un mes sin movimientos", () => {
  const months = [
    month({ month: 1, closingBalance: 1500, income: 500, hasActivity: true }),
    month({ month: 2, closingBalance: 1500 }),
    month({ month: 3, closingBalance: 1200, expense: 300, hasActivity: true })
  ];
  const model = buildAnnualBalanceChart(months);

  assert.ok(model);
  assert.equal(model.points.length, 3);
  // El segundo punto no cae a cero ni se omite: mantiene el saldo del mes anterior.
  assert.equal(model.points[1].value, 1500);
  assert.equal(model.points[1].value, model.points[0].value);
  assert.equal(model.finalValue, 1200);
  assert.equal(model.polyline.split(" ").length, 3);
});

test("buildAnnualBalanceChart cubre cuentas con saldo constante y saldo negativo", () => {
  assert.equal(buildAnnualBalanceChart([]), null);

  const flat = buildAnnualBalanceChart([month({ month: 1, closingBalance: 400 }), month({ month: 2, closingBalance: 400 })]);
  assert.ok(flat);
  // Rango degenerado: se abre para que la línea no colapse en un borde.
  assert.ok(flat.max > flat.min);
  assert.equal(flat.zeroY, null);

  const negative = buildAnnualBalanceChart([month({ month: 1, closingBalance: -200 }), month({ month: 2, closingBalance: -50 })]);
  assert.ok(negative);
  assert.equal(negative.zeroY, null);
  assert.equal(negative.finalValue, -50);
});

test("currentYearInMexicoCity devuelve un año plausible", () => {
  const year = currentYearInMexicoCity();
  assert.ok(Number.isInteger(year) && year >= 2020 && year <= 2100, `año inesperado: ${year}`);
});
