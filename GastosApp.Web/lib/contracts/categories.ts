export type CategoryType = "income" | "expense" | "transfer";

export type Category = {
  categoryId: number;
  userId: number | null;
  name: string;
  color: string;
  type: CategoryType;
  active: boolean;
  tags: string[];
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toCategoryType(value: unknown): CategoryType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "income" || normalized === "expense" || normalized === "transfer") {
    return normalized;
  }

  return null;
}

export function normalizeCategory(input: unknown): Category | null {
  if (!isRecord(input)) {
    return null;
  }

  const categoryId = toFiniteNumber(input.categoryId);
  const type = toCategoryType(input.type);
  if (categoryId === null || type === null) {
    return null;
  }

  return {
    categoryId,
    userId: input.userId === null || input.userId === undefined ? null : toFiniteNumber(input.userId),
    name: typeof input.name === "string" && input.name.trim().length > 0 ? input.name.trim() : "Sin nombre",
    color: typeof input.color === "string" && input.color.length > 0 ? input.color : "#000000",
    type,
    active: Boolean(input.active),
    tags: Array.isArray(input.tags)
      ? input.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean)
      : []
  };
}

export function normalizeCategories(input: unknown): Category[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => normalizeCategory(item))
    .filter((category): category is Category => category !== null);
}
