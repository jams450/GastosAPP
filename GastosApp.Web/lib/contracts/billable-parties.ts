export type BillableParty = {
  billablePartyId: number;
  ownerUserId: number;
  linkedUserId: number | null;
  type: "self" | "system_user" | "external_person";
  displayName: string;
  active: boolean;
  notes: string | null;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPartyType(value: unknown): "self" | "system_user" | "external_person" {
  if (value === "self" || value === "system_user") {
    return value;
  }

  return "external_person";
}

export function normalizeBillableParty(input: unknown): BillableParty | null {
  if (!isRecord(input)) {
    return null;
  }

  const billablePartyId = toFiniteNumber(input.billablePartyId ?? input.BillablePartyId);
  if (billablePartyId === null) {
    return null;
  }

  const ownerUserId = toFiniteNumber(input.ownerUserId ?? input.OwnerUserId) ?? 0;
  const displayNameRaw = input.displayName ?? input.DisplayName;
  const displayName = typeof displayNameRaw === "string" && displayNameRaw.trim().length > 0 ? displayNameRaw.trim() : "Sin nombre";

  return {
    billablePartyId,
    ownerUserId,
    linkedUserId:
      input.linkedUserId === null || input.linkedUserId === undefined
        ? null
        : toFiniteNumber(input.linkedUserId ?? input.LinkedUserId),
    type: toPartyType(input.type ?? input.Type),
    displayName,
    active: Boolean(input.active ?? input.Active),
    notes: typeof (input.notes ?? input.Notes) === "string" ? String(input.notes ?? input.Notes) : null
  };
}

export function normalizeBillableParties(input: unknown): BillableParty[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => normalizeBillableParty(item))
    .filter((party): party is BillableParty => party !== null);
}
