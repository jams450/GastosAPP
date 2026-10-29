type UnknownRecord = Record<string, unknown>;

export type EmailRuleMatchField = "sender" | "sender_domain" | "subject";

export type EmailRuleMatchType = "equals" | "contains" | "starts_with" | "ends_with";

export type EmailRule = {
  emailRuleId: number;
  userId: number | null;
  name: string;
  matchField: EmailRuleMatchField;
  matchType: EmailRuleMatchType;
  matchValue: string;
  targetLabelId: number;
  targetLabelName: string | null;
  targetLabelBehavior: string | null;
  priority: number;
  active: boolean;
};

export type EmailRuleUpsertPayload = {
  name: string;
  matchField: EmailRuleMatchField;
  matchType: EmailRuleMatchType;
  matchValue: string;
  targetLabelId: number;
  priority: number;
  active: boolean;
};

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; message: string };

export const EMAIL_RULE_MATCH_FIELDS: readonly EmailRuleMatchField[] = ["sender", "sender_domain", "subject"];

/**
 * Los valores son los que persiste el API (`equals`, no `exact`). La constante del backend se llama
 * `Exact` pero su valor es `equals`: si la UI mandara "exact" la regla se guardaría y nunca casaría.
 */
export const EMAIL_RULE_MATCH_TYPES: readonly EmailRuleMatchType[] = ["equals", "contains", "starts_with", "ends_with"];

export const EMAIL_RULE_MATCH_FIELD_LABELS: Record<EmailRuleMatchField, string> = {
  sender: "Remitente",
  sender_domain: "Dominio del remitente",
  subject: "Asunto"
};

export const EMAIL_RULE_MATCH_TYPE_LABELS: Record<EmailRuleMatchType, string> = {
  equals: "Es igual a",
  contains: "Contiene",
  starts_with: "Empieza con",
  ends_with: "Termina con"
};

export const EMAIL_RULE_MAX_PRIORITY = 1_000_000;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toMatchField(value: unknown): EmailRuleMatchField | null {
  return typeof value === "string" && (EMAIL_RULE_MATCH_FIELDS as readonly string[]).includes(value)
    ? (value as EmailRuleMatchField)
    : null;
}

function toMatchType(value: unknown): EmailRuleMatchType | null {
  return typeof value === "string" && (EMAIL_RULE_MATCH_TYPES as readonly string[]).includes(value)
    ? (value as EmailRuleMatchType)
    : null;
}

export function normalizeEmailRule(input: unknown): EmailRule | null {
  if (!isRecord(input)) {
    return null;
  }

  const emailRuleId = toFiniteNumber(input.emailRuleId);
  const targetLabelId = toFiniteNumber(input.targetLabelId);
  if (emailRuleId === null || targetLabelId === null) {
    return null;
  }

  return {
    emailRuleId,
    userId: input.userId === null || input.userId === undefined ? null : toFiniteNumber(input.userId),
    name: typeof input.name === "string" && input.name.trim().length > 0 ? input.name.trim() : "Sin nombre",
    matchField: toMatchField(input.matchField) ?? "sender",
    matchType: toMatchType(input.matchType) ?? "contains",
    matchValue: typeof input.matchValue === "string" ? input.matchValue.trim() : "",
    targetLabelId,
    targetLabelName:
      typeof input.targetLabelName === "string" && input.targetLabelName.trim().length > 0
        ? input.targetLabelName.trim()
        : null,
    targetLabelBehavior:
      typeof input.targetLabelBehavior === "string" && input.targetLabelBehavior.trim().length > 0
        ? input.targetLabelBehavior.trim()
        : null,
    priority: toFiniteNumber(input.priority) ?? 100,
    active: Boolean(input.active)
  };
}

export function normalizeEmailRules(input: unknown): EmailRule[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((item) => normalizeEmailRule(item)).filter((rule): rule is EmailRule => rule !== null);
}

export function validateEmailRulePayload(input: unknown): ValidationResult<EmailRuleUpsertPayload> {
  if (!isRecord(input)) {
    return { ok: false, message: "Payload inválido" };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 2 || name.length > 120) {
    return { ok: false, message: "El nombre debe tener entre 2 y 120 caracteres" };
  }

  const matchField = toMatchField(input.matchField);
  if (!matchField) {
    return { ok: false, message: "matchField debe ser sender, sender_domain o subject" };
  }

  const matchType = toMatchType(input.matchType);
  if (!matchType) {
    return { ok: false, message: "matchType debe ser equals, contains, starts_with o ends_with" };
  }

  const matchValue = typeof input.matchValue === "string" ? input.matchValue.trim() : "";
  if (matchValue.length === 0 || matchValue.length > 200) {
    return { ok: false, message: "El valor a comparar debe tener entre 1 y 200 caracteres" };
  }

  const targetLabelId = toFiniteNumber(input.targetLabelId);
  if (targetLabelId === null || targetLabelId <= 0) {
    return { ok: false, message: "Selecciona una etiqueta destino" };
  }

  const priority = toFiniteNumber(input.priority) ?? 100;
  if (priority < 0 || priority > EMAIL_RULE_MAX_PRIORITY) {
    return { ok: false, message: `La prioridad debe estar entre 0 y ${EMAIL_RULE_MAX_PRIORITY}` };
  }

  return {
    ok: true,
    data: {
      name,
      matchField,
      matchType,
      matchValue,
      targetLabelId,
      priority,
      active: input.active !== false
    }
  };
}
