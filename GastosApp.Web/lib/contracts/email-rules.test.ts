import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeEmailRuleTarget,
  normalizeEmailRule,
  normalizeEmailRuleGroup,
  summarizeEmailRule,
  validateEmailRulePayload
} from "./email-rules.ts";
import { validateEmailLabelPayload } from "./email-labels.ts";
import { normalizePreviewResult, normalizeApplyResult, EMAIL_APPLY_STATUS_LABELS } from "./email-preview.ts";

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


test("editar consulta el detalle completo antes de abrir y no usa el listado como fallback", async () => {
  const { readFile } = await import("node:fs/promises");
  const section = await readFile(new URL("../../app/(app)/mail/rules/rules-section.tsx", import.meta.url), "utf8");
  const handler = section.slice(section.indexOf("async function openEdit"), section.indexOf("async function submit"));
  assert.match(handler, /await fetchEmailRule\(rule.emailRuleId\)/);
  assert.ok(handler.indexOf("await fetchEmailRule") < handler.indexOf("setDrawerOpen(true)"));
  assert.match(handler, /catch/);
  assert.match(handler, /onError/);
  const route = await readFile(new URL("../../app/api/bff/mail/rules/[id]/route.ts", import.meta.url), "utf8");
  assert.match(route, /export async function GET/);
});


test("el listado resume varias condiciones sin desplegar el árbol y conserva la condición única", () => {
  const base = { emailRuleId: 1, targetLabelId: 2, matchType: "contains", matchValue: "banco" };
  const multiple = normalizeEmailRule({ ...base, conditionCount: 4 });
  const single = normalizeEmailRule({ ...base, conditionCount: 1 });
  assert.equal(summarizeEmailRule(multiple!), "Varias condiciones (4)");
  assert.equal(summarizeEmailRule(single!), "Contiene banco");
  assert.equal(summarizeEmailRule(normalizeEmailRule(base)!), "Contiene banco");
});

test("las filas que ya tenían su etiqueta se cuentan aparte y sin dato son cero", () => {
  // Un campo ausente no puede leerse como un descarte: cero es el valor correcto cuando el servidor
  // no reporta el conteo.
  const sinDato = normalizePreviewResult({ total: 2, returned: 2, rows: [] });
  assert.equal(sinDato.skippedAlreadyLabelled, 0);

  const conDato = normalizePreviewResult({ total: 3, returned: 1, skippedAlreadyLabelled: 2 });
  assert.equal(conDato.skippedAlreadyLabelled, 2);
  // El total sigue incluyendo lo que se leyó: las filas ocultas no desaparecen del conteo.
  assert.equal(conDato.total, 3);
  assert.equal(conDato.returned, 1);
});


test("sin datos de aplicación la muestra sigue siendo solo lectura", () => {
  const result = normalizePreviewResult({
    total: 1,
    returned: 1,
    rows: [{ name: "banco.eml", outcome: "expense", reason: "rule" }]
  });

  assert.equal(result.applyToken, null);
  assert.equal(result.applyExpiresAt, null);
  assert.equal(result.applicableCount, 0);

  // Un token sin filas aplicables tampoco se ofrece: el botón no haría nada.
  const empty = normalizePreviewResult({
    applicableCount: 0,
    applyToken: "token-colado",
    applyExpiresAt: "2026-10-29T18:15:00Z"
  });
  assert.equal(empty.applyToken, null);
  assert.equal(empty.applyExpiresAt, null);
});

