import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeBudgetRollover, type BudgetRolloverResponse } from "../../../../lib/contracts/budgets.ts";
import {
  DEFAULT_ROLLOVER_MODE,
  isRolloverNoop,
  resolveRolloverMode,
  ROLLOVER_MODES,
  summarizeRolloverCounts,
  validateRolloverRequest
} from "./budget-rollover-model.ts";

function counts(overrides: Partial<{ attempted: number | null; inserted: number | null; skipped: number | null; omitted: number | null }> = {}) {
  return {
    attempted: null,
    inserted: null,
    skipped: null,
    omitted: null,
    ...overrides
  };
}

function rollover(overrides: Partial<BudgetRolloverResponse> = {}): BudgetRolloverResponse {
  return {
    fromPeriod: "2026-01",
    toPeriod: "2026-02",
    mode: DEFAULT_ROLLOVER_MODE,
    dryRun: true,
    budgets: counts(),
    manualItems: counts(),
    remountedItems: counts(),
    ...overrides
  };
}

test("resolveRolloverMode acepta los tres modos del backend", () => {
  assert.equal(resolveRolloverMode("copy"), "copy");
  assert.equal(resolveRolloverMode("remount"), "remount");
  assert.equal(resolveRolloverMode("copy-and-remount"), "copy-and-remount");
});

test("resolveRolloverMode normaliza caja y espacios como el backend", () => {
  assert.equal(resolveRolloverMode("  COPY  "), "copy");
  assert.equal(resolveRolloverMode("Remount"), "remount");
  assert.equal(resolveRolloverMode("Copy-And-Remount"), "copy-and-remount");
});

test("resolveRolloverMode cae al modo por defecto ante basura", () => {
  assert.equal(resolveRolloverMode(""), DEFAULT_ROLLOVER_MODE);
  assert.equal(resolveRolloverMode(null), DEFAULT_ROLLOVER_MODE);
  assert.equal(resolveRolloverMode(undefined), DEFAULT_ROLLOVER_MODE);
  assert.equal(resolveRolloverMode("delete-everything"), DEFAULT_ROLLOVER_MODE);
  assert.equal(resolveRolloverMode("copy and remount"), DEFAULT_ROLLOVER_MODE);
});

test("ROLLOVER_MODES describe en español los tres modos con su valor exacto", () => {
  assert.deepEqual(
    ROLLOVER_MODES.map((mode) => mode.value),
    ["copy", "remount", "copy-and-remount"]
  );

  for (const mode of ROLLOVER_MODES) {
    assert.ok(mode.label.trim().length > 0, `${mode.value} necesita etiqueta`);
    assert.ok(mode.description.trim().length > 0, `${mode.value} necesita descripción`);
  }
});

test("validateRolloverRequest acepta un destino posterior al origen", () => {
  assert.equal(validateRolloverRequest({ fromPeriod: "2026-01", toPeriod: "2026-02", mode: "copy" }), null);
  assert.equal(validateRolloverRequest({ fromPeriod: "2025-12", toPeriod: "2026-01" }), null);
});

test("validateRolloverRequest rechaza periodos iguales o invertidos", () => {
  assert.match(
    validateRolloverRequest({ fromPeriod: "2026-02", toPeriod: "2026-02" }) ?? "",
    /posterior/
  );
  assert.match(
    validateRolloverRequest({ fromPeriod: "2026-02", toPeriod: "2026-01" }) ?? "",
    /posterior/
  );
  // El cruce de año es un orden cronológico, no una comparación de texto sin pensar: diciembre
  // → enero avanza, enero → diciembre retrocede.
  assert.equal(validateRolloverRequest({ fromPeriod: "2025-12", toPeriod: "2026-01" }), null);
  assert.match(validateRolloverRequest({ fromPeriod: "2026-01", toPeriod: "2025-12" }) ?? "", /posterior/);
});

