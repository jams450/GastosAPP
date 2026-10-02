// Solo importa tipos: el runner de pruebas (`node --experimental-strip-types --test`) no resuelve
// el alias `@/`, y un import marcado como `type` se elimina al quitar los tipos.
import type { BudgetItem } from "@/lib/contracts/budget-items";
import type { RecurringItem } from "@/lib/contracts/recurring-items";

/** Periodo `yyyy-MM` con mes real: misma forma que exige el backend. */
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

export function isTemplatePeriod(value: unknown): value is string {
  return typeof value === "string" && PERIOD_PATTERN.test(value);
}

function toPositiveInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim().length > 0 ? Number(value.trim()) : NaN;
  return Number.isInteger(parsed) && (parsed as number) > 0 ? (parsed as number) : null;
}

function toOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  return Number.isInteger(parsed) ? (parsed as number) : null;
}

function toOptionalMoney(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toOptionalText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return toText(value);
}

/**
 * Días del mes sin pasar por `Date`: un `new Date(period)` se corre un día por zona horaria.
 * `null` cuando el periodo no es utilizable. Febrero respeta bisiestos (2024 → 29, 2026 → 28).
 */
export function daysInBudgetMonth(period: string): number | null {
  if (!isTemplatePeriod(period)) {
    return null;
  }

  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));

  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }

  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }

  return 31;
}

/**
 * Fecha `yyyy-MM-dd` del día de la plantilla dentro del periodo, con la misma regla del backend
 * (`MonthRangeResolver.ResolveDayOfMonthInPeriod`): si el mes no tiene ese día se usa el último
 * día, nunca un desborde al mes siguiente. `null` si el día o el periodo no son utilizables.
 */
export function resolveTemplatePlannedDate(dayOfMonth: unknown, period: string): string | null {
  const days = daysInBudgetMonth(period);
  if (days === null) {
    return null;
  }

  const day = toPositiveInt(dayOfMonth);
  if (day === null || day > 31) {
    return null;
  }

  return `${period}-${String(Math.min(day, days)).padStart(2, "0")}`;
}

/**
 * Candidata utilizable del catálogo. Exige identidad (`recurringItemId > 0`), día 1–31, nombre y
 * tipo no vacíos, `startsPeriod` válido y `endsPeriod` nulo o válido: una fila sin esos datos no
 * se puede previsualizar ni enviar. El resto de campos se sanean sin inventar valores.
 */
export function asTemplateCandidate(input: unknown): RecurringItem | null {
  if (!isRecord(input)) {
    return null;
  }

  const recurringItemId = toPositiveInt(input.recurringItemId);
  const dayOfMonth = toPositiveInt(input.dayOfMonth);
  const kind = toText(input.kind);
  const name = toText(input.name);
  const startsPeriod = typeof input.startsPeriod === "string" && isTemplatePeriod(input.startsPeriod.trim())
    ? input.startsPeriod.trim()
    : null;

  if (recurringItemId === null || dayOfMonth === null || dayOfMonth > 31 || kind === null || name === null || startsPeriod === null) {
    return null;
  }

  if (typeof input.active !== "boolean") {
    return null;
  }

  const endsRaw = input.endsPeriod;
  const endsPeriod = endsRaw === null || endsRaw === undefined || endsRaw === ""
    ? null
    : typeof endsRaw === "string" && isTemplatePeriod(endsRaw.trim()) ? endsRaw.trim() : null;
  if (endsRaw !== null && endsRaw !== undefined && endsRaw !== "" && endsPeriod === null) {
    return null;
  }

  const effectiveRaw = input.effectiveFrom;
  const effectiveFrom = effectiveRaw === null || effectiveRaw === undefined || effectiveRaw === ""
    ? null
    : typeof effectiveRaw === "string" && effectiveRaw.trim().length > 0 ? effectiveRaw.trim() : null;
  if (effectiveRaw !== null && effectiveRaw !== undefined && effectiveRaw !== "" && effectiveFrom === null) {
    return null;
  }

  return {
    recurringItemId,
    kind,
    name,
    amountMode: toText(input.amountMode) ?? "fixed",
    amountMxn: toOptionalMoney(input.amountMxn),
    dayOfMonth,
    categoryId: toOptionalInt(input.categoryId),
    subcategoryId: toOptionalInt(input.subcategoryId),
    accountId: toOptionalInt(input.accountId),
    merchantId: toOptionalInt(input.merchantId),
    startsPeriod,
    endsPeriod,
    active: input.active,
    autoExecute: input.autoExecute === true,
    effectiveFrom,
    created: toOptionalText(input.created),
    updated: toOptionalText(input.updated)
  };
}