test("la muestra aplicable conserva token, vencimiento y conteo, y el resultado se lee por fila", () => {
  const expiresAt = "2026-10-29T18:15:00Z";
  const preview = normalizePreviewResult({
    total: 2,
    returned: 2,
    applicableCount: 2,
    applyToken: "  tok_123  ",
    applyExpiresAt: expiresAt
  });

  assert.equal(preview.applyToken, "tok_123");
  assert.equal(preview.applyExpiresAt, expiresAt);
  assert.equal(preview.applicableCount, 2);

  const apply = normalizeApplyResult({
    applied: 1,
    skipped: 1,
    failed: 0,
    rows: [
      { name: "banco.eml", label: "Gastos", status: "applied", message: "Etiqueta agregada." },
      { name: "recibo.eml", label: "Gastos", status: "skipped", message: "El mensaje ya tenía la etiqueta." }
    ]
  });

  assert.notEqual(apply, null);
  assert.equal(apply?.applied, 1);
  assert.equal(apply?.skipped, 1);
  assert.equal(apply?.failed, 0);
  assert.deepEqual(
    apply?.rows.map((row) => `${row.status}:${EMAIL_APPLY_STATUS_LABELS[row.status]}`),
    ["applied:Etiquetado", "skipped:Omitido"]
  );
});

test("una respuesta de aplicar ilegible no se pinta como éxito", () => {
  assert.equal(normalizeApplyResult(null), null);
  assert.equal(normalizeApplyResult({}), null);
  // Conteos incompletos: no se puede decir cuántas filas quedaron sin etiquetar.
  assert.equal(normalizeApplyResult({ rows: [], applied: 0 }), null);
  // Un conteo nulo no es un cero: aceptarlo pintaría «0 aplicados» sobre un dato que falta.
  assert.equal(normalizeApplyResult({ rows: [], applied: null, skipped: 0, failed: 0 }), null);
  // Un estado fuera del contrato no se degrada a «aplicado».
  assert.equal(
    normalizeApplyResult({
      applied: 1,
      skipped: 0,
      failed: 0,
      rows: [{ name: "banco.eml", label: "Gastos", status: "ok", message: "" }]
    }),
    null
  );
  // «constructor» hereda del prototipo: no puede colarse como estado válido.
  assert.equal(
    normalizeApplyResult({
      applied: 1,
      skipped: 0,
      failed: 0,
      rows: [{ name: "banco.eml", label: "Gastos", status: "constructor", message: "" }]
    }),
    null
  );
});


test("aplicar rechaza contadores que contradicen las filas", () => {
  assert.equal(normalizeApplyResult({ rows: [], applied: 1, skipped: 0, failed: 0 }), null);
  assert.equal(normalizeApplyResult({
    rows: [{ name: "correo", label: "Gastos", status: "failed", message: "Sin confirmar" }],
    applied: 1, skipped: 0, failed: 0
  }), null);
});


test("una regla terminal se guarda sin etiqueta y una asignación la exige", () => {
  const base = {
    name: "Revisar facturas",
    matchField: "subject",
    matchType: "contains",
    matchValue: "factura",
    priority: 10,
    active: true
  };

  // Sin etiqueta: es una acción terminal, no un formulario incompleto.
  for (const action of ["review", "llm"] as const) {
    const terminal = validateEmailRulePayload({ ...base, action, targetLabelId: null });
    assert.equal(terminal.ok, true);
    assert.equal(terminal.ok ? terminal.data.action : null, action);
    assert.equal(terminal.ok ? terminal.data.targetLabelId : 0, null);
  }

  // Una etiqueta colada en una acción terminal se descarta: nadie la aplicaría.
  const withLabel = validateEmailRulePayload({ ...base, action: "review", targetLabelId: 7 });
  assert.equal(withLabel.ok, true);
  assert.equal(withLabel.ok ? withLabel.data.targetLabelId : 0, null);

  // Asignar sigue exigiendo destino, como antes.
  const assignWithoutLabel = validateEmailRulePayload({ ...base, action: "assign_label", targetLabelId: null });
  assert.equal(assignWithoutLabel.ok, false);

  // Una acción fuera del contrato se rechaza en vez de guardarse y comportarse como otra cosa.
  const unknown = validateEmailRulePayload({ ...base, action: "delete", targetLabelId: 7 });
  assert.equal(unknown.ok, false);
});

