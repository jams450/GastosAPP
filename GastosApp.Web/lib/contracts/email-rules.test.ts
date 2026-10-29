import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeEmailRule, validateEmailRulePayload } from "./email-rules.ts";
import { validateEmailLabelPayload } from "./email-labels.ts";
import { normalizePreviewResult } from "./email-preview.ts";

/**
 * El contrato entre UI y API es el punto donde un error no falla: una regla guardada con el valor
 * equivocado se persiste y simplemente nunca casa, y el correo cae en revisión sin decir por qué.
 */

test("match_type usa los valores que persiste el API, no el nombre de la constante del backend", () => {
  const accepted = validateEmailRulePayload({
    name: "Banco por dominio",
    matchField: "sender_domain",
    matchType: "equals",
    matchValue: "banco.com",
    targetLabelId: 3,
    priority: 10,
    active: true
  });

  assert.equal(accepted.ok, true);

  // La constante del backend se llama `Exact` pero su valor es `equals`. "exact" se rechaza acá en
  // vez de guardarse y no casar nunca.
  const rejected = validateEmailRulePayload({
    name: "Banco por dominio",
    matchField: "sender_domain",
    matchType: "exact",
    matchValue: "banco.com",
    targetLabelId: 3
  });

  assert.equal(rejected.ok, false);
});

test("una regla sin etiqueta destino no se puede guardar", () => {
  const result = validateEmailRulePayload({
    name: "Sin destino",
    matchField: "subject",
    matchType: "contains",
    matchValue: "cargo"
  });

  assert.equal(result.ok, false);
});

test("normalizeEmailRule conserva los campos tal como llegan del API", () => {
  const rule = normalizeEmailRule({
    emailRuleId: 7,
    name: "PayPal",
    matchField: "sender_domain",
    matchType: "ends_with",
    matchValue: "paypal.com",
    targetLabelId: 2,
    targetLabelName: "Gastos",
    targetLabelBehavior: "expense",
    priority: 20,
    active: true
  });

  assert.notEqual(rule, null);
  assert.equal(rule?.matchField, "sender_domain");
  assert.equal(rule?.targetLabelName, "Gastos");
});

test("un comportamiento de etiqueta desconocido se rechaza en vez de degradarse", () => {
  const result = validateEmailLabelPayload({
    name: "Otros",
    kind: "label",
    behavior: "gastos",
    sortOrder: 90,
    active: true
  });

  assert.equal(result.ok, false);
});

test("el color de la etiqueta se valida como hexadecimal, porque el picker solo entiende #rrggbb", () => {
  const invalid = validateEmailLabelPayload({
    name: "Banco",
    kind: "folder",
    behavior: "expense",
    color: "azul",
    sortOrder: 20,
    active: true
  });

  assert.equal(invalid.ok, false);

  const valid = validateEmailLabelPayload({
    name: "Banco",
    kind: "folder",
    behavior: "expense",
    color: "#64748B",
    sortOrder: 20,
    active: true
  });

  assert.equal(valid.ok, true);
  assert.equal(valid.ok ? valid.data.color : null, "#64748b");
});

test("la muestra del clasificador tolera una respuesta sin filas", () => {
  const result = normalizePreviewResult({ total: 0, returned: 0, dropOlderThanDays: 730 });

  assert.deepEqual(result.rows, []);
  assert.equal(result.dropOlderThanDays, 730);
});
