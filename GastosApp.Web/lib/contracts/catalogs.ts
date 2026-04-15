import type { CategoryType } from "@/lib/contracts/categories";

type UnknownRecord = Record<string, unknown>;

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

export type CategoryUpsertPayload = {
  name: string;
  color: string;
  type: CategoryType;
  active: boolean;
  tags: string[];
};

export type SubcategoryUpsertPayload = {
  categoryId: number;
  name: string;
  active: boolean;
};

export type MerchantUpsertPayload = {
  name: string;
  active: boolean;
};

export type TagUpsertPayload = {
  name: string;
  active: boolean;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function toPositiveNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toRequiredName(value: unknown, min = 2, max = 120): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    return null;
  }

  return normalized;
}

function toBool(value: unknown, fallback = true): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter((item): item is string => typeof item === "string").map((tag) => tag.trim()).filter(Boolean))]
    .slice(0, 20);
}

export function validateCategoryPayload(input: unknown): ValidationResult<CategoryUpsertPayload> {
  if (!isRecord(input)) {
    return { ok: false, message: "Invalid payload" };
  }

  const name = toRequiredName(input.name, 2, 100);
  const type = input.type;
  const color = typeof input.color === "string" && input.color.trim().length > 0 ? input.color.trim() : "#000000";

  if (!name) {
    return { ok: false, message: "Name is required" };
  }

  if (type !== "income" && type !== "expense" && type !== "transfer") {
    return { ok: false, message: "Type must be income, expense or transfer" };
  }

  return {
    ok: true,
    data: {
      name,
      color,
      type,
      active: toBool(input.active, true),
      tags: normalizeTags(input.tags)
    }
  };
}

export function validateSubcategoryPayload(input: unknown): ValidationResult<SubcategoryUpsertPayload> {
  if (!isRecord(input)) {
    return { ok: false, message: "Invalid payload" };
  }

  const name = toRequiredName(input.name, 2, 100);
  const categoryId = toPositiveNumber(input.categoryId);

  if (!name || !categoryId) {
    return { ok: false, message: "categoryId and name are required" };
  }

  return {
    ok: true,
    data: {
      categoryId,
      name,
      active: toBool(input.active, true)
    }
  };
}

export function validateMerchantPayload(input: unknown): ValidationResult<MerchantUpsertPayload> {
  if (!isRecord(input)) {
    return { ok: false, message: "Invalid payload" };
  }

  const name = toRequiredName(input.name, 2, 120);
  if (!name) {
    return { ok: false, message: "Name is required" };
  }

  return {
    ok: true,
    data: {
      name,
      active: toBool(input.active, true)
    }
  };
}

export function validateTagPayload(input: unknown): ValidationResult<TagUpsertPayload> {
  if (!isRecord(input)) {
    return { ok: false, message: "Invalid payload" };
  }

  const name = toRequiredName(input.name, 1, 80);
  if (!name) {
    return { ok: false, message: "Name is required" };
  }

  return {
    ok: true,
    data: {
      name,
      active: toBool(input.active, true)
    }
  };
}
