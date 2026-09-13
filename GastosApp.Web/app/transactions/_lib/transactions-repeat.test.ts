import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRepeatPrefill,
  parseRepeatPrefill,
  REPEAT_QUERY_KEY,
  repeatSearchParams
} from "./transactions-repeat.ts";
import type { TransactionHistoryItem } from "./transactions-types.ts";

const income: TransactionHistoryItem = {
  transactionId: 1,
  accountId: 2,
  accountName: "Cuenta",
  categoryId: 3,
  subcategoryId: 4,
  merchantId: 5,
  type: "income",
  transferGroupId: null,
  amount: 123.45,
  description: "Nómina",
  transactionDate: "2026-09-12",
  tags: ["trabajo", "mensual"],
  creditMonths: null,
  creditRemainingAmount: null,
  creditStatus: null,
  allocations: []
};

test("buildRepeatPrefill returns null for transfers", () => {
  const result = buildRepeatPrefill({ ...income, type: "transfer" });

  assert.equal(result, null);
});

test("buildRepeatPrefill returns null for opening credit", () => {
  const result = buildRepeatPrefill({ ...income, type: "opening_credit" });

  assert.equal(result, null);
});

test("buildRepeatPrefill maps income fields without allocations", () => {
  const result = buildRepeatPrefill(income);

  assert.deepEqual(result, {
    kind: "income",
    accountId: 2,
    categoryId: 3,
    subcategoryId: 4,
    merchantId: 5,
    amount: "123.45",
    description: "Nómina",
    tagsText: "trabajo, mensual"
  });
  assert.equal(Object.hasOwn(result ?? {}, "allocations"), false);
});

test("buildRepeatPrefill maps expense allocations", () => {
  const result = buildRepeatPrefill({
    ...income,
    type: "expense",
    allocations: [
      {
        transactionAllocationId: 6,
        billablePartyId: 7,
        billablePartyName: "Ana",
        allocationMode: "percentage",
        allocationValue: 60,
        calculatedAmount: 74.07
      }
    ]
  });

  assert.equal(result?.allocations?.[0]?.billablePartyId, 7);
  assert.equal(result?.allocations?.[0]?.type, "percentage");
  assert.equal(result?.allocations?.[0]?.value, "60");
  assert.match(result?.allocations?.[0]?.rowId ?? "", /^[0-9a-f-]{36}$/i);
});

test("buildRepeatPrefill excludes date, MSI, and credit fields", () => {
  const result = buildRepeatPrefill(income);

  for (const key of ["transactionDate", "msiMonths", "openingCreditCharge", "creditMonths", "creditRemainingAmount", "creditStatus"]) {
    assert.equal(Object.hasOwn(result ?? {}, key), false);
  }
});

test("repeatSearchParams serializes under the repeat query key", () => {
  const prefill = buildRepeatPrefill(income);
  assert.notEqual(prefill, null);

  assert.equal(repeatSearchParams(prefill), `${REPEAT_QUERY_KEY}=${encodeURIComponent(JSON.stringify(prefill))}`);
});

test("parseRepeatPrefill returns null for absent input", () => {
  assert.equal(parseRepeatPrefill(null, "income"), null);
  assert.equal(parseRepeatPrefill(undefined, "income"), null);
});

test("parseRepeatPrefill returns null for malformed JSON", () => {
  assert.equal(parseRepeatPrefill("{", "income"), null);
});

test("parseRepeatPrefill returns null for non-object JSON", () => {
  assert.equal(parseRepeatPrefill("[]", "income"), null);
  assert.equal(parseRepeatPrefill('"income"', "income"), null);
});

test("parseRepeatPrefill returns null for a kind mismatch", () => {
  assert.equal(parseRepeatPrefill('{"kind":"expense"}', "income"), null);
});

test("parseRepeatPrefill coerces invalid account IDs to null", () => {
  const result = parseRepeatPrefill('{"kind":"income","accountId":0}', "income");

  assert.equal(result?.accountId, null);
});

test("parseRepeatPrefill maps allocations with fresh row IDs", () => {
  const result = parseRepeatPrefill(
    '{"kind":"expense","allocations":[{"billablePartyId":8,"allocationMode":"amount","allocationValue":45.5}]}',
    "expense"
  );

  assert.match(result?.allocations?.[0]?.rowId ?? "", /^[0-9a-f-]{36}$/i);
  assert.deepEqual(
    result?.allocations?.map((a) => ({ billablePartyId: a.billablePartyId, type: a.type, value: a.value })),
    [{ billablePartyId: 8, type: "amount", value: "45.5" }]
  );
});
