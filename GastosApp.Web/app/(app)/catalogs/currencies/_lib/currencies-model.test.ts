import assert from "node:assert/strict";
import { test } from "node:test";
import type { Currency, LatestFxRate } from "@/lib/contracts/currencies.ts";
import { buildCurrencyRows, describeSyncResult, formatRate, formatRateDate, rateLabel } from "./currencies-model.ts";

function currency(overrides: Partial<Currency> = {}): Currency {
  return { code: "USD", name: "Dólar estadounidense", symbol: "US$", decimals: 2, isBase: false, ...overrides };
}

function rate(overrides: Partial<LatestFxRate> = {}): LatestFxRate {
  return { currencyCode: "USD", rateDate: "2026-10-16", rateMxn: 17.25, source: "banxico", ...overrides };
}

test("una divisa extranjera toma la tasa de su propio código", () => {
  const rows = buildCurrencyRows(
    [currency({ code: "USD" }), currency({ code: "EUR" })],
    [rate({ currencyCode: "USD", rateMxn: 17.25 }), rate({ currencyCode: "EUR", rateMxn: 18.4 })]
  );

  assert.equal(rows[0].rateMxn, 17.25);
  assert.equal(rows[1].rateMxn, 18.4);
});

test("la divisa base nunca toma tasa, aunque el servidor mande una", () => {
  const rows = buildCurrencyRows(
    [currency({ code: "MXN", isBase: true })],
    [rate({ currencyCode: "MXN", rateMxn: 1 })]
  );

  // Mostrar "1.00 MXN" para MXN es ruido, no información: la base es la unidad de cuenta.
  assert.equal(rows[0].rateMxn, null);
  assert.equal(rows[0].rateDate, null);
  assert.equal(rows[0].source, null);
});

test("una divisa sin publicación queda sin tasa en vez de heredar la de otra", () => {
  const rows = buildCurrencyRows([currency({ code: "JPY" })], [rate({ currencyCode: "USD" })]);

  assert.equal(rows[0].rateMxn, null);
  assert.equal(rows[0].rateDate, null);
});

test("se conserva el orden del catálogo y no el de las tasas", () => {
  const rows = buildCurrencyRows(
    [currency({ code: "MXN", isBase: true }), currency({ code: "USD" }), currency({ code: "EUR" })],
    [rate({ currencyCode: "EUR" }), rate({ currencyCode: "USD" })]
  );

  assert.deepEqual(
    rows.map((row) => row.code),
    ["MXN", "USD", "EUR"]
  );
});

test("una tasa se muestra con dos decimales como mínimo y sin ceros sobrantes", () => {
  assert.equal(formatRate(17.25), "17.25");
  assert.equal(formatRate(18.4), "18.40");
  assert.equal(formatRate(20), "20.00");
  // El yen contra el peso ronda las centésimas: dos decimales no alcanzan.
  assert.equal(formatRate(0.115), "0.115");
});

test("una tasa ausente, cero o negativa se muestra como guion", () => {
  assert.equal(formatRate(null), "—");
  assert.equal(formatRate(0), "—");
  assert.equal(formatRate(-5), "—");
  assert.equal(formatRate(Number.NaN), "—");
});

test("la etiqueta distingue base, sin tasa y tasa con moneda", () => {
  const base = buildCurrencyRows([currency({ code: "MXN", isBase: true })], []);
  const missing = buildCurrencyRows([currency({ code: "GBP" })], []);
  const present = buildCurrencyRows([currency({ code: "USD" })], [rate({ rateMxn: 17.25 })]);

  assert.equal(rateLabel(base[0]), "Base");
  assert.equal(rateLabel(missing[0]), "Sin tasa");
  assert.equal(rateLabel(present[0]), "17.25 MXN");
});

test("la fecha se formatea sin corrimiento de zona horaria", () => {
  // `new Date("2026-10-16")` es medianoche UTC; en México eso es el día 15. La tabla debe decir 16.
  assert.equal(formatRateDate("2026-10-16"), "16 oct 2026");
  assert.equal(formatRateDate("2026-01-01"), "1 ene 2026");
  assert.equal(formatRateDate("2026-12-31"), "31 dic 2026");
});

test("una fecha ausente o inválida se muestra como guion", () => {
  assert.equal(formatRateDate(null), "—");
  assert.equal(formatRateDate("16/10/2026"), "—");
  assert.equal(formatRateDate("2026-13-01"), "—");
});

test("si nada cambió, el mensaje lo dice en vez de fingir un éxito", () => {
  assert.equal(
    describeSyncResult({ synced: 0, skipped: 5, failed: 0, total: 5 }),
    "Las tasas ya estaban al día"
  );
});

test("el mensaje singulariza una sola tasa actualizada", () => {
  assert.equal(describeSyncResult({ synced: 1, skipped: 4, failed: 0, total: 5 }), "1 tasa actualizada");
  assert.equal(describeSyncResult({ synced: 3, skipped: 2, failed: 0, total: 5 }), "3 tasas actualizadas");
});

test("el mensaje reporta los fallos junto con lo actualizado", () => {
  assert.equal(
    describeSyncResult({ synced: 3, skipped: 0, failed: 2, total: 5 }),
    "3 tasas actualizadas; 2 no se pudieron actualizar"
  );
  assert.equal(
    describeSyncResult({ synced: 3, skipped: 0, failed: 1, total: 4 }),
    "3 tasas actualizadas; 1 no se pudo actualizar"
  );
});

test("si fallaron todas, el mensaje dice que se conserva la última publicada", () => {
  assert.equal(
    describeSyncResult({ synced: 0, skipped: 0, failed: 4, total: 4 }),
    "Ninguna tasa se pudo actualizar: 4 no se pudieron actualizar; se conserva la última publicada"
  );
});