test("validateRolloverRequest rechaza periodos mal formados o ausentes", () => {
  assert.match(validateRolloverRequest({ fromPeriod: "2026-1", toPeriod: "2026-02" }) ?? "", /origen/);
  assert.match(validateRolloverRequest({ fromPeriod: "2026-13", toPeriod: "2026-14" }) ?? "", /origen/);
  assert.match(validateRolloverRequest({ fromPeriod: "2026-01", toPeriod: "2026-00" }) ?? "", /destino/);
  assert.match(validateRolloverRequest({ fromPeriod: "", toPeriod: "2026-02" }) ?? "", /origen/);
  assert.match(validateRolloverRequest({ fromPeriod: "2026-01", toPeriod: null }) ?? "", /destino/);
});

test("validateRolloverRequest rechaza un modo fuera de los tres aceptados", () => {
  assert.equal(validateRolloverRequest({ fromPeriod: "2026-01", toPeriod: "2026-02", mode: "remount" }), null);
  assert.match(
    validateRolloverRequest({ fromPeriod: "2026-01", toPeriod: "2026-02", mode: "purge" }) ?? "",
    /copy/
  );
  // Un modo ausente no bloquea: el backend aplica `copy-and-remount`.
  assert.equal(validateRolloverRequest({ fromPeriod: "2026-01", toPeriod: "2026-02", mode: undefined }), null);
});

test("isRolloverNoop es cierto con todo en cero", () => {
  assert.equal(
    isRolloverNoop(
      rollover({
        budgets: counts({ inserted: 0, skipped: 0, attempted: 0 }),
        manualItems: counts({ inserted: 0 }),
        remountedItems: counts({ inserted: 0 })
      })
    ),
    true
  );
});

test("isRolloverNoop es cierto cuando ningún bloque reporta inserciones", () => {
  assert.equal(isRolloverNoop(rollover()), true);
});

test("isRolloverNoop distingue el bloque que sí inserta", () => {
  assert.equal(isRolloverNoop(rollover({ budgets: counts({ inserted: 1 }) })), false);
  assert.equal(isRolloverNoop(rollover({ manualItems: counts({ inserted: 3 }) })), false);
  assert.equal(isRolloverNoop(rollover({ remountedItems: counts({ inserted: 2 }) })), false);
});

test("isRolloverNoop ignora skipped y omitted: no son inserciones", () => {
  assert.equal(
    isRolloverNoop(
      rollover({
        budgets: counts({ inserted: 0, skipped: 4, omitted: 2, attempted: 6 }),
        manualItems: counts({ inserted: 0, skipped: 1 }),
        remountedItems: counts({ inserted: 0 })
      })
    ),
    true
  );
});

test("summarizeRolloverCounts habla en futuro en un dryRun y en pasado al aplicarse", () => {
  const preview = summarizeRolloverCounts(
    rollover({
      dryRun: true,
      budgets: counts({ inserted: 3 }),
      manualItems: counts({ inserted: 2 }),
      remountedItems: counts({ inserted: 0 })
    })
  );

  const applied = summarizeRolloverCounts(
    rollover({
      dryRun: false,
      budgets: counts({ inserted: 3 }),
      manualItems: counts({ inserted: 2 }),
      remountedItems: counts({ inserted: 0 })
    })
  );

  assert.match(preview, /^Se crearán:/);
  assert.ok(!preview.includes("Se crearon"));
  assert.match(applied, /^Se crearon:/);
  assert.ok(!applied.includes("Se crearán"));
});

test("summarizeRolloverCounts nombra los tres bloques", () => {
  const summary = summarizeRolloverCounts(
    rollover({ budgets: counts({ inserted: 3 }), manualItems: counts({ inserted: 2 }), remountedItems: counts({ inserted: 0 }) })
  );

  assert.match(summary, /presupuestos: 3/);
  assert.match(summary, /partidas manuales: 2/);
  assert.match(summary, /partidas remontadas: 0/);
});

