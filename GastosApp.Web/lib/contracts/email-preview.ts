type UnknownRecord = Record<string, unknown>;

export type EmailPreviewRow = {
  name: string;
  senderAddress: string | null;
  senderDomain: string | null;
  subject: string | null;
  receivedAt: string | null;
  outcome: string;
  labelSlug: string | null;
  labelBehavior: string | null;
  matchedRuleName: string | null;
  classifiedBy: string;
  reason: string;
  projectedState: string;
};

export type EmailPreviewResult = {
  total: number;
  returned: number;
  unreadable: number;
  skippedOutOfRange: number;
  skippedByLimit: number;
  /**
   * Filas del buzón que ya tenían la etiqueta destino de su regla: se leyeron y clasificaron, pero no
   * se listan ni entran al plan de aplicar. Siguen dentro de `total`.
   */
  skippedAlreadyLabelled: number;
  dropOlderThanDays: number;
  rows: EmailPreviewRow[];
  /**
   * Token opaco para aplicar **esta** muestra. Es nulo cuando no hay nada que aplicar (solo `.eml`,
   * candidatos a mano o ninguna fila con etiqueta), y en ese caso la pantalla no ofrece aplicar.
   */
  applyToken: string | null;
  /** Vencimiento del token en UTC (ISO). Pasado ese momento el backend lo rechaza. */
  applyExpiresAt: string | null;
  /** Filas de esta muestra que se pueden etiquetar. */
  applicableCount: number;
};

export type EmailPreviewMessageInput = {
  name: string;
  raw: string;
};

export type EmailPreviewCandidateInput = {
  name: string;
  senderAddress: string;
  subject: string;
  receivedAt: string | null;
};

export type EmailPreviewRequest = {
  messages: EmailPreviewMessageInput[];
  candidates: EmailPreviewCandidateInput[];
  maxItems: number;
  from: string | null;
  to: string | null;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Un conteo solo es válido si el API manda un entero no negativo. `Number(null)` y `Number("")` dan
 * 0, y aceptar eso convertiría un campo ausente en un «cero aplicados» que parece un resultado real.
 */
function toCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }

  return value;
}

function normalizeRow(input: unknown): EmailPreviewRow | null {
  if (!isRecord(input)) {
    return null;
  }

  return {
    name: toText(input.name) ?? "mensaje",
    senderAddress: toText(input.senderAddress),
    senderDomain: toText(input.senderDomain),
    subject: toText(input.subject),
    receivedAt: toText(input.receivedAt),
    outcome: toText(input.outcome) ?? "review",
    labelSlug: toText(input.labelSlug),
    labelBehavior: toText(input.labelBehavior),
    matchedRuleName: toText(input.matchedRuleName),
    classifiedBy: toText(input.classifiedBy) ?? "none",
    reason: toText(input.reason) ?? "",
    projectedState: toText(input.projectedState) ?? "review"
  };
}

export function normalizePreviewResult(input: unknown): EmailPreviewResult {
  const record = isRecord(input) ? input : {};
  const rows = Array.isArray(record.rows)
    ? record.rows.map((row) => normalizeRow(row)).filter((row): row is EmailPreviewRow => row !== null)
    : [];

  // El token y su conteo son un par: un token sin filas aplicables no se ofrece, porque la acción no
  // haría nada y la pantalla mostraría un botón que promete trabajo inexistente.
  const applicableCount = toCount(record.applicableCount) ?? 0;
  const applyToken = applicableCount > 0 ? toText(record.applyToken) : null;

  return {
    total: toNumber(record.total),
    returned: toNumber(record.returned) || rows.length,
    unreadable: toNumber(record.unreadable),
    skippedOutOfRange: toNumber(record.skippedOutOfRange),
    skippedByLimit: toNumber(record.skippedByLimit),
    skippedAlreadyLabelled: toNumber(record.skippedAlreadyLabelled),
    dropOlderThanDays: toNumber(record.dropOlderThanDays),
    rows,
    applyToken,
    applyExpiresAt: applyToken ? toText(record.applyExpiresAt) : null,
    applicableCount
  };
}

