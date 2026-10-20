import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeCurrencies,
  normalizeCurrency,
  normalizeLatestFxRate,
  normalizeLatestFxRates,
  normalizeResolvedFxRate
} from "./currencies.ts";

test("una moneda en camelCase se normaliza con su código en mayúsculas", () => {
  const currency = normalizeCurrency({
    code: "usd",
    name: "Dólar estadounidense",
    symbol: "$",
    decimals: 2,
    isBase: false
  });

  assert.deepEqual(currency, {
    code: "USD",
    name: "Dólar estadounidense",
    symbol: "$",
    decimals: 2,
    isBase: false
  });
});

test("una moneda en PascalCase se normaliza igual", () => {
  const currency = normalizeCurrency({
    Code: "mxn",
    Name: "Peso mexicano",
    Symbol: "$",
    Decimals: 2,
    IsBase: true
  });

  assert.equal(currency?.code, "MXN");
  assert.equal(currency?.isBase, true);
});

test("un código que no es de tres letras se descarta en vez de mostrarse", () => {
  assert.equal(normalizeCurrency({ code: "US", name: "Dólar" }), null);
  assert.equal(normalizeCurrency({ code: 12, name: "Dólar" }), null);
  assert.equal(normalizeCurrency(null), null);
});

test("los decimales ausentes caen a 2 y nunca quedan negativos", () => {
  assert.equal(normalizeCurrency({ code: "USD", name: "Dólar" })?.decimals, 2);
  assert.equal(normalizeCurrency({ code: "USD", name: "Dólar", decimals: -1 })?.decimals, 2);
  // El yen tiene 0 decimales: es un valor válido y no debe confundirse con "ausente".
  assert.equal(normalizeCurrency({ code: "JPY", name: "Yen", decimals: 0 })?.decimals, 0);
});

test("una lista que no es arreglo devuelve lista vacía", () => {
  assert.deepEqual(normalizeCurrencies(null), []);
  assert.deepEqual(normalizeCurrencies({ code: "USD" }), []);
});

test("una tasa con importe en texto se convierte a número", () => {
  const rate = normalizeLatestFxRate({
    currencyCode: "usd",
    rateDate: "2026-10-16",
    rateMxn: "17.25",
    source: "banxico"
  });

  assert.equal(rate?.currencyCode, "USD");
  assert.equal(rate?.rateMxn, 17.25);
  assert.equal(rate?.rateDate, "2026-10-16");
});

test("una fecha con hora se recorta a yyyy-MM-dd", () => {
  const rate = normalizeLatestFxRate({
    currencyCode: "EUR",
    rateDate: "2026-10-16T00:00:00",
    rateMxn: 18.4,
    source: "banxico"
  });

  assert.equal(rate?.rateDate, "2026-10-16");
});

test("una tasa en cero o sin fecha se descarta: nunca se convierte con un valor inventado", () => {
  assert.equal(normalizeLatestFxRate({ currencyCode: "USD", rateDate: "2026-10-16", rateMxn: 0 }), null);
  assert.equal(normalizeLatestFxRate({ currencyCode: "USD", rateMxn: 17.25 }), null);
  assert.equal(normalizeLatestFxRate({ currencyCode: "USD", rateDate: "16/10/2026", rateMxn: 17.25 }), null);
});

test("la lista de tasas descarta los elementos inválidos y conserva los buenos", () => {
  const rates = normalizeLatestFxRates([
    { currencyCode: "USD", rateDate: "2026-10-16", rateMxn: 17.25, source: "banxico" },
    { currencyCode: "EUR", rateDate: "2026-10-16", rateMxn: 0, source: "banxico" }
  ]);

  assert.equal(rates.length, 1);
  assert.equal(rates[0].currencyCode, "USD");
});

test("una tasa resuelta respeta la marca de carry-forward que envía el servidor", () => {
  const resolved = normalizeResolvedFxRate({
    currencyCode: "USD",
    requestedDate: "2026-10-17",
    rateDate: "2026-10-16",
    rateMxn: 17.25,
    source: "banxico",
    isCarryForward: true
  });

  assert.equal(resolved?.isCarryForward, true);
  assert.equal(resolved?.requestedDate, "2026-10-17");
});

test("sin la marca explícita, el carry-forward se deduce comparando las fechas", () => {
  const carried = normalizeResolvedFxRate({
    currencyCode: "USD",
    requestedDate: "2026-10-17",
    rateDate: "2026-10-16",
    rateMxn: 17.25
  });
  const sameDay = normalizeResolvedFxRate({
    currencyCode: "USD",
    requestedDate: "2026-10-16",
    rateDate: "2026-10-16",
    rateMxn: 17.25
  });

  assert.equal(carried?.isCarryForward, true);
  assert.equal(sameDay?.isCarryForward, false);
});
