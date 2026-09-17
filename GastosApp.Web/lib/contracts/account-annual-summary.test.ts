import assert from "node:assert/strict";
import { test } from "node:test";
import {
  annualSummaryYearOptions,
  isAnnualSummaryYear,
  normalizeAccountAnnualSummary,
  parseAnnualSummaryYear
} from "./account-annual-summary.ts";

test("normalizeAccountAnnualSummary rechaza payloads sin identidad o año válido", () => {
  for (const input of [null, undefined, 42, "summary", [], {}, { accountId: 3 }, { year: 2026 }, { accountId: 0, year: 2026 }]) {
    assert.equal(normalizeAccountAnnualSummary(input), null);
  }

  assert.equal(normalizeAccountAnnualSummary({ accountId: 3, year: 0 }), null);
  assert.equal(normalizeAccountAnnualSummary({ accountId: 3, year: 9999 }), null);
});

test("normalizeAccountAnnualSummary conserva el saldo de un mes sin movimientos", () => {
  const summary = normalizeAccountAnnualSummary({
    accountId: 7,
    year: 2026,
    openingBalance: 1000,
    months: [
      { month: 1, income: 500, expense: 0, netTransfers: 0, closingBalance: 1500 },
      { month: 2, income: 0, expense: 0, netTransfers: 0, closingBalance: 1500 },
      { month: 3, income: 0, expense: 200, netTransfers: 0, closingBalance: 1300 }
    ],
    yearIncome: 500,
    yearExpense: 200,
    yearNetTransfers: 0,
    closingBalance: 1300
  });

  assert.ok(summary);
  assert.equal(summary.months.length, 3);
  assert.equal(summary.months[1].hasActivity, false);
  // El mes sin movimientos arrastra el saldo: nunca se reporta como cero.
  assert.equal(summary.months[1].closingBalance, 1500);
  assert.equal(summary.months[0].hasActivity, true);
  assert.equal(summary.months[2].hasActivity, true);
});

test("normalizeAccountAnnualSummary ordena, deduplica y descarta meses fuera de 1..12", () => {
  const summary = normalizeAccountAnnualSummary({
    AccountId: 4,
    Year: 2025,
    OpeningBalance: "250.5",
    Months: [
      { Month: 3, Income: "10", Expense: 0, NetTransfers: 0, ClosingBalance: "260.5" },
      { Month: 1, Income: 5, Expense: 0, NetTransfers: 0, ClosingBalance: 255.5 },
      { Month: 3, Income: 20, Expense: 0, NetTransfers: 0, ClosingBalance: 275.5 },
      { Month: 0, Income: 999 },
      { Month: 13, Income: 999 },
      { Month: "x", Income: 999 }
    ]
  });

  assert.ok(summary);
  assert.equal(summary.accountId, 4);
  assert.equal(summary.year, 2025);
  assert.equal(summary.openingBalance, 250.5);
  assert.deepEqual(
    summary.months.map((month) => month.month),
    [1, 3]
  );
  // El último valor declarado de un mes repetido es el que manda.
  assert.equal(summary.months[1].income, 20);
  assert.equal(summary.months[1].closingBalance, 275.5);
});

test("normalizeAccountAnnualSummary deriva agregados y cierre cuando el payload los omite", () => {
  const summary = normalizeAccountAnnualSummary({
    accountId: 9,
    year: 2024,
    months: [
      { month: 1, income: 100, expense: 40, netTransfers: -10 },
      { month: 2, income: 0, expense: 0, netTransfers: 25, closingBalance: 75 }
    ]
  });

  assert.ok(summary);
  assert.equal(summary.yearIncome, 100);
  assert.equal(summary.yearExpense, 40);
  assert.equal(summary.yearNetTransfers, 15);
  assert.equal(summary.openingBalance, 0);
  // Sin cierre anual declarado, el cierre es el del último mes del payload.
  assert.equal(summary.closingBalance, 75);
  // Una transferencia también es movimiento, aunque no sea ingreso ni gasto.
  assert.equal(summary.months[1].hasActivity, true);
});

test("parseAnnualSummaryYear acepta solo años utiles y cae al respaldo", () => {
  assert.equal(parseAnnualSummaryYear("2026", 2000), 2026);
  assert.equal(parseAnnualSummaryYear(2026, 2000), 2026);
  assert.equal(parseAnnualSummaryYear(" 2026 ", 2000), 2026);

  for (const value of [null, undefined, "", "abc", "26", "0", "9999", -1, 2026.5, "2026-01"]) {
    assert.equal(parseAnnualSummaryYear(value, 2000), 2000);
  }

  assert.equal(isAnnualSummaryYear("9998"), true);
  assert.equal(isAnnualSummaryYear("9999"), false);
});

test("annualSummaryYearOptions devuelve años descendentes y acotados", () => {
  assert.deepEqual(annualSummaryYearOptions(2024, 2026), [2026, 2025, 2024]);
  // Un inicio posterior al año pedido se recorta al año pedido.
  assert.deepEqual(annualSummaryYearOptions(2030, 2026), [2026]);
  // Rango inválido de destino: sin opciones en lugar de años inventados.
  assert.deepEqual(annualSummaryYearOptions(2020, 0), []);

  const capped = annualSummaryYearOptions(1900, 2026);
  assert.equal(capped.length, 30);
  assert.equal(capped[0], 2026);
  assert.equal(capped.at(-1), 1997);
});
