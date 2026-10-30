type UnknownRecord = Record<string, unknown>;

export type EmailRuleMatchField = "sender" | "sender_domain" | "subject";

export type EmailRuleMatchType = "equals" | "contains" | "starts_with" | "ends_with";

export type EmailRuleGroupCombinator = "and" | "or";

/**
 * Acción terminal de la regla. La primera regla que casa decide y la evaluación se detiene, así que
 * `review` y `llm` nunca caen a la regla siguiente.
 */
export type EmailRuleAction = "assign_label" | "review" | "llm";

/** Una condición dentro de un grupo. `negated` invierte solo esta condición. */
export type EmailRuleCondition = {
  matchField: EmailRuleMatchField;
  matchType: EmailRuleMatchType;
  matchValue: string;
  negated: boolean;
};

/**
 * Grupo booleano: combina con su operador a sus condiciones y a sus subgrupos. `negated` invierte el
 * resultado ya combinado —no el de cada hijo—, que es lo que expresa «NO (factura O invoice)».
 */
export type EmailRuleGroup = {
  combinator: EmailRuleGroupCombinator;
  negated: boolean;
  conditions: EmailRuleCondition[];
  groups: EmailRuleGroup[];
};

export type EmailRule = {
  conditionCount: number;
  emailRuleId: number;
  userId: number | null;
  name: string;
  action: EmailRuleAction;
  matchField: EmailRuleMatchField;
  matchType: EmailRuleMatchType;
  matchValue: string;
  /** Nula en las acciones terminales: no hay etiqueta que aplicar. */
  targetLabelId: number | null;
  targetLabelName: string | null;
  targetLabelBehavior: string | null;
  priority: number;
  active: boolean;
  /** Árbol guardado; nulo en las reglas de una sola condición (listado y modelo anterior). */
  root: EmailRuleGroup | null;
};

export type EmailRuleUpsertPayload = {
  name: string;
  action: EmailRuleAction;
  /**
   * Se envían vacíos cuando hay árbol. El servidor no puede vaciarlos en la base —las columnas son
   * `NOT NULL` con `CHECK`—, así que refleja la primera condición y el motor ignora las columnas
   * cuando hay grupos.
   */
  matchField: EmailRuleMatchField | "";
  matchType: EmailRuleMatchType | "";
  matchValue: string;
  /** Nula en las acciones terminales; obligatoria en `assign_label`. */
  targetLabelId: number | null;
  priority: number;
  active: boolean;
  root: EmailRuleGroup | null;
};

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; message: string };

export const EMAIL_RULE_MATCH_FIELDS: readonly EmailRuleMatchField[] = ["sender", "sender_domain", "subject"];

/**
 * Los valores son los que persiste el API (`equals`, no `exact`). La constante del backend se llama
 * `Exact` pero su valor es `equals`: si la UI mandara "exact" la regla se guardaría y nunca casaría.
 */
export const EMAIL_RULE_MATCH_TYPES: readonly EmailRuleMatchType[] = ["equals", "contains", "starts_with", "ends_with"];

export const EMAIL_RULE_COMBINATORS: readonly EmailRuleGroupCombinator[] = ["and", "or"];

export const EMAIL_RULE_ACTIONS: readonly EmailRuleAction[] = ["assign_label", "review", "llm"];

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

export const EMAIL_RULE_COMBINATOR_LABELS: Record<EmailRuleGroupCombinator, string> = {
  and: "Y (todas)",
  or: "O (cualquiera)"
};

export const EMAIL_RULE_ACTION_LABELS: Record<EmailRuleAction, string> = {
  assign_label: "Asignar etiqueta",
  review: "Enviar a revisión",
  llm: "Enviar a LLM"
};

export const EMAIL_RULE_MAX_PRIORITY = 1_000_000;

/** Mismo tope que el servicio y el evaluador. */
export const EMAIL_RULE_MAX_GROUP_DEPTH = 10;

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

function toCombinator(value: unknown): EmailRuleGroupCombinator {
  // Un combinador desconocido cae a AND, igual que en el motor: ante la duda, más estricta.
  return value === "or" ? "or" : "and";
}

function toAction(value: unknown): EmailRuleAction | null {
  return typeof value === "string" && (EMAIL_RULE_ACTIONS as readonly string[]).includes(value)
    ? (value as EmailRuleAction)
    : null;
}

/**
 * Acción de una respuesta del API. Las reglas guardadas antes de S15 no traen el campo: se leen como
 * «asignar etiqueta», que es lo que hacían. Un valor desconocido también cae ahí; quien lo rechaza es
 * el servidor, que tiene el dato autoritativo.
 */
function normalizeAction(value: unknown): EmailRuleAction {
  return toAction(value) ?? "assign_label";
}