test("summarizeRolloverCounts menciona skipped solo cuando es distinto de cero", () => {
  const withSkipped = summarizeRolloverCounts(
    rollover({ budgets: counts({ inserted: 3, skipped: 2 }), manualItems: counts({ inserted: 0, skipped: 0 }), remountedItems: counts({ inserted: 0 }) })
  );

  assert.match(withSkipped, /presupuestos: 3 \(2 omitidas por clave ya ocupada\)/);
  assert.ok(!withSkipped.includes("0 omitidas"));

  const withoutSkipped = summarizeRolloverCounts(
    rollover({ budgets: counts({ inserted: 3, skipped: null }), manualItems: counts({ inserted: 0 }), remountedItems: counts({ inserted: 0 }) })
  );

  assert.ok(!withoutSkipped.includes("omitidas"));
});

test("una página de nulls nunca imprime 0", () => {
  const summary = summarizeRolloverCounts(rollover());

  assert.match(summary, /presupuestos: desconocido/);
  assert.match(summary, /partidas manuales: desconocido/);
  assert.match(summary, /partidas remontadas: desconocido/);
  assert.ok(!summary.includes(": 0"));
});

test("normalizeBudgetRollover deja los conteos ausentes en null, no en 0", () => {
  const normalized = normalizeBudgetRollover({ fromPeriod: "2026-01", toPeriod: "2026-02", mode: "copy" });

  assert.deepEqual(normalized.budgets, { attempted: null, inserted: null, skipped: null, omitted: null });
  assert.equal(normalized.dryRun, true);
});

test("normalizeBudgetRollover acepta tanto camelCase como PascalCase", () => {
  const normalized = normalizeBudgetRollover({
    FromPeriod: "2026-01",
    ToPeriod: "2026-02",
    Mode: "remount",
    DryRun: false,
    Budgets: { Attempted: 4, Inserted: 3, Skipped: 1, Omitted: 0 },
    ManualItems: { Inserted: 2 },
    RemountedItems: { Inserted: 1 }
  });

  assert.equal(normalized.fromPeriod, "2026-01");
  assert.equal(normalized.toPeriod, "2026-02");
  assert.equal(normalized.mode, "remount");
  assert.equal(normalized.dryRun, false);
  assert.deepEqual(normalized.budgets, { attempted: 4, inserted: 3, skipped: 1, omitted: 0 });
  assert.equal(normalized.manualItems.inserted, 2);
  assert.equal(normalized.manualItems.attempted, null);
  assert.equal(normalized.remountedItems.inserted, 1);
});

test("normalizeBudgetRollover sobre un cuerpo no utilizable devuelve todo desconocido y dryRun", () => {
  const normalized = normalizeBudgetRollover(null);

  assert.equal(normalized.fromPeriod, "");
  assert.equal(normalized.dryRun, true);
  assert.deepEqual(normalized.budgets, { attempted: null, inserted: null, skipped: null, omitted: null });
  assert.equal(isRolloverNoop(normalized), true);
});

test("normalizeBudgetRollover con conteos en texto numérico los conserva", () => {
  const normalized = normalizeBudgetRollover({ budgets: { inserted: "5", skipped: "abc" } });

  assert.equal(normalized.budgets.inserted, 5);
  assert.equal(normalized.budgets.skipped, null);
});

test("normalizeBudgetRollover no fabrica ceros con tipos que no son números", () => {
  // Regresión: `Number(false)` es 0 y `Number("   ")` es 0. Un `0` fabricado apagaria una escritura
  // real, porque la UI usa `inserted === 0` para decidir que no hay nada que clonar.
  const normalized = normalizeBudgetRollover({
    budgets: { attempted: false, inserted: true, skipped: "   ", omitted: {} },
    manualItems: { inserted: [] },
    remountedItems: { inserted: null }
  });

  assert.equal(normalized.budgets.attempted, null);
  assert.equal(normalized.budgets.inserted, null);
  assert.equal(normalized.budgets.skipped, null);
  assert.equal(normalized.budgets.omitted, null);
  assert.equal(normalized.manualItems.inserted, null);
  assert.equal(normalized.remountedItems.inserted, null);
  assert.equal(isRolloverNoop(normalized), true);
  assert.doesNotMatch(summarizeRolloverCounts(normalized), /Se crearon 0|Se crearán 0/);
});
