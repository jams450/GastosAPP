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
  dropOlderThanDays: number;
  rows: EmailPreviewRow[];
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

  return {
    total: toNumber(record.total),
    returned: toNumber(record.returned) || rows.length,
    unreadable: toNumber(record.unreadable),
    skippedOutOfRange: toNumber(record.skippedOutOfRange),
    skippedByLimit: toNumber(record.skippedByLimit),
    dropOlderThanDays: toNumber(record.dropOlderThanDays),
    rows
  };
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
  llm: "LLM"
};
