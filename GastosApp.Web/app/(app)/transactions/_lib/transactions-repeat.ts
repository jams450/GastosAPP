import type {
  ExpenseAllocationFormState,
  RepeatPrefill,
  TransactionHistoryItem,
  TransactionKind
} from "./transactions-types";

export const REPEAT_QUERY_KEY = "repeat";

export function buildRepeatPrefill(item: TransactionHistoryItem): RepeatPrefill | null {
  if (item.type !== "income" && item.type !== "expense") {
    return null;
  }

  const allocations = item.allocations.length > 0
    ? item.allocations.map((allocation) => ({
        rowId: crypto.randomUUID(),
        billablePartyId: allocation.billablePartyId,
        type: allocation.allocationMode,
        value: String(allocation.allocationValue)
      }))
    : undefined;

  return {
    kind: item.type,
    accountId: item.accountId,
    categoryId: item.categoryId,
    subcategoryId: item.subcategoryId,
    merchantId: item.merchantId,
    amount: String(item.amount),
    description: item.description,
    tagsText: item.tags.join(", "),
    ...(allocations === undefined ? {} : { allocations })
  };
}

export function repeatSearchParams(prefill: RepeatPrefill): string {
  return `${REPEAT_QUERY_KEY}=${encodeURIComponent(JSON.stringify(prefill))}`;
}

export function parseRepeatPrefill(raw: string | null | undefined, expectedKind: TransactionKind): RepeatPrefill | null {
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const kind = Reflect.get(parsed, "kind");
  if ((kind !== "income" && kind !== "expense" && kind !== "transfer") || kind !== expectedKind) {
    return null;
  }

  const positiveIntegerOrNull = (candidate: unknown): number | null =>
    typeof candidate === "number" && Number.isInteger(candidate) && candidate > 0 ? candidate : null;
  const allocations = Reflect.get(parsed, "allocations");
  const mappedAllocations = Array.isArray(allocations)
    ? allocations.map((allocation): ExpenseAllocationFormState => {
        const allocationMode = allocation !== null && typeof allocation === "object" && !Array.isArray(allocation)
          ? Reflect.get(allocation, "allocationMode")
          : undefined;
        const billablePartyId = allocation !== null && typeof allocation === "object" && !Array.isArray(allocation)
          ? Reflect.get(allocation, "billablePartyId")
          : undefined;
        const allocationValue = allocation !== null && typeof allocation === "object" && !Array.isArray(allocation)
          ? Reflect.get(allocation, "allocationValue") ?? Reflect.get(allocation, "value")
          : undefined;

        return {
          rowId: crypto.randomUUID(),
          billablePartyId: positiveIntegerOrNull(billablePartyId),
          type: allocationMode === "amount" ? "amount" : "percentage",
          value: String(allocationValue ?? "")
        };
      })
    : undefined;

  return {
    kind,
    accountId: positiveIntegerOrNull(Reflect.get(parsed, "accountId")),
    categoryId: positiveIntegerOrNull(Reflect.get(parsed, "categoryId")),
    subcategoryId: positiveIntegerOrNull(Reflect.get(parsed, "subcategoryId")),
    merchantId: positiveIntegerOrNull(Reflect.get(parsed, "merchantId")),
    amount: String(Reflect.get(parsed, "amount") ?? ""),
    description: String(Reflect.get(parsed, "description") ?? ""),
    tagsText: String(Reflect.get(parsed, "tagsText") ?? ""),
    ...(mappedAllocations === undefined ? {} : { allocations: mappedAllocations })
  };
}
