/**
 * Pure presentation helpers for the investments screen.
 *
 * Self-contained on purpose (no runtime imports, no `@/` alias) so the state machine that decides
 * whether the user may generate a plan is testable with `node --experimental-strip-types`. The local
 * types below mirror the shapes produced by `normalizePlan`.
 */

export type OfferFreshness = "current" | "stale" | "missing" | "inactive";

export const OFFER_FRESHNESS_COPY: Record<OfferFreshness, string> = {
  current: "Capturada para este mes",
  stale: "Capturada en un mes anterior — actualiza antes de generar",
  missing: "Aún no hay una oferta registrada",
  inactive: "El producto está inactivo"
};

export type PlanStateInput = {
  isPersisted: boolean;
  planMonth: string;
  carriedFromPlanMonth: string | null;
};

export type AllocationStateInput = {
  productName: string;
  offerFreshness: OfferFreshness | null;
  tiers: ReadonlyArray<{ investmentRateTierId: number; specialConditionText: string }>;
};

/** A draft must never be presented as if it were the persisted month plan. */
export function planStateLabel(plan: PlanStateInput): string {
  if (plan.isPersisted) return `Plan generado para ${plan.planMonth}`;
  if (plan.carriedFromPlanMonth) return `Borrador para ${plan.planMonth} basado en ${plan.carriedFromPlanMonth} — actualiza antes de generar`;
  return `Borrador para ${plan.planMonth} — aún no generado`;
}

/** Freshness of an offer, treating an absent value as unknown rather than current. */
export function allocationFreshness(allocation: Pick<AllocationStateInput, "offerFreshness">): OfferFreshness | null {
  return allocation.offerFreshness;
}

/**
 * Fail-closed: a missing or unrecognized freshness state blocks generation, because the server only
 * ever emits a known state for a draft, so `null` means the payload was not understood.
 */
export function isOfferStale(allocation: Pick<AllocationStateInput, "offerFreshness">): boolean {
  return allocation.offerFreshness !== "current";
}

export type GenerationGate = {
  canGenerate: boolean;
  /** Human-readable blockers, in the order they must be resolved. */
  blockers: string[];
};

/**
 * Decides whether the "Generate" action is available for a draft. Generation requires every declared
 * special condition explicitly confirmed — exactly what the server enforces — so keeping the same rule
 * here avoids sending a request that must fail. A draft only ever lists allocations whose offer is
 * current for the target month, so a freshness state other than `current` (or an unknown one) means the
 * payload was not understood and fails closed.
 */
export function resolveGenerationGate(
  plan: { isPersisted: boolean; allocations: ReadonlyArray<AllocationStateInput> },
  confirmedTierIds: ReadonlySet<number>
): GenerationGate {
  if (plan.isPersisted) return { canGenerate: true, blockers: [] };

  const blockers: string[] = [];
  if (!plan.allocations.length) blockers.push("Ningún producto cumple los requisitos para este mes.");

  for (const allocation of plan.allocations) {
    if (isOfferStale(allocation)) {
      const reason = allocation.offerFreshness ? OFFER_FRESHNESS_COPY[allocation.offerFreshness] : "estado de la oferta desconocido";
      blockers.push(`${allocation.productName}: ${reason}.`);
      continue;
    }

    for (const tier of allocation.tiers) {
      if (tier.specialConditionText.trim().length > 0 && !confirmedTierIds.has(tier.investmentRateTierId)) {
        blockers.push(`${allocation.productName}: confirma "${tier.specialConditionText.trim()}".`);
      }
    }
  }

  return { canGenerate: blockers.length === 0, blockers };
}

/** Short summary of the exclusion count for a heading. */
export function exclusionSummary(exclusions: ReadonlyArray<unknown>): string {
  if (!exclusions.length) return "No hay productos excluidos.";
  return `${exclusions.length} producto${exclusions.length === 1 ? " excluido" : "s excluidos"}`;
}

// ---------------------------------------------------------------------------------------------
// Per-tier condition confirmations
// ---------------------------------------------------------------------------------------------

export type ConditionCatalogTier = {
  investmentRateTierId: number;
  minimumAmount: number;
  maximumAmount: number | null;
  annualRatePercent: number;
  specialConditionText: string;
};

