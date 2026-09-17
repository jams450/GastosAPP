import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_DASHBOARD_TAB,
  DEFAULT_HORIZON_MONTHS,
  isMonthScopedTab,
  parseDashboardTab,
  parseHorizonMonths
} from "./dashboard-tabs.ts";

test("parseDashboardTab acepta ids válidos y cae a resumen", () => {
  assert.equal(parseDashboardTab("efectivo"), "efectivo");
  assert.equal(parseDashboardTab("credito"), "credito");
  assert.equal(parseDashboardTab("proyeccion"), "proyeccion");
  assert.equal(parseDashboardTab("otra"), DEFAULT_DASHBOARD_TAB);
  assert.equal(parseDashboardTab(null), DEFAULT_DASHBOARD_TAB);
  assert.equal(parseDashboardTab(undefined), DEFAULT_DASHBOARD_TAB);
});

test("isMonthScopedTab sólo marca resumen y efectivo", () => {
  assert.equal(isMonthScopedTab("resumen"), true);
  assert.equal(isMonthScopedTab("efectivo"), true);
  assert.equal(isMonthScopedTab("credito"), false);
  assert.equal(isMonthScopedTab("proyeccion"), false);
});

test("parseHorizonMonths sólo acepta 3, 6 y 12", () => {
  assert.equal(parseHorizonMonths("3"), 3);
  assert.equal(parseHorizonMonths("12"), 12);
  assert.equal(parseHorizonMonths("6"), 6);
  assert.equal(parseHorizonMonths("9"), DEFAULT_HORIZON_MONTHS);
  assert.equal(parseHorizonMonths(""), DEFAULT_HORIZON_MONTHS);
  assert.equal(parseHorizonMonths(null), DEFAULT_HORIZON_MONTHS);
});