/**
 * Primer periodo en que la plantilla aplica: el mes de `effectiveFrom` cuando existe y es
 * posterior a `startsPeriod`. Réplica de `RecurringItemService.ResolveFirstPeriod`: comparación
 * lexicográfica, válida porque `yyyy-MM` está rellenado con ceros.
 */
export function templateFirstPeriod(template: RecurringItem): string {
  const effectiveMonth = typeof template.effectiveFrom === "string" ? template.effectiveFrom.slice(0, 7) : "";
  if (isTemplatePeriod(effectiveMonth) && effectiveMonth > template.startsPeriod) {
    return effectiveMonth;
  }

  return template.startsPeriod;
}

/** La plantilla aplica al periodo cuando cae dentro de su ventana de vigencia. */
export function isTemplateInPeriod(template: RecurringItem, period: string): boolean {
  if (!isTemplatePeriod(period)) {
    return false;
  }

  if (period < templateFirstPeriod(template)) {
    return false;
  }

  if (template.endsPeriod !== null && period > template.endsPeriod) {
    return false;
  }

  return true;
}

function asBudgetItemCandidate(input: unknown): Pick<BudgetItem, "kind" | "name" | "periodKey" | "recurringItemId"> | null {
  if (!isRecord(input)) {
    return null;
  }

  const kind = toText(input.kind);
  const name = toText(input.name);
  const periodKey = typeof input.periodKey === "string" ? input.periodKey : null;
  if (kind === null || name === null || periodKey === null) {
    return null;
  }

  return { kind, name, periodKey, recurringItemId: toOptionalInt(input.recurringItemId) };
}

/**
 * Partida del periodo que ya cubre la plantilla, si existe: primero por ligue directo
 * (`recurringItemId`), luego por clave de ocurrencia (`kind` + `name`, la del índice único).
 * El ligue gana porque una partida manual con el mismo nombre no es la ocurrencia.
 */
export function findTemplateBudgetItem(items: unknown, template: RecurringItem, period: string): BudgetItem | null {
  if (!Array.isArray(items) || !isTemplatePeriod(period)) {
    return null;
  }

  let byName: BudgetItem | null = null;

  for (const raw of items) {
    const item = asBudgetItemCandidate(raw);
    if (!item || item.periodKey !== period) {
      continue;
    }

    if (item.recurringItemId !== null && item.recurringItemId === template.recurringItemId) {
      return raw as BudgetItem;
    }

    if (byName === null && item.kind === template.kind && item.name === template.name) {
      byName = raw as BudgetItem;
    }
  }

  return byName;
}

/**
 * Plantillas que pueden entrar al periodo en un clic: activas, vigentes ese mes y sin partida que
 * las cubra. Ordenadas por tipo y nombre para una lista estable.
 */
export function pendingTemplatesForPeriod(templates: unknown, items: unknown, period: string): RecurringItem[] {
  if (!Array.isArray(templates) || !isTemplatePeriod(period)) {
    return [];
  }

  const pending: RecurringItem[] = [];
  for (const raw of templates) {
    const template = asTemplateCandidate(raw);
    if (!template || !template.active) {
      continue;
    }

    if (!isTemplateInPeriod(template, period)) {
      continue;
    }

    if (findTemplateBudgetItem(items, template, period) !== null) {
      continue;
    }

    pending.push(template);
  }

  pending.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  return pending;
}

/**
 * Cuerpo del alta selectiva. `plannedDate` solo aporta el mes destino (`{period}-01`): el día y
 * el monto los deriva el backend de la plantilla, así que aquí no se prellena nada que el
 * servidor deba validar. `null` cuando la plantilla no es candidata o el periodo es inválido.
 */
export function toTemplateWritePayload(template: unknown, period: string): { recurringItemId: number; plannedDate: string } | null {
  const candidate = asTemplateCandidate(template);
  if (!candidate || !candidate.active || !isTemplatePeriod(period)) {
    return null;
  }

  if (!isTemplateInPeriod(candidate, period)) {
    return null;
  }

  return { recurringItemId: candidate.recurringItemId, plannedDate: `${period}-01` };
}
