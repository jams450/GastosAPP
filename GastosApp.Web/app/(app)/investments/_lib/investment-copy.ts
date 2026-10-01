/** Frontend-only translations: machine codes and stored user text remain unchanged. */
export const EXCLUSION_REASON_COPY: Record<string, string> = {
  unlinked_account: "El producto no tiene una cuenta vinculada.",
  missing_account: "La cuenta vinculada no existe o no está disponible.",
  foreign_account: "La cuenta vinculada no pertenece al usuario del producto.",
  inactive_account: "La cuenta vinculada está inactiva.",
  credit_account: "La cuenta vinculada es de crédito.",
  non_interest_account: "La cuenta vinculada no genera intereses.",
  inactive_product: "El producto está inactivo.",
  unsupported_institution: "La institución no pertenece al catálogo disponible.",
  no_offer_for_month: "El producto no tiene ofertas registradas.",
  offer_not_captured_for_month: "No hay una oferta capturada para el mes del plan.",
  validity_not_covering_month: "La vigencia de la oferta no cubre el mes del plan.",
  conditions_not_confirmed: "Las condiciones de la oferta no están confirmadas.",
  invalid_or_missing_tiers: "Los tramos marginales faltan o no son válidos."
};

export function exclusionReasonLabel(reason: string): string {
  return EXCLUSION_REASON_COPY[reason] ?? "El producto fue excluido. Revisa su oferta y sus condiciones.";
}

const SERVER_ERROR_COPY: Record<string, string> = {
  "Account not found or not accessible.": "La cuenta no existe o no tienes acceso a ella.",
  "Investment products require an active non-credit interest-bearing account.": "Selecciona una cuenta activa, sin crédito y que genere intereses.",
  "An active investment product already links this account.": "Esta cuenta ya está vinculada a un producto de inversión activo.",
  "Product requires at least one offer.": "Agrega al menos una oferta al producto.",
  "Each offer must use a different captured month.": "El mes de captura no se puede repetir entre ofertas.",
  "Offer validity is required.": "Indica una vigencia válida para la oferta.",
  "Condition text cannot exceed 1000 characters.": "La condición no puede superar los 1000 caracteres.",
  "Product name is required and cannot exceed 120 characters.": "Indica un nombre de producto de hasta 120 caracteres.",
  "Source label is required and cannot exceed 120 characters.": "Indica un nombre de fuente de hasta 120 caracteres.",
  "sourceUrl must be an HTTPS URL.": "La URL de la fuente debe utilizar HTTPS.",
  "projectionMonths must be between 1 and 24.": "El horizonte de proyección debe estar entre 1 y 24 meses.",
  "Month must use yyyy-MM format.": "Selecciona un mes válido.",
  "No active investment products exist.": "No hay productos de inversión activos.",
  "A marginal rate schedule requires at least one tier.": "Agrega al menos un tramo marginal.",
  "The first marginal rate tier must start at 0.": "El primer tramo marginal debe comenzar en cero.",
  "Marginal rate tiers cannot have a negative annual rate.": "La tasa anual no puede ser negativa.",
  "The unbounded marginal rate tier must be the final tier.": "Solo el último tramo puede ser ilimitado.",
  "Each bounded marginal rate tier must have a maximum greater than its minimum.": "El máximo de cada tramo debe ser mayor que el mínimo.",
  "A marginal rate schedule must end with exactly one unbounded tier.": "El último tramo debe ser ilimitado.",
  "Marginal rate tiers must be contiguous without gaps or overlaps.": "Los tramos deben ser consecutivos, sin huecos ni solapamientos."
};

/** Unknown server/network messages use a Spanish fallback rather than leaking raw English copy. */
export function investmentErrorMessage(reason: unknown, fallback: string): string {
  const message = reason instanceof Error ? reason.message : "";
  if (SERVER_ERROR_COPY[message]) return SERVER_ERROR_COPY[message];
  if (message.startsWith("No investment product is eligible for ")) return "Ningún producto cumple los requisitos para este mes. Revisa las ofertas, la vigencia y las confirmaciones.";
  return fallback;
}