/** El «NO» arranca apagado: las respuestas anteriores a S14 no lo traen. */
function toNegated(value: unknown): boolean {
  return value === true;
}

function normalizeCondition(input: unknown): EmailRuleCondition | null {
  if (!isRecord(input)) {
    return null;
  }

  const matchField = toMatchField(input.matchField);
  const matchType = toMatchType(input.matchType);
  const matchValue = typeof input.matchValue === "string" ? input.matchValue.trim() : "";

  if (!matchField || !matchType || matchValue.length === 0) {
    return null;
  }

  return { matchField, matchType, matchValue, negated: toNegated(input.negated) };
}

export function normalizeEmailRuleGroup(input: unknown): EmailRuleGroup | null {
  if (!isRecord(input)) {
    return null;
  }

  const conditions = Array.isArray(input.conditions)
    ? input.conditions.map(normalizeCondition).filter((condition): condition is EmailRuleCondition => condition !== null)
    : [];

  const groups = Array.isArray(input.groups)
    ? input.groups
        .map(normalizeEmailRuleGroup)
        .filter((group): group is EmailRuleGroup => group !== null)
    : [];

  if (conditions.length === 0 && groups.length === 0) {
    return null;
  }

  return { combinator: toCombinator(input.combinator), negated: toNegated(input.negated), conditions, groups };
}

export function normalizeEmailRule(input: unknown): EmailRule | null {
  if (!isRecord(input)) {
    return null;
  }

  const emailRuleId = toFiniteNumber(input.emailRuleId);
  if (emailRuleId === null) {
    return null;
  }

  // Una regla terminal llega con targetLabelId nulo; rechazarla la haría desaparecer del listado.
  const targetLabelId =
    input.targetLabelId === null || input.targetLabelId === undefined ? null : toFiniteNumber(input.targetLabelId);

  return {
    emailRuleId,
    userId: input.userId === null || input.userId === undefined ? null : toFiniteNumber(input.userId),
    name: typeof input.name === "string" && input.name.trim().length > 0 ? input.name.trim() : "Sin nombre",
    action: normalizeAction(input.action),
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
    active: Boolean(input.active),
    conditionCount: toFiniteNumber(input.conditionCount) ?? 1,
    root: normalizeEmailRuleGroup(input.root)
  };
}

export function normalizeEmailRules(input: unknown): EmailRule[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((item) => normalizeEmailRule(item)).filter((rule): rule is EmailRule => rule !== null);
}

/** Condiciones totales del árbol, para el resumen de la lista. */
export function countGroupConditions(group: EmailRuleGroup): number {
  return group.conditions.length + group.groups.reduce((total, child) => total + countGroupConditions(child), 0);
}

/** Cuántos subgrupos (no condiciones) cuelgan del árbol. */
export function countSubgroups(group: EmailRuleGroup): number {
  return group.groups.reduce((total, child) => total + 1 + countSubgroups(child), 0);
}

/** Resumen legible de una regla con árbol, para la columna de la tabla. */
export function summarizeGroup(group: EmailRuleGroup | null): string {
  if (!group) {
    return "";
  }

  const conditions = countGroupConditions(group);
  const subgroups = countSubgroups(group);
  const parts = [`${conditions} ${conditions === 1 ? "condición" : "condiciones"}`];

  if (subgroups > 0) {
    parts.push(`${subgroups} ${subgroups === 1 ? "subgrupo" : "subgrupos"}`);
  }

  return parts.join(" · ");
}

function validateCondition(input: unknown): ValidationResult<EmailRuleCondition> {
  if (!isRecord(input)) {
    return { ok: false, message: "Condición inválida" };
  }

  const matchField = toMatchField(input.matchField);
  if (!matchField) {
    return { ok: false, message: "Cada condición necesita un campo válido" };
  }

  const matchType = toMatchType(input.matchType);
  if (!matchType) {
    return { ok: false, message: "Cada condición necesita una comparación válida" };
  }

  const matchValue = typeof input.matchValue === "string" ? input.matchValue.trim() : "";
  if (matchValue.length === 0) {
    return { ok: false, message: "Cada condición necesita un valor" };
  }

  if (matchValue.length > 200) {
    return { ok: false, message: "El valor de una condición no puede exceder 200 caracteres" };
  }

  return { ok: true, data: { matchField, matchType, matchValue, negated: toNegated(input.negated) } };
}

