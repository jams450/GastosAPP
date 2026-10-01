/**
 * Institution catalog for fixed-income V1.
 *
 * This module is intentionally self-contained: no imports, no side effects. That keeps it usable from
 * both the Next.js bundle and the `node --experimental-strip-types` unit tests. The list mirrors the
 * `revolut, cetes, nu, klar, finsus, didi, mercado_libre` catalog enforced by the API and by the
 * PostgreSQL CHECK constraint `ck_investment_products_institution`; keep the ordering in sync.
 */

export const INVESTMENT_INSTITUTIONS = [
  { code: "revolut", label: "Revolut" },
  { code: "cetes", label: "CETES" },
  { code: "nu", label: "Nu" },
  { code: "klar", label: "Klar" },
  { code: "finsus", label: "Finsus" },
  { code: "didi", label: "DiDi" },
  { code: "mercado_libre", label: "Mercado Libre" }
] as const;

export type InvestmentInstitutionCode = (typeof INVESTMENT_INSTITUTIONS)[number]["code"];

const INSTITUTION_CODES: ReadonlySet<string> = new Set(INVESTMENT_INSTITUTIONS.map((institution) => institution.code));

export function isInvestmentInstitutionCode(value: unknown): value is InvestmentInstitutionCode {
  return typeof value === "string" && INSTITUTION_CODES.has(value);
}

/** Label for a canonical code. An unknown code keeps its raw text instead of disappearing. */
export function institutionLabel(code: string | null | undefined): string {
  if (!code) return "";
  return INVESTMENT_INSTITUTIONS.find((institution) => institution.code === code)?.label ?? code;
}
