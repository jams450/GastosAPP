import assert from "node:assert/strict";
import { test } from "node:test";
import {
  eligibleLinkAccounts,
  emptyOffer,
  emptyProductForm,
  inferredValidTo,
  isAllowedInstitution,
  MAX_SPECIAL_CONDITION_LENGTH,
  toProductPayload,
  validateProductForm,
  type ProductFormValues
} from "./investment-form-model.ts";

function validForm(overrides: Partial<ProductFormValues> = {}): ProductFormValues {
  return {
    ...emptyProductForm("2026-09"),
    accountId: "7",
    name: "Nu cajita",
    institution: "nu",
    offers: [
      {
        capturedForMonth: "2026-09",
        validFrom: "2026-09-01",
        validTo: "2026-12-31",
        sourceUrl: "https://example.com/tasas",
        sourceLabel: "Sitio oficial",
        termsText: "",
        conditionsConfirmed: true,
        tiers: [{ minimumAmount: "0", maximumAmount: "", annualRatePercent: "7.5", specialConditionText: "" }]
      }
    ],
    ...overrides
  };
}

test("the institution catalog accepts exactly the seven V1 codes", () => {
  for (const code of ["revolut", "cetes", "nu", "klar", "finsus", "didi", "mercado_libre"]) {
    assert.equal(isAllowedInstitution(code), true, `${code} debe ser válido`);
  }

  // Free text and near-misses must be rejected: the server enforces the same list.
  for (const value of ["Nu", "nu ", "banco_nu", "mercado libre", "", null, undefined, 42]) {
    assert.equal(isAllowedInstitution(value), false, `${String(value)} debe ser inválido`);
  }
});

test("validateProductForm rejects a free-text institution", () => {
  assert.equal(validateProductForm(validForm()).institution, undefined);
  assert.ok(validateProductForm(validForm({ institution: "Banco Nuevo" })).institution);
  assert.ok(validateProductForm(validForm({ institution: "" })).institution);
});

test("a blank validity end is allowed and presented as December 31 of the capture year", () => {
  const form = validForm();
  const withoutValidTo = { ...form, offers: [{ ...form.offers[0], validTo: "" }] };

  assert.equal(validateProductForm(withoutValidTo)["offers.0.validity"], undefined);
  assert.equal(inferredValidTo("2026-09"), "2026-12-31");
  assert.equal(inferredValidTo("2026-09") && "2026-12-31" >= "2026-09-01", true);
  // The payload keeps the blank as null so the server can mark the validity as inferred.
  assert.equal(toProductPayload(withoutValidTo).offers[0].validTo, null);
  // An unusable capture month cannot produce an inferred date.
  assert.equal(inferredValidTo("2026-13"), null);
  assert.equal(inferredValidTo(""), null);
});

test("validateProductForm requires the marginal tier schedule to be contiguous and end unbounded", () => {
  const base = validForm();

  const valid = {
    ...base,
    offers: [
      {
        ...base.offers[0],
        tiers: [
          { minimumAmount: "0", maximumAmount: "25000", annualRatePercent: "15", specialConditionText: "" },
          { minimumAmount: "25000", maximumAmount: "", annualRatePercent: "7", specialConditionText: "" }
        ]
      }
    ]
  };
  assert.equal(validateProductForm(valid)["offers.0.tiers"], undefined);
  assert.equal(validateProductForm(valid)["offers.0.tiers.1.minimumAmount"], undefined);

  // Gap: the second tier does not start where the first ends.
  const gap = { ...valid, offers: [{ ...valid.offers[0], tiers: [{ minimumAmount: "0", maximumAmount: "25000", annualRatePercent: "15", specialConditionText: "" }, { minimumAmount: "30000", maximumAmount: "", annualRatePercent: "7", specialConditionText: "" }] }] };
  assert.ok(validateProductForm(gap)["offers.0.tiers.1.minimumAmount"]);

  // The final tier must be unbounded.
  const bounded = { ...valid, offers: [{ ...valid.offers[0], tiers: [{ minimumAmount: "0", maximumAmount: "25000", annualRatePercent: "15", specialConditionText: "" }, { minimumAmount: "25000", maximumAmount: "50000", annualRatePercent: "7", specialConditionText: "" }] }] };
  assert.ok(validateProductForm(bounded)["offers.0.tiers"]);

  // Unbounded in the middle is not a valid schedule.
  const unboundedFirst = { ...valid, offers: [{ ...valid.offers[0], tiers: [{ minimumAmount: "0", maximumAmount: "", annualRatePercent: "15", specialConditionText: "" }, { minimumAmount: "25000", maximumAmount: "", annualRatePercent: "7", specialConditionText: "" }] }] };
  assert.ok(validateProductForm(unboundedFirst)["offers.0.tiers.0.maximumAmount"]);
});