export function validateEmailRuleGroup(input: unknown, depth = 0): ValidationResult<EmailRuleGroup> {
  if (!isRecord(input)) {
    return { ok: false, message: "Grupo inválido" };
  }

  if (depth > EMAIL_RULE_MAX_GROUP_DEPTH) {
    return { ok: false, message: `La regla no puede anidar más de ${EMAIL_RULE_MAX_GROUP_DEPTH} niveles` };
  }

  const rawConditions = Array.isArray(input.conditions) ? input.conditions : [];
  const conditions: EmailRuleCondition[] = [];

  for (const raw of rawConditions) {
    const validated = validateCondition(raw);
    if (!validated.ok) {
      return validated;
    }

    conditions.push(validated.data);
  }

  const rawGroups = Array.isArray(input.groups) ? input.groups : [];
  const groups: EmailRuleGroup[] = [];

  for (const raw of rawGroups) {
    const validated = validateEmailRuleGroup(raw, depth + 1);
    if (!validated.ok) {
      return validated;
    }

    groups.push(validated.data);
  }

  // Un grupo vacío nunca casa en el motor, así que se rechaza al guardar en vez de dejar una regla
  // que no va a clasificar nada y parecerá un fallo del clasificador.
  if (conditions.length === 0 && groups.length === 0) {
    return { ok: false, message: "Hay un grupo sin condiciones: agrega al menos una" };
  }

  return {
    ok: true,
    data: { combinator: toCombinator(input.combinator), negated: toNegated(input.negated), conditions, groups }
  };
}

export function validateEmailRulePayload(input: unknown): ValidationResult<EmailRuleUpsertPayload> {
  if (!isRecord(input)) {
    return { ok: false, message: "Payload inválido" };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 2 || name.length > 120) {
    return { ok: false, message: "El nombre debe tener entre 2 y 120 caracteres" };
  }

  // Sin `action` la petición es del modelo anterior y asigna etiqueta, que es lo que hacía. Una acción
  // que el contrato no conoce se rechaza: guardarla la haría comportarse como otra cosa.
  const rawAction = input.action;
  const action =
    rawAction === null || rawAction === undefined || rawAction === ""
      ? "assign_label"
      : toAction(rawAction);
  if (action === null) {
    return { ok: false, message: "La acción debe ser assign_label, review o llm" };
  }

  // Solo asignar lleva etiqueta. Las acciones terminales la descartan aunque venga: no hay destino que
  // aplicar, y el servidor la guarda nula de todos modos.
  const requestedTarget = toFiniteNumber(input.targetLabelId);
  const targetLabelId =
    action === "assign_label" ? (requestedTarget !== null && requestedTarget > 0 ? requestedTarget : null) : null;

  if (action === "assign_label" && targetLabelId === null) {
    return { ok: false, message: "Selecciona una etiqueta destino" };
  }

  const priority = toFiniteNumber(input.priority) ?? 100;
  if (priority < 0 || priority > EMAIL_RULE_MAX_PRIORITY) {
    return { ok: false, message: `La prioridad debe estar entre 0 y ${EMAIL_RULE_MAX_PRIORITY}` };
  }

  // Con árbol, las columnas planas se envían vacías: el motor las ignora cuando hay grupos. El
  // servidor no puede vaciarlas en la base —son `NOT NULL` con `CHECK`—, así que las refleja desde la
  // primera condición para que la fila siga siendo válida.
  if (input.root !== null && input.root !== undefined) {
    const group = validateEmailRuleGroup(input.root);
    if (!group.ok) {
      return group;
    }

    return {
      ok: true,
      data: {
        name,
        action,
        matchField: "",
        matchType: "",
        matchValue: "",
        targetLabelId,
        priority,
        active: input.active !== false,
        root: group.data
      }
    };
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

  return {
    ok: true,
    data: {
      name,
      action,
      matchField,
      matchType,
      matchValue,
      targetLabelId,
      priority,
      active: input.active !== false,
      root: null
    }
  };
}

/**
 * Texto de la columna «Etiqueta» del listado. Una regla terminal no tiene etiqueta y mostrar un guion
 * haría parecer que le falta un dato; lo que falta es la etiqueta, porque la acción es otra.
 */
export function describeEmailRuleTarget(rule: EmailRule, labelName?: string | null): string {
  if (rule.action !== "assign_label") {
    return EMAIL_RULE_ACTION_LABELS[rule.action];
  }

  if (rule.targetLabelName) {
    return rule.targetLabelName;
  }

  if (labelName) {
    return labelName;
  }

  return rule.targetLabelId === null ? "—" : `#${rule.targetLabelId}`;
}

/** Resumen compacto de tabla: el detalle anidado se consulta solo al editar. */
export function summarizeEmailRule(rule: EmailRule): string {
  const count = rule.root ? countGroupConditions(rule.root) : rule.conditionCount;
  if (count > 1) return `Varias condiciones (${count})`;
  const type = EMAIL_RULE_MATCH_TYPE_LABELS[rule.matchType];
  return rule.matchValue.length > 0 ? `${type} ${rule.matchValue}` : "Sin condiciones";
}
