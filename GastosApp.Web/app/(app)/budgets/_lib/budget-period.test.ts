import assert from "node:assert/strict";
import { test } from "node:test";
import {
  budgetPeriodQueryValue,
  isBudgetPeriod,
  nextPeriod,
  periodFromUrlQuery,
  periodNavLabel,
  previousPeriod,
  shiftPeriod
} from "./budget-period.ts";

test("isBudgetPeriod acepta yyyy-MM con mes real", () => {
  assert.equal(isBudgetPeriod("2026-01"), true);
  assert.equal(isBudgetPeriod("2026-12"), true);
  assert.equal(isBudgetPeriod("2026-13"), false);
  assert.equal(isBudgetPeriod("2026-00"), false);
  assert.equal(isBudgetPeriod("2026-1"), false);
  assert.equal(isBudgetPeriod("26-01"), false);
  assert.equal(isBudgetPeriod(""), false);
  assert.equal(isBudgetPeriod(null), false);
  assert.equal(isBudgetPeriod(undefined), false);
  assert.equal(isBudgetPeriod(202601), false);
});

test("shiftPeriod cruza el año en ambos sentidos", () => {
  assert.equal(shiftPeriod("2026-01", -1), "2025-12");
  assert.equal(shiftPeriod("2025-12", 1), "2026-01");
  assert.equal(shiftPeriod("2026-01", 1), "2026-02");
  assert.equal(shiftPeriod("2026-12", -1), "2026-11");
});

test("shiftPeriod mueve varios meses de una vez", () => {
  assert.equal(shiftPeriod("2026-01", 11), "2026-12");
  assert.equal(shiftPeriod("2026-12", -11), "2026-01");
  assert.equal(shiftPeriod("2026-06", 18), "2027-12");
  assert.equal(shiftPeriod("2026-06", -18), "2024-12");
  assert.equal(shiftPeriod("2026-06", 0), "2026-06");
});

test("shiftPeriod con años completos conserva el mes", () => {
  assert.equal(shiftPeriod("2026-03", 12), "2027-03");
  assert.equal(shiftPeriod("2026-03", -12), "2025-03");
  assert.equal(shiftPeriod("2026-03", 24), "2028-03");
  assert.equal(shiftPeriod("2026-03", -24), "2024-03");
});

test("shiftPeriod devuelve null en vez de fabricar una fecha", () => {
  assert.equal(shiftPeriod("2026-13", 1), null);
  assert.equal(shiftPeriod("2026-1", 1), null);
  assert.equal(shiftPeriod("", -1), null);
  assert.equal(shiftPeriod("2026-01", 1.5), null);
  assert.equal(shiftPeriod("2026-01", Number.NaN), null);
  assert.equal(shiftPeriod("2026-01", Number.POSITIVE_INFINITY), null);
  assert.equal(shiftPeriod("0000-01", -1), null);
  assert.equal(shiftPeriod("9999-12", 1), null);
});

test("previousPeriod y nextPeriod son los saltos de un mes", () => {
  assert.equal(previousPeriod("2026-03"), "2026-02");
  assert.equal(nextPeriod("2026-03"), "2026-04");
  assert.equal(previousPeriod("2026-01"), "2025-12");
  assert.equal(nextPeriod("2025-12"), "2026-01");
  assert.equal(previousPeriod("2026-13"), null);
  assert.equal(nextPeriod("2026-13"), null);
});

test("budgetPeriodQueryValue omite el periodo en curso para dejar la URL limpia", () => {
  assert.equal(budgetPeriodQueryValue("2026-10", "2026-10"), null);
  assert.equal(budgetPeriodQueryValue("2026-09", "2026-10"), "2026-09");
  assert.equal(budgetPeriodQueryValue("2026-11", "2026-10"), "2026-11");
  assert.equal(budgetPeriodQueryValue("2026-13", "2026-10"), null);
  assert.equal(budgetPeriodQueryValue("2026-1", "2026-10"), null);
  assert.equal(budgetPeriodQueryValue("", "2026-10"), null);
});

test("periodNavLabel nombra el mes destino en español", () => {
  assert.equal(periodNavLabel("2026-09", -1), "Mes anterior: septiembre de 2026");
  assert.equal(periodNavLabel("2026-12", 1), "Mes siguiente: diciembre de 2026");
  assert.equal(periodNavLabel("2026-01", 1), "Mes siguiente: enero de 2026");
});

test("shiftPeriod no produce el año cero, que no es un periodo del dominio", () => {
  // `0000` cabe en `yyyy` pero no es un periodo que el backend acepte: la resta debe decaer a null.
  assert.equal(shiftPeriod("0001-01", -1), null);
  assert.equal(previousPeriod("0001-01"), null);
  // Dentro del año 1 sí es un salto válido: el límite es el año, no el número de meses.
  assert.equal(shiftPeriod("0001-12", -11), "0001-01");
  assert.equal(shiftPeriod("0001-01", 0), "0001-01");
  assert.equal(shiftPeriod("9999-12", 1), null);
});

test("periodFromUrlQuery lee el periodo de la URL y cae al mes en curso", () => {
  // La URL es la única fuente externa: atrás/adelante cambian el query y la pantalla adopta el valor.
  assert.equal(periodFromUrlQuery("period=2026-08", "2026-10"), "2026-08");
  assert.equal(periodFromUrlQuery("tab=partidas&period=2025-12", "2026-10"), "2025-12");
  assert.equal(periodFromUrlQuery("period=2025-12&tab=partidas", "2026-10"), "2025-12");

  // Sin `?period=`, o con uno ilegible, se vuelve al mes en curso en vez de dejar el mes pegado.
  assert.equal(periodFromUrlQuery("", "2026-10"), "2026-10");
  assert.equal(periodFromUrlQuery("tab=partidas", "2026-10"), "2026-10");
  assert.equal(periodFromUrlQuery("period=2026-13", "2026-10"), "2026-10");
  assert.equal(periodFromUrlQuery("period=", "2026-10"), "2026-10");
  assert.equal(periodFromUrlQuery("period=2026-1", "2026-10"), "2026-10");
});