/** Estados que devuelve aplicar. Cualquier otro valor se considera una respuesta ilegible. */
export const EMAIL_APPLY_STATUS_LABELS = {
  applied: "Etiquetado",
  skipped: "Omitido",
  failed: "Falló"
} as const;

export type EmailApplyRowStatus = keyof typeof EMAIL_APPLY_STATUS_LABELS;

export type EmailApplyRow = {
  name: string;
  label: string;
  status: EmailApplyRowStatus;
  message: string;
};

export type EmailApplyResult = {
  rows: EmailApplyRow[];
  applied: number;
  skipped: number;
  failed: number;
};

/**
 * Normaliza el resultado de aplicar. Devuelve `null` cuando la respuesta no se puede leer completa:
 * un estado desconocido o un conteo ausente no se convierte en «aplicado», porque pintar un éxito
 * inventado sobre una escritura en el buzón es el único error que esta pantalla no puede cometer.
 * La pantalla trata `null` como resultado incierto y pide una vista previa nueva.
 */
export function normalizeApplyResult(input: unknown): EmailApplyResult | null {
  if (!isRecord(input) || !Array.isArray(input.rows)) {
    return null;
  }

  const rows: EmailApplyRow[] = [];
  for (const raw of input.rows) {
    if (!isRecord(raw)) {
      return null;
    }

    const status = toText(raw.status);
    // `in` recorrería la cadena de prototipos: «toString» pasaría como estado válido.
    if (status === null || !Object.prototype.hasOwnProperty.call(EMAIL_APPLY_STATUS_LABELS, status)) {
      return null;
    }

    rows.push({
      name: toText(raw.name) ?? "mensaje",
      label: toText(raw.label) ?? "",
      status: status as EmailApplyRowStatus,
      message: toText(raw.message) ?? ""
    });
  }

  const applied = toCount(input.applied);
  const skipped = toCount(input.skipped);
  const failed = toCount(input.failed);
  if (applied === null || skipped === null || failed === null) {
    return null;
  }

  if (
    applied !== rows.filter((row) => row.status === "applied").length ||
    skipped !== rows.filter((row) => row.status === "skipped").length ||
    failed !== rows.filter((row) => row.status === "failed").length
  ) {
    return null;
  }

  return { rows, applied, skipped, failed };
}

/** Etiquetas y carpetas que expone la conexión IMAP, o el motivo por el que no hay ninguna. */
export type EmailMailboxes = {
  configured: boolean;
  mailboxes: string[];
  message: string | null;
};

export function normalizeMailboxes(input: unknown): EmailMailboxes {
  const record = isRecord(input) ? input : {};
  const mailboxes = Array.isArray(record.mailboxes)
    ? record.mailboxes.filter((name): name is string => typeof name === "string" && name.trim().length > 0)
    : [];

  return {
    configured: Boolean(record.configured),
    mailboxes,
    message: toText(record.message)
  };
}

/** Etiqueta legible del veredicto; el backend devuelve el enum en minúsculas. */
export const PREVIEW_OUTCOME_LABELS: Record<string, string> = {
  expense: "Gasto (crearía borrador)",
  income: "Ingreso (crearía borrador)",
  ignored: "Ignorado",
  classified: "Clasificado sin acción",
  review: "Revisión"
};

export const PREVIEW_REASON_LABELS: Record<string, string> = {
  rule: "Regla",
  "no_match": "Ninguna regla",
  "too_old": "Fuera del corte de antigüedad",
  "rule_review": "Revisión pedida por la regla",
  "llm_requested": "Decide el LLM (la regla lo pidió)",
  llm: "LLM",
  "llm_unavailable": "LLM no disponible: revisión",
  "llm_budget_exhausted": "Sin llamadas de LLM en esta corrida",
  "llm_catalog_invalid": "Catálogo de etiquetas no válido para el LLM",
  "llm_uncertain": "El LLM no pudo decidir: revisión"
};
