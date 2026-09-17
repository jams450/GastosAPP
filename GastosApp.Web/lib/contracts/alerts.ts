type UnknownRecord = Record<string, unknown>;

export const ALERT_OUTBOX_STATUSES = ["pending", "sent", "failed"] as const;

export type AlertOutboxStatus = (typeof ALERT_OUTBOX_STATUSES)[number];

export function isAlertOutboxStatus(value: string): value is AlertOutboxStatus {
  return (ALERT_OUTBOX_STATUSES as readonly string[]).includes(value);
}

export type AlertDelivery = {
  deliveryId: number;
  budgetId: number;
  budgetName: string;
  thresholdId: number;
  thresholdName: string;
  periodKey: string;
  thresholdPercent: number;
  budgetAmount: number;
  spentAmount: number;
  percentUsed: number;
  createdAt: string | null;
  outboxStatus: string | null;
  sentAt: string | null;
};

/**
 * Fila de outbox para diagnóstico. Deliberadamente **sin** `payload` ni `lastError`:
 * el BFF no reexpone el contenido de la alerta ni el error crudo del canal.
 */
export type AlertOutboxEntry = {
  outboxId: number;
  deliveryId: number;
  budgetId: number;
  periodKey: string;
  channel: string;
  status: string;
  attempts: number;
  nextAttemptAt: string | null;
  sentAt: string | null;
  createdAt: string | null;
};

export type AlertRetryResult = {
  outboxId: number;
  success: boolean;
  reason: string;
  status: string | null;
  attempts: number;
  nextAttemptAt: string | null;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return fallback;
}

function toText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function toOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function normalizeAlertDelivery(input: unknown): AlertDelivery | null {
  if (!isRecord(input)) {
    return null;
  }

  const deliveryId = toOptionalInt(input.deliveryId ?? input.DeliveryId);
  if (deliveryId === null || deliveryId <= 0) {
    return null;
  }

  return {
    deliveryId,
    budgetId: toOptionalInt(input.budgetId ?? input.BudgetId) ?? 0,
    budgetName: toText(input.budgetName ?? input.BudgetName, "Sin nombre"),
    thresholdId: toOptionalInt(input.thresholdId ?? input.ThresholdId) ?? 0,
    thresholdName: toText(input.thresholdName ?? input.ThresholdName, "Umbral"),
    periodKey: typeof (input.periodKey ?? input.PeriodKey) === "string" ? String(input.periodKey ?? input.PeriodKey).trim() : "",
    thresholdPercent: toFiniteNumber(input.thresholdPercent ?? input.ThresholdPercent),
    budgetAmount: toFiniteNumber(input.budgetAmount ?? input.BudgetAmount),
    spentAmount: toFiniteNumber(input.spentAmount ?? input.SpentAmount),
    percentUsed: toFiniteNumber(input.percentUsed ?? input.PercentUsed),
    createdAt: toOptionalText(input.createdAt ?? input.CreatedAt),
    outboxStatus: toOptionalText(input.outboxStatus ?? input.OutboxStatus),
    sentAt: toOptionalText(input.sentAt ?? input.SentAt)
  };
}

export function normalizeAlertDeliveries(input: unknown): AlertDelivery[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((item) => normalizeAlertDelivery(item)).filter((item): item is AlertDelivery => item !== null);
}

export function normalizeAlertOutboxEntry(input: unknown): AlertOutboxEntry | null {
  if (!isRecord(input)) {
    return null;
  }

  const outboxId = toOptionalInt(input.outboxId ?? input.OutboxId);
  if (outboxId === null || outboxId <= 0) {
    return null;
  }

  return {
    outboxId,
    deliveryId: toOptionalInt(input.deliveryId ?? input.DeliveryId) ?? 0,
    budgetId: toOptionalInt(input.budgetId ?? input.BudgetId) ?? 0,
    periodKey: typeof (input.periodKey ?? input.PeriodKey) === "string" ? String(input.periodKey ?? input.PeriodKey).trim() : "",
    channel: toText(input.channel ?? input.Channel, ""),
    status: toText(input.status ?? input.Status, ""),
    attempts: toOptionalInt(input.attempts ?? input.Attempts) ?? 0,
    nextAttemptAt: toOptionalText(input.nextAttemptAt ?? input.NextAttemptAt),
    sentAt: toOptionalText(input.sentAt ?? input.SentAt),
    createdAt: toOptionalText(input.createdAt ?? input.CreatedAt)
  };
}

export function normalizeAlertOutbox(input: unknown): AlertOutboxEntry[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((item) => normalizeAlertOutboxEntry(item)).filter((item): item is AlertOutboxEntry => item !== null);
}

export function normalizeAlertRetryResult(input: unknown): AlertRetryResult | null {
  if (!isRecord(input)) {
    return null;
  }

  const outboxId = toOptionalInt(input.outboxId ?? input.OutboxId);
  if (outboxId === null || outboxId <= 0) {
    return null;
  }

  return {
    outboxId,
    success: toBool(input.success ?? input.Success),
    reason: toText(input.reason ?? input.Reason, ""),
    status: toOptionalText(input.status ?? input.Status),
    attempts: toOptionalInt(input.attempts ?? input.Attempts) ?? 0,
    nextAttemptAt: toOptionalText(input.nextAttemptAt ?? input.NextAttemptAt)
  };
}
