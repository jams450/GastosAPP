import { currentLocalDateTimeInput } from "../_lib/transactions-utils";
import type { CatalogsResponse, ExpenseAllocationFormState } from "../_lib/transactions-types";

export function createAllocationRow(billablePartyId: number | null = null, value = ""): ExpenseAllocationFormState {
  return {
    rowId: crypto.randomUUID(),
    billablePartyId,
    type: "percentage",
    value
  };
}

export function resolveDefaultSelfBillablePartyId(catalogs: CatalogsResponse | null): number | null {
  if (!catalogs) return null;

  return catalogs.billableParties.find((party) => party.type === "self")?.billablePartyId
    ?? catalogs.billableParties.find((party) => party.displayName.trim().toLowerCase() === "yo")?.billablePartyId
    ?? null;
}

export function buildIncomeScreenDefaults() {
  return {
    transactionDate: currentLocalDateTimeInput(),
    amount: "",
    description: "",
    tagsText: ""
  };
}