test("el contrato acepta respuestas del API anteriores a la negación y a las acciones", () => {
  // Una regla guardada antes de S14/S15 no trae action ni negated: se lee como asignación sin negar.
  const legacy = normalizeEmailRule({
    emailRuleId: 4,
    name: "PayPal",
    matchField: "sender_domain",
    matchType: "ends_with",
    matchValue: "paypal.com",
    targetLabelId: 2,
    priority: 20,
    active: true
  });

  assert.notEqual(legacy, null);
  assert.equal(legacy?.action, "assign_label");
  assert.equal(legacy?.targetLabelId, 2);
  assert.equal(legacy?.root, null);

  const legacyGroup = normalizeEmailRuleGroup({
    combinator: "or",
    conditions: [{ matchField: "subject", matchType: "contains", matchValue: "factura" }],
    groups: []
  });

  assert.equal(legacyGroup?.negated, false);
  assert.equal(legacyGroup?.conditions[0].negated, false);

  // Y la negación explícita sobrevive en los dos niveles.
  const negated = normalizeEmailRuleGroup({
    combinator: "and",
    negated: true,
    conditions: [{ matchField: "subject", matchType: "contains", matchValue: "factura", negated: true }],
    groups: []
  });

  assert.equal(negated?.negated, true);
  assert.equal(negated?.conditions[0].negated, true);

  // Una regla terminal llega con targetLabelId nulo y no puede desaparecer del listado.
  const terminal = normalizeEmailRule({
    emailRuleId: 9,
    name: "Al LLM",
    action: "llm",
    matchField: "subject",
    matchType: "contains",
    matchValue: "recibo",
    targetLabelId: null,
    priority: 5,
    active: true
  });

  assert.equal(terminal?.targetLabelId, null);
  assert.equal(terminal?.action, "llm");
});

test("el árbol enviado conserva la negación de grupos y condiciones", () => {
  const payload = validateEmailRulePayload({
    name: "Transferencias sin factura",
    action: "assign_label",
    targetLabelId: 3,
    priority: 10,
    root: {
      combinator: "and",
      conditions: [{ matchField: "sender_domain", matchType: "ends_with", matchValue: "holatransfers.com" }],
      groups: [
        {
          combinator: "or",
          negated: true,
          conditions: [
            { matchField: "subject", matchType: "contains", matchValue: "factura" },
            { matchField: "subject", matchType: "contains", matchValue: "invoice" }
          ],
          groups: []
        }
      ]
    }
  });

  assert.equal(payload.ok, true);
  const root = payload.ok ? payload.data.root : null;
  assert.equal(root?.negated, false);
  assert.equal(root?.groups[0].negated, true);
  // Con árbol las columnas planas van vacías: el servidor las refleja para la restricción del esquema.
  assert.equal(payload.ok ? payload.data.matchValue : "x", "");
});

test("la celda de etiqueta del listado dice la acción terminal en vez de un guion", () => {
  const base = { emailRuleId: 1, matchValue: "factura", matchType: "contains" as const };

  const assigned = normalizeEmailRule({ ...base, targetLabelId: 2, targetLabelName: "Gastos", action: "assign_label" });
  const review = normalizeEmailRule({ ...base, targetLabelId: null, action: "review" });
  const llm = normalizeEmailRule({ ...base, targetLabelId: null, action: "llm" });
  const legacy = normalizeEmailRule({ ...base, targetLabelId: 2 });

  assert.equal(describeEmailRuleTarget(assigned!), "Gastos");
  assert.equal(describeEmailRuleTarget(review!), "Enviar a revisión");
  assert.equal(describeEmailRuleTarget(llm!), "Enviar a LLM");
  // Compatibilidad: sin acción se sigue mostrando la etiqueta.
  assert.equal(describeEmailRuleTarget(legacy!), "#2");
});
