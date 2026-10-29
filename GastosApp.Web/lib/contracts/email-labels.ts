type UnknownRecord = Record<string, unknown>;

export type EmailLabelKind = "folder" | "label";

export type EmailLabelBehavior = "expense" | "income" | "ignore" | "none";

export type EmailLabel = {
  labelId: number;
  userId: number | null;
  name: string;
  slug: string;
  description: string | null;
  kind: EmailLabelKind;
  behavior: EmailLabelBehavior;
  color: string | null;
  isSystem: boolean;
  sortOrder: number;
  active: boolean;
};

export type EmailLabelUpsertPayload = {
  name: string;
  slug: string | null;
  description: string | null;
  kind: EmailLabelKind;
  behavior: EmailLabelBehavior;
  color: string | null;
  sortOrder: number;
  active: boolean;
};

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; message: string };

export const EMAIL_LABEL_KINDS: readonly EmailLabelKind[] = ["folder", "label"];

export const EMAIL_LABEL_BEHAVIORS: readonly EmailLabelBehavior[] = ["expense", "income", "ignore", "none"];

export const EMAIL_LABEL_KIND_LABELS: Record<EmailLabelKind, string> = {
  folder: "Carpeta",
  label: "Etiqueta"
};

/**
 * El comportamiento es lo que el motor hace con el correo, no el nombre de la etiqueta. Por eso
 * «Otros» es una etiqueta normal con `none` y no un caso especial del clasificador.
 */
export const EMAIL_LABEL_BEHAVIOR_LABELS: Record<EmailLabelBehavior, string> = {
  expense: "Gasto (crea borrador)",
  income: "Ingreso (crea borrador)",
  ignore: "Ignorar (no se procesa)",
  none: "Sin acción (solo clasifica)"
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toKind(value: unknown): EmailLabelKind | null {
  return typeof value === "string" && (EMAIL_LABEL_KINDS as readonly string[]).includes(value)
    ? (value as EmailLabelKind)
    : null;
}

function toBehavior(value: unknown): EmailLabelBehavior | null {
  return typeof value === "string" && (EMAIL_LABEL_BEHAVIORS as readonly string[]).includes(value)
    ? (value as EmailLabelBehavior)
    : null;
}

export function normalizeEmailLabel(input: unknown): EmailLabel | null {
  if (!isRecord(input)) {
    return null;
  }

  const labelId = toFiniteNumber(input.labelId);
  if (labelId === null) {
    return null;
  }

  return {
    labelId,
    userId: input.userId === null || input.userId === undefined ? null : toFiniteNumber(input.userId),
    name: typeof input.name === "string" && input.name.trim().length > 0 ? input.name.trim() : "Sin nombre",
    slug: typeof input.slug === "string" ? input.slug.trim() : "",
    description:
      typeof input.description === "string" && input.description.trim().length > 0
        ? input.description.trim()
        : null,
    kind: toKind(input.kind) ?? "folder",
    behavior: toBehavior(input.behavior) ?? "none",
    color: typeof input.color === "string" && input.color.trim().length > 0 ? input.color.trim() : null,
    isSystem: Boolean(input.isSystem),
    sortOrder: toFiniteNumber(input.sortOrder) ?? 0,
    active: Boolean(input.active)
  };
}

export function normalizeEmailLabels(input: unknown): EmailLabel[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((item) => normalizeEmailLabel(item)).filter((label): label is EmailLabel => label !== null);
}

export function validateEmailLabelPayload(input: unknown): ValidationResult<EmailLabelUpsertPayload> {
  if (!isRecord(input)) {
    return { ok: false, message: "Payload inválido" };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 2 || name.length > 80) {
    return { ok: false, message: "El nombre debe tener entre 2 y 80 caracteres" };
  }

  const kind = toKind(input.kind);
  if (!kind) {
    return { ok: false, message: "kind debe ser folder o label" };
  }

  const behavior = toBehavior(input.behavior);
  if (!behavior) {
    return { ok: false, message: "behavior debe ser expense, income, ignore o none" };
  }

  const sortOrder = toFiniteNumber(input.sortOrder) ?? 0;
  if (sortOrder < 0) {
    return { ok: false, message: "El orden no puede ser negativo" };
  }

  const slug = typeof input.slug === "string" && input.slug.trim().length > 0 ? input.slug.trim() : null;
  if (slug !== null && slug.length > 80) {
    return { ok: false, message: "El identificador no puede exceder 80 caracteres" };
  }

  const color = typeof input.color === "string" ? input.color.trim() : "";
  if (color.length > 0 && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return { ok: false, message: "El color debe ser hexadecimal de seis dígitos, por ejemplo #64748b" };
  }

  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (description.length > 500) {
    return { ok: false, message: "La descripción no puede exceder 500 caracteres" };
  }

  return {
    ok: true,
    data: {
      name,
      slug,
      description: description.length > 0 ? description : null,
      kind,
      behavior,
      color: color.length > 0 ? color.toLowerCase() : null,
      sortOrder,
      active: input.active !== false
    }
  };
}
