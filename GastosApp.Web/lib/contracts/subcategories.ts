export type Subcategory = {
  subcategoryId: number;
  userId: number | null;
  categoryId: number;
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

export function normalizeSubcategory(input: unknown): Subcategory | null {
  if (!isRecord(input)) {
    return null;
  }

  const subcategoryId = toFiniteNumber(input.subcategoryId);
  const categoryId = toFiniteNumber(input.categoryId);
  if (subcategoryId === null || categoryId === null) {
    return null;
  }

  return {
    subcategoryId,
    userId: input.userId === null || input.userId === undefined ? null : toFiniteNumber(input.userId),
    categoryId,
    name: typeof input.name === "string" && input.name.trim().length > 0 ? input.name.trim() : "Sin nombre",
    normalizedName:
      typeof input.normalizedName === "string" && input.normalizedName.trim().length > 0
        ? input.normalizedName.trim()
        : "",
    active: Boolean(input.active)
  };
}

export function normalizeSubcategories(input: unknown): Subcategory[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => normalizeSubcategory(item))
    .filter((subcategory): subcategory is Subcategory => subcategory !== null);
}
