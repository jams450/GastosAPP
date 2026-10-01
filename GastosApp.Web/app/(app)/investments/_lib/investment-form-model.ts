/**
 * Pure form model for the investment product catalog.
 *
 * Self-contained on purpose (no runtime imports, no `@/` alias) so the rules that decide what the
 * user may send are testable with `node --experimental-strip-types`: the canonical marginal tier
 * schedule and the institution catalog. Money/percentages travel as strings in the form (an input
 * value is always text) and are converted only at payload time.
 */

/**
 * The seven allowed institution codes, mirroring
 * `GastosApp.BusinessLogic/Models/Investments/InvestmentInstitutions.cs`,
 * `lib/contracts/investment-institutions.ts` and the PostgreSQL CHECK
 * `ck_investment_products_institution`. Free text is rejected here and on the server.
 */
const INSTITUTION_CODES: ReadonlySet<string> = new Set([
  "revolut",
  "cetes",
  "nu",
  "klar",
  "finsus",
  "didi",
  "mercado_libre"
]);

export function isAllowedInstitution(value: unknown): boolean {
  return typeof value === "string" && INSTITUTION_CODES.has(value);
}

export type TierFormValue = {
  minimumAmount: string;
  maximumAmount: string;
  annualRatePercent: string;
  specialConditionText: string;
};

export type OfferFormValue = {
  capturedForMonth: string;
  validFrom: string;
  validTo: string;
  sourceUrl: string;
  sourceLabel: string;
  termsText: string;
  conditionsConfirmed: boolean;
  tiers: TierFormValue[];
};

export type ProductFormValues = {
  accountId: string;
  name: string;
  institution: string;
  active: boolean;
  offers: OfferFormValue[];
};

export type ProductFormErrors = Record<string, string>;

export const MAX_SPECIAL_CONDITION_LENGTH = 1000;
export const MAX_SOURCE_LABEL_LENGTH = 120;
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export type TierPayload = {
  minimumAmount: number;
  maximumAmount: number | null;
  annualRatePercent: number;
  specialConditionText: string | null;
};

export type OfferPayload = {
  capturedForMonth: string;
  validFrom: string;
  validTo: string | null;
  sourceUrl: string;
  sourceLabel: string;
  termsText: string | null;
  conditionsConfirmed: boolean;
  tiers: TierPayload[];
};

export type ProductPayload = {
  accountId: number | null;
  name: string;
  institution: string;
  active: boolean;
  offers: OfferPayload[];
};

export function emptyTier(): TierFormValue {
  return { minimumAmount: "0", maximumAmount: "", annualRatePercent: "", specialConditionText: "" };
}

export function emptyOffer(capturedForMonth: string): OfferFormValue {
  return {
    capturedForMonth,
    validFrom: "",
    validTo: "",
    sourceUrl: "",
    sourceLabel: "",
    termsText: "",
    conditionsConfirmed: false,
    tiers: [emptyTier()]
  };
}

export function emptyProductForm(capturedForMonth: string): ProductFormValues {
  return { accountId: "", name: "", institution: "", active: true, offers: [emptyOffer(capturedForMonth)] };
}

/** Last day of the capture year, used as the displayed inferred validity instead of an empty end date. */
export function inferredValidTo(capturedForMonth: string): string | null {
  return MONTH_PATTERN.test(capturedForMonth) ? `${capturedForMonth.slice(0, 4)}-12-31` : null;
}

/**
 * Validates the whole form. Returns a map keyed by field path; an empty map means the form may be sent.
 * The institution must be one of the seven catalog codes: free text is rejected here and on the server.
 */