export type ConditionCatalogOffer = {
  capturedForMonth: string;
  tiers: ReadonlyArray<ConditionCatalogTier>;
};

export type ConditionCatalogProduct = {
  investmentProductId: number;
  name: string;
  active: boolean;
  offers: ReadonlyArray<ConditionCatalogOffer>;
};

/** One tier that declares condition text and therefore needs an explicit attestation to be allocated. */
export type ConditionCandidate = {
  investmentProductId: number;
  productName: string;
  investmentRateTierId: number;
  minimumAmount: number;
  maximumAmount: number | null;
  annualRatePercent: number;
  specialConditionText: string;
};

/**
 * Every tier that declares special condition text on an offer captured for the plan month.
 *
 * Built from the catalog, not from the plan, for two reasons: the server only ever attests the exact
 * tier id of the offer captured for the target month, and a product that was excluded (for example
 * because its condition was still unconfirmed) must stay confirmable instead of becoming a dead end.
 * A tier without condition text never asks for a confirmation.
 */
export function conditionCandidates(products: ReadonlyArray<ConditionCatalogProduct>, planMonth: string): ConditionCandidate[] {
  const candidates: ConditionCandidate[] = [];

  for (const product of products) {
    if (!product.active) continue;

    const offer = product.offers.find((candidate) => candidate.capturedForMonth === planMonth);
    if (!offer) continue;

    for (const tier of offer.tiers) {
      const text = tier.specialConditionText.trim();
      if (!text) continue;
      if (!Number.isInteger(tier.investmentRateTierId) || tier.investmentRateTierId <= 0) continue;

      candidates.push({
        investmentProductId: product.investmentProductId,
        productName: product.name,
        investmentRateTierId: tier.investmentRateTierId,
        minimumAmount: tier.minimumAmount,
        maximumAmount: tier.maximumAmount,
        annualRatePercent: tier.annualRatePercent,
        specialConditionText: text
      });
    }
  }

  return candidates;
}

/**
 * Confirmations the loaded plan already recorded, read from the allocation tier snapshots (a persisted
 * plan stores the accepted condition and its confirmation flag together). Pre-seeding the client state
 * with these ids is what keeps regenerating from silently moving every condition-bearing product into
 * `conditions_not_confirmed`. A plan with no allocation tier snapshot (a draft, or a plan whose tiers
 * were replaced in the catalog) yields no ids, so nothing is ever assumed.
 */
export function priorConfirmedTierIds(
  plan: { allocations: ReadonlyArray<{ tiers: ReadonlyArray<{ investmentRateTierId: number; specialConditionText: string; conditionConfirmed: boolean }> }> } | null
): Set<number> {
  const confirmed = new Set<number>();
  if (!plan) return confirmed;

  for (const allocation of plan.allocations) {
    for (const tier of allocation.tiers) {
      if (!tier.conditionConfirmed) continue;
      if (!tier.specialConditionText.trim()) continue;
      if (!Number.isInteger(tier.investmentRateTierId) || tier.investmentRateTierId <= 0) continue;
      confirmed.add(tier.investmentRateTierId);
    }
  }

  return confirmed;
}

/**
 * Exactly the ids to send with a generation request: the selected candidates for the plan month.
 * Scoping to the candidate list — which is derived from the offers captured for that month — is what
 * keeps a stale id from a previous month (or from an offer that no longer exists) out of the payload.
 */
export function confirmedTierIdsForGeneration(candidates: ReadonlyArray<ConditionCandidate>, selected: ReadonlySet<number>): number[] {
  return candidates.filter((candidate) => selected.has(candidate.investmentRateTierId)).map((candidate) => candidate.investmentRateTierId);
}

/**
 * Accessible label for one confirmation control: it names the product, the exact tier interval and rate
 * and the literal condition text, so the control is never an icon-only or ambiguous affordance.
 */
export function conditionCandidateLabel(candidate: ConditionCandidate): string {
  const interval = candidate.maximumAmount === null ? `${candidate.minimumAmount}+` : `${candidate.minimumAmount}-${candidate.maximumAmount}`;
  return `Confirmar "${candidate.specialConditionText}" para ${candidate.productName}, tramo ${interval} al ${candidate.annualRatePercent}%`;
}