test("validateProductForm bounds the literal condition and terms text", () => {
  const base = validForm();

  const withCondition = {
    ...base,
    offers: [
      {
        ...base.offers[0],
        tiers: [
          {
            minimumAmount: "0",
            maximumAmount: "",
            annualRatePercent: "7.5",
            specialConditionText: "x".repeat(MAX_SPECIAL_CONDITION_LENGTH)
          }
        ]
      }
    ]
  };
  assert.equal(validateProductForm(withCondition)["offers.0.tiers.0.specialConditionText"], undefined);

  const tooLong = { ...withCondition, offers: [{ ...withCondition.offers[0], tiers: [{ ...withCondition.offers[0].tiers[0], specialConditionText: "x".repeat(MAX_SPECIAL_CONDITION_LENGTH + 1) }] }] };
  assert.ok(validateProductForm(tooLong)["offers.0.tiers.0.specialConditionText"]);

  const longTerms = { ...base, offers: [{ ...base.offers[0], termsText: "x".repeat(MAX_SPECIAL_CONDITION_LENGTH + 1) }] };
  assert.ok(validateProductForm(longTerms)["offers.0.termsText"]);
});

test("validateProductForm rejects non-HTTPS sources, duplicate capture months and missing identity", () => {
  const base = validForm();

  assert.equal(validateProductForm(validForm({ accountId: "" })).accountId, undefined);
  assert.ok(validateProductForm(validForm({ accountId: "0" })).accountId);
  assert.ok(validateProductForm(validForm({ name: "  " })).name);

  const http = { ...base, offers: [{ ...base.offers[0], sourceUrl: "http://example.com" }] };
  assert.ok(validateProductForm(http)["offers.0.sourceUrl"]);

  const duplicate = { ...base, offers: [base.offers[0], { ...base.offers[0] }] };
  assert.ok(validateProductForm(duplicate)["offers.1.capturedForMonth"]);

  const missingLabel = { ...base, offers: [{ ...base.offers[0], sourceLabel: " " }] };
  assert.ok(validateProductForm(missingLabel)["offers.0.sourceLabel"]);
});

test("toProductPayload trims text, coerces numbers and keeps optional text null when blank", () => {
  const payload = toProductPayload(validForm());

  assert.equal(payload.accountId, 7);
  assert.equal(payload.institution, "nu");
  assert.equal(payload.offers[0].sourceLabel, "Sitio oficial");
  assert.equal(payload.offers[0].termsText, null);
  assert.deepEqual(payload.offers[0].tiers, [
    { minimumAmount: 0, maximumAmount: null, annualRatePercent: 7.5, specialConditionText: null }
  ]);

  const base = validForm();
  const withCondition = toProductPayload({
    ...base,
    offers: [
      {
        ...base.offers[0],
        termsText: "  Campaña vigente  ",
        tiers: [{ minimumAmount: "0", maximumAmount: "25000", annualRatePercent: "15", specialConditionText: "  Gasto mínimo 1000  " }]
      }
    ]
  });
  assert.equal(withCondition.offers[0].termsText, "Campaña vigente");
  assert.equal(withCondition.offers[0].tiers[0].specialConditionText, "Gasto mínimo 1000");
  assert.equal(withCondition.offers[0].tiers[0].maximumAmount, 25000);
});

test("emptyProductForm and emptyOffer start from the operating month with one usable tier", () => {
  const form = emptyProductForm("2026-09");

  assert.equal(form.institution, "");
  assert.equal(form.offers.length, 1);
  assert.equal(form.offers[0].capturedForMonth, "2026-09");
  assert.equal(form.offers[0].conditionsConfirmed, false);
  assert.deepEqual(emptyOffer("2026-09").tiers, [{ minimumAmount: "0", maximumAmount: "", annualRatePercent: "", specialConditionText: "" }]);
});

test("form validation supplies Spanish guidance without changing payload semantics", () => {
  const errors = validateProductForm(emptyProductForm("2026-09"));
  assert.equal(errors.accountId, undefined);
  assert.equal(errors.name, "El nombre del producto es obligatorio.");
  assert.equal(errors.institution, "Selecciona una institución del catálogo.");
  assert.equal(errors["offers.0.sourceUrl"], "Indica una URL de origen con HTTPS.");
  assert.equal(errors["offers.0.validity"], "Indica fechas de inicio y fin válidas.");
});


test("optional link sends null, never a fabricated zero account", () => {
  assert.equal(toProductPayload(validForm({ accountId: "" })).accountId, null);
  for (const accountId of ["0", "-1", "1.5", "invalid", "9007199254740992"]) {
    assert.ok(validateProductForm(validForm({ accountId })).accountId);
  }
});

test("link choices require active cash interest accounts and exclude occupied active links", () => {
  const base = { accountId: 7, active: true, isCredit: false, earnsInterest: true };
  const accounts = [base, { ...base, accountId: 8, active: false },
    { ...base, accountId: 9, isCredit: true }, { ...base, accountId: 10, earnsInterest: false },
    { ...base, accountId: 11 }];
  const products = [{ investmentProductId: 1, accountId: 7, active: true },
    { investmentProductId: 2, accountId: 11, active: false },
    { investmentProductId: 3, accountId: null, active: true }];
  assert.deepEqual(eligibleLinkAccounts(accounts, products, null).map((a) => a.accountId), [11]);
  assert.deepEqual(eligibleLinkAccounts(accounts, products, 1).map((a) => a.accountId), [7, 11]);
  assert.deepEqual(eligibleLinkAccounts(accounts, products, null, false).map((a) => a.accountId), [7, 11]);
});
