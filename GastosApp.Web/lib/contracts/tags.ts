export type Tag = {
  tagId: number;
  userId: number | null;
  name: string;
  normalizedName: string;
  active: boolean;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeTag(input: unknown): Tag | null {
  if (!isRecord(input)) {
    return null;
  }

  const tagId = toFiniteNumber(input.tagId);
  if (tagId === null) {
    return null;
  }

  return {
    tagId,
    userId: input.userId === null || input.userId === undefined ? null : toFiniteNumber(input.userId),
    name: typeof input.name === "string" && input.name.trim().length > 0 ? input.name.trim() : "Sin nombre",
    normalizedName:
      typeof input.normalizedName === "string" && input.normalizedName.trim().length > 0
        ? input.normalizedName.trim()
        : "",
    active: Boolean(input.active)
  };
}

export function normalizeTags(input: unknown): Tag[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((item) => normalizeTag(item)).filter((tag): tag is Tag => tag !== null);
}