export function validateProductForm(form: ProductFormValues): ProductFormErrors {
  const errors: ProductFormErrors = {};

  if (form.accountId !== "" && (!/^\d+$/.test(form.accountId) || !Number.isSafeInteger(Number(form.accountId)) || Number(form.accountId) <= 0)) errors.accountId = "Selecciona una cuenta elegible.";
  if (!form.name.trim()) errors.name = "El nombre del producto es obligatorio.";
  if (form.name.trim().length > 120) errors.name = "El nombre del producto no puede superar los 120 caracteres.";
  if (!isAllowedInstitution(form.institution)) errors.institution = "Selecciona una institución del catálogo.";
  if (!form.offers.length) errors.offers = "Agrega al menos una oferta.";

  const months = new Set<string>();
  form.offers.forEach((offer, offerIndex) => {
    const prefix = `offers.${offerIndex}`;

    if (!MONTH_PATTERN.test(offer.capturedForMonth)) {
      errors[`${prefix}.capturedForMonth`] = "Selecciona el mes de captura.";
    } else if (months.has(offer.capturedForMonth)) {
      errors[`${prefix}.capturedForMonth`] = "El mes de captura no se puede repetir.";
    } else {
      months.add(offer.capturedForMonth);
    }

    // A blank end date is allowed: the server infers December 31 of the capture year and flags it.
    const effectiveValidTo = offer.validTo || inferredValidTo(offer.capturedForMonth) || "";
    if (!offer.validFrom || !effectiveValidTo || effectiveValidTo < offer.validFrom) {
      errors[`${prefix}.validity`] = "Indica fechas de inicio y fin válidas.";
    }

    try {
      const url = new URL(offer.sourceUrl.trim());
      if (url.protocol !== "https:") throw new Error();
    } catch {
      errors[`${prefix}.sourceUrl`] = "Indica una URL de origen con HTTPS.";
    }

    if (!offer.sourceLabel.trim()) errors[`${prefix}.sourceLabel`] = "El nombre de la fuente es obligatorio.";
    else if (offer.sourceLabel.trim().length > MAX_SOURCE_LABEL_LENGTH) errors[`${prefix}.sourceLabel`] = `El nombre de la fuente no puede superar los ${MAX_SOURCE_LABEL_LENGTH} caracteres.`;

    if (offer.termsText.trim().length > MAX_SPECIAL_CONDITION_LENGTH) errors[`${prefix}.termsText`] = `Los términos no pueden superar los ${MAX_SPECIAL_CONDITION_LENGTH} caracteres.`;

    if (!offer.tiers.length) errors[`${prefix}.tiers`] = "Agrega al menos un tramo marginal.";

    let expectedMinimum = 0;
    offer.tiers.forEach((tier, tierIndex) => {
      const tierPrefix = `${prefix}.tiers.${tierIndex}`;
      const minimum = Number(tier.minimumAmount);
      const maximum = tier.maximumAmount === "" ? null : Number(tier.maximumAmount);
      const rate = Number(tier.annualRatePercent);

      if (!Number.isFinite(minimum) || minimum !== expectedMinimum || minimum < 0) errors[`${tierPrefix}.minimumAmount`] = `Debe ser igual a ${expectedMinimum}.`;
      if (!Number.isFinite(rate) || rate < 0) errors[`${tierPrefix}.annualRatePercent`] = "Indica una tasa anual mayor o igual a cero.";

      if (maximum === null) {
        if (tierIndex !== offer.tiers.length - 1) errors[`${tierPrefix}.maximumAmount`] = "Solo el último tramo puede ser ilimitado.";
      } else if (!Number.isFinite(maximum) || maximum <= minimum) {
        errors[`${tierPrefix}.maximumAmount`] = "El máximo debe ser mayor que el mínimo.";
      }

      if (tier.specialConditionText.trim().length > MAX_SPECIAL_CONDITION_LENGTH) errors[`${tierPrefix}.specialConditionText`] = `La condición no puede superar los ${MAX_SPECIAL_CONDITION_LENGTH} caracteres.`;

      if (maximum !== null && Number.isFinite(maximum)) expectedMinimum = maximum;
    });

    if (offer.tiers.at(-1)?.maximumAmount !== "") errors[`${prefix}.tiers`] = "El último tramo debe ser ilimitado.";
  });

  return errors;
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Converts the form into the API payload. A blank validity end stays `null` so the server can infer it. */
export function toProductPayload(form: ProductFormValues): ProductPayload {
  return {
    accountId: form.accountId === "" ? null : Number(form.accountId),
    name: form.name.trim(),
    institution: form.institution,
    active: form.active,
    offers: form.offers.map((offer) => ({
      capturedForMonth: offer.capturedForMonth,
      validFrom: offer.validFrom,
      validTo: offer.validTo || null,
      sourceUrl: offer.sourceUrl.trim(),
      sourceLabel: offer.sourceLabel.trim(),
      termsText: optionalText(offer.termsText),
      conditionsConfirmed: offer.conditionsConfirmed,
      tiers: offer.tiers.map((tier) => ({
        minimumAmount: Number(tier.minimumAmount),
        maximumAmount: tier.maximumAmount === "" ? null : Number(tier.maximumAmount),
        annualRatePercent: Number(tier.annualRatePercent),
        specialConditionText: optionalText(tier.specialConditionText)
      }))
    }))
  };
}

/** Filter normalized user-scoped account payloads; the API remains authoritative for ownership. */
export function eligibleLinkAccounts<T extends { accountId: number; active: boolean; isCredit: boolean; earnsInterest: boolean }>(
  accounts: ReadonlyArray<T>,
  products: ReadonlyArray<{ investmentProductId: number; accountId: number | null; active: boolean }>,
  productId: number | null,
  active = true
): T[] {
  return accounts.filter((account) => account.active && !account.isCredit && account.earnsInterest &&
    (!active || !products.some((product) => product.active && product.accountId === account.accountId && product.investmentProductId !== productId)));
}
