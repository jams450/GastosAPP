// El alias `@/` no lo resuelve `node --test`: los imports de valor van con ruta relativa y
// extensión explícita, igual que en los demás módulos puros probables del repositorio.
import type { BudgetRolloverResponse } from "../../../../lib/contracts/budgets.ts";

/** Modos que acepta `POST /api/budgets/rollover`; el texto viene del plan (sección 2.4). */
export const ROLLOVER_MODES = [
  {
    value: "copy",
    label: "Copiar",
    description: "Copia literal de las partidas manuales; no regenera las de plantilla."
  },
  {
    value: "remount",
    label: "Remontar",
    description: "Regenera las partidas de plantilla desde su recurrencia; omite las manuales."
  },
  {
    value: "copy-and-remount",
    label: "Copiar y remontar",
    description: "Copia las manuales y regenera las de plantilla. Es el modo por defecto."
  }
] as const;

export type RolloverModeValue = (typeof ROLLOVER_MODES)[number]["value"];

/** Modo por defecto del backend: copia los ajustes del mes y remonta lo programado. */
export const DEFAULT_ROLLOVER_MODE: RolloverModeValue = "copy-and-remount";

/** Un periodo `yyyy-MM` con mes real: `2026-13` o `2026-1` no son periodos. */
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Las tres claves del modelo; el backend además normaliza a minúsculas. */
function isRolloverModeValue(value: unknown): value is RolloverModeValue {
  return ROLLOVER_MODES.some((mode) => mode.value === value);
}

/**
 * Modo validado. Un valor desconocido (o ausente) cae al modo por defecto en vez de inventar uno:
 * `copy-and-remount` es lo que el backend aplica cuando `mode` viene vacío.
 */
export function resolveRolloverMode(value: string | null | undefined): RolloverModeValue {
  if (typeof value !== "string") {
    return DEFAULT_ROLLOVER_MODE;
  }

  const normalized = value.trim().toLowerCase();
  return isRolloverModeValue(normalized) ? normalized : DEFAULT_ROLLOVER_MODE;
}

/** Descripción en español de un modo, para la ayuda del selector. */
export function rolloverModeDescription(value: string): string {
  const mode = ROLLOVER_MODES.find((item) => item.value === resolveRolloverMode(value));
  return mode?.description ?? "";
}

/** Periodo `yyyy-MM` o mensaje en español; el destino además tiene que ser posterior al origen. */
function validatePeriodPair(fromPeriod: unknown, toPeriod: unknown): string | null {
  if (typeof fromPeriod !== "string" || !PERIOD_PATTERN.test(fromPeriod.trim())) {
    return "El mes de origen debe usar el formato aaaa-mm.";
  }

  if (typeof toPeriod !== "string" || !PERIOD_PATTERN.test(toPeriod.trim())) {
    return "El mes de destino debe usar el formato aaaa-mm.";
  }

  // Orden lexicográfico: `yyyy-MM` ya compara en el mismo orden que la cronología.
  if (toPeriod.trim() <= fromPeriod.trim()) {
    return "El mes de destino debe ser posterior al mes de origen.";
  }

  return null;
}

/**
 * Valida la petición de rollover antes de salir a la red. Devuelve `null` cuando es utilizable o el
 * motivo en español que se muestra junto al botón.
 */
export function validateRolloverRequest(input: {
  fromPeriod: unknown;
  toPeriod: unknown;
  mode?: unknown;
}): string | null {
  const periodError = validatePeriodPair(input.fromPeriod, input.toPeriod);
  if (periodError !== null) {
    return periodError;
  }

  if (input.mode !== undefined && input.mode !== null && !isRolloverModeValue(input.mode)) {
    return "El modo debe ser copy, remount o copy-and-remount.";
  }

  return null;
}

/** Los tres bloques del resultado, en el orden en que se reportan al usuario. */
const COUNT_BLOCKS: ReadonlyArray<{ key: "budgets" | "manualItems" | "remountedItems"; label: string }> = [
  { key: "budgets", label: "presupuestos" },
  { key: "manualItems", label: "partidas manuales" },
  { key: "remountedItems", label: "partidas remontadas" }
];

function rolloverBlocks(response: BudgetRolloverResponse): Array<{ label: string; counts: BudgetRolloverResponse["budgets"] }> {
  return COUNT_BLOCKS.map((block) => ({ label: block.label, counts: response[block.key] }));
}

/**
 * `true` cuando ningún bloque reporta inserciones.
 *
 * Un conteo `null` cuenta como cero a propósito: si el backend no devolvió el bloque, la UI no tiene
 * nada que ofrecer que clonar y ofrecer una escritura sería prometer un resultado que nadie midió.
 */
export function isRolloverNoop(response: BudgetRolloverResponse): boolean {
  return rolloverBlocks(response).every(({ counts }) => counts.inserted === null || counts.inserted === 0);
}

/** Texto de un conteo: el número, o "desconocido" cuando el backend no lo envió. */
function countLabel(count: number | null): string {
  return count === null ? "desconocido" : String(count);
}

/**
 * Resumen en español del rollover. Un `dryRun` habla en futuro ("Se crearán…") y una ejecución en
 * pasado ("Se crearon…"), para que el texto no prometa una escritura que ya ocurrió. El conteo
 * `skipped` solo aparece cuando es distinto de cero: en cero es ruido.
 *
 * Cada bloque se rotula por su nombre en vez de por un plural calculado, porque así un conteo
 * `null` se lee "presupuestos: desconocido" en vez de "0 presupuestos", que es justo la mentira que
 * un cero fabricado contaría.
 */
export function summarizeRolloverCounts(response: BudgetRolloverResponse): string {
  const verb = response.dryRun ? "Se crearán" : "Se crearon";

  const lines = rolloverBlocks(response).map(({ label, counts }) => {
    const detail = `${label}: ${countLabel(counts.inserted)}`;

    if (counts.skipped !== null && counts.skipped > 0) {
      return `${detail} (${counts.skipped} omitidas por clave ya ocupada)`;
    }

    return detail;
  });

  return `${verb}: ${lines.join(" · ")}.`;
}
