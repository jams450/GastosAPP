export type Merchant = {
  merchantId: number;
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

export function normalizeMerchant(input: unknown): Merchant | null {
  if (!isRecord(input)) {
    return null;
  }

  const merchantId = toFiniteNumber(input.merchantId);
  if (merchantId === null) {
    return null;
  }

  return {
    merchantId,
    userId: input.userId === null || input.userId === undefined ? null : toFiniteNumber(input.userId),
    name: typeof input.name === "string" && input.name.trim().length > 0 ? input.name.trim() : "Sin nombre",
    normalizedName:
      typeof input.normalizedName === "string" && input.normalizedName.trim().length > 0
        ? input.normalizedName.trim()
        : "",
    active: Boolean(input.active)
  };
}

export function normalizeMerchants(input: unknown): Merchant[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((item) => normalizeMerchant(item)).filter((merchant): merchant is Merchant => merchant !== null);
}
