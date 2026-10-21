import assert from "node:assert/strict";
import { test } from "node:test";
import { validateIncomeExpensePayload } from "./transactions.ts";

const basePayload = {
  accountId: 1,
  categoryId: 2,
  amount: 100,
  description: "Cena",
  transactionDate: "2026-10-16T18:00:00.000Z"
};

function validated(extra: Record<string, unknown>) {
  const result = validateIncomeExpensePayload({ ...basePayload, ...extra });
  if (!result.ok) {
    assert.fail(result.message);
  }

  return result.data;
}

test("un movimiento en pesos viaja igual que antes de existir el multi-divisa", () => {
  // Es la garantía de compatibilidad: si esto cambia, cada alta en MXN empieza a arrastrar campos
  // que el API no esperaba y el movimiento deja de ser un movimiento base.
  const data = validated({});

  assert.equal(data.currencyCode, undefined);
  assert.equal(data.fxRate, undefined);
  assert.equal(data.fxRateDate, undefined);
});

test("la divisa se normaliza a mayúsculas y la tasa se envía como número", () => {
  const data = validated({ currencyCode: "usd", fxRate: "17.25" });

  assert.equal(data.currencyCode, "USD");
  assert.equal(data.fxRate, 17.25);
});

test("una divisa que no tiene tres letras se descarta en vez de viajar mal escrita", () => {
  // Si se colara, el API buscaría una divisa inexistente y el alta fallaría con un error lejano a la
  // causa. Descartarla aquí deja el error donde corresponde.
  assert.equal(validated({ currencyCode: "US" }).currencyCode, undefined);
  assert.equal(validated({ currencyCode: "dolares" }).currencyCode, undefined);
  assert.equal(validated({ currencyCode: 42 }).currencyCode, undefined);
});

test("una tasa cero, negativa o no numérica no se envía", () => {
  // Una tasa inválida no puede convertirse en un consolidado en pesos: es preferible que el API
  // resuelva la publicada a que se guarde un cero silencioso.
  assert.equal(validated({ currencyCode: "USD", fxRate: 0 }).fxRate, undefined);
  assert.equal(validated({ currencyCode: "USD", fxRate: -3 }).fxRate, undefined);
  assert.equal(validated({ currencyCode: "USD", fxRate: "abc" }).fxRate, undefined);
});

test("la fecha de la tasa solo se envía en formato ISO corto", () => {
  assert.equal(validated({ currencyCode: "USD", fxRateDate: "2026-10-16" }).fxRateDate, "2026-10-16");
  // El formato local se descarta: `16/10/2026` no es una fecha que el API pueda comparar.
  assert.equal(validated({ currencyCode: "USD", fxRateDate: "16/10/2026" }).fxRateDate, undefined);
  assert.equal(validated({ currencyCode: "USD", fxRateDate: "2026-10-16T00:00:00Z" }).fxRateDate, undefined);
});
