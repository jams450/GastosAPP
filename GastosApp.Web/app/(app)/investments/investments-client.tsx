"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Account } from "@/lib/contracts/accounts";
import { normalizeAccounts } from "@/lib/contracts/accounts";
import { INVESTMENT_INSTITUTIONS, institutionLabel } from "@/lib/contracts/investment-institutions";
import {
  normalizePlan,
  normalizeProducts,
  normalizePlanProjection,
  type InvestmentPlan,
  type InvestmentProduct,
  type InvestmentPlanProjection
} from "@/lib/contracts/investments";
import { parseApiError } from "@/lib/bff/client-session";
import { csrfFetch } from "@/lib/security/csrf-client";
import {
  emptyOffer,
  emptyProductForm,
  inferredValidTo,
  toProductPayload,
  validateProductForm,
  type OfferFormValue,
  type ProductFormErrors,
  type ProductFormValues
} from "./_lib/investment-form-model";
import {
  conditionCandidateLabel,
  conditionCandidates,
  confirmedTierIdsForGeneration,
  exclusionSummary,
  OFFER_FRESHNESS_COPY,
  planStateLabel,
  priorConfirmedTierIds,
  resolveGenerationGate
} from "./_lib/investments-ui";

/** Operating month for the UI, resolved with the same America/Mexico_City anchor the API uses. */
function currentMonthKey(): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).formatToParts(new Date());
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    if (year && month) return `${year}-${month}`;
  } catch {
    /* fall through to the UTC month */
  }
  return new Date().toISOString().slice(0, 7);
}

type OfferDraft = OfferFormValue;
type ProductDraft = ProductFormValues;

export function InvestmentsClient() {
  const month = useMemo(currentMonthKey, []);
  const [products, setProducts] = useState<InvestmentProduct[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [plan, setPlan] = useState<InvestmentPlan | null>(null);
  const [projection, setProjection] = useState<InvestmentPlanProjection | null>(null);
  const [form, setForm] = useState<ProductDraft | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirmedTierIds, setConfirmedTierIds] = useState<Set<number>>(new Set());

  const eligibleAccounts = useMemo(() => accounts.filter((account) => account.active && !account.isCredit), [accounts]);

  /**
   * Condition tiers that need an explicit attestation for this month. Derived from the catalog rather
   * than from the plan so a tier stays confirmable even after its product was excluded (for example for
   * a missing confirmation), and scoped to the month's capture so a stale tier id is never sent.
   */
  const conditionTiers = useMemo(() => conditionCandidates(products, month), [products, month]);

  const loadPlan = useCallback(async () => {
    const response = await fetch(`/api/bff/investments/plans/current?planMonth=${month}`, { cache: "no-store" });
    if (response.status === 404) {
      setPlan(null);
      setProjection(null);
      setConfirmedTierIds(new Set());
      return;
    }
    if (!response.ok) throw await parseApiError(response, "Unable to load the monthly plan.");

    const parsed = normalizePlan(await response.json());
    setPlan(parsed);
    // Regenerating must not lose an attestation already granted: a persisted plan records the accepted
    // condition and its confirmation in the allocation snapshot, so they are pre-checked from there.
    setConfirmedTierIds(priorConfirmedTierIds(parsed));

    // The persisted plan stores its series behind the projection endpoint; the detail contract has none.
    if (parsed?.isPersisted && parsed.investmentPlanId > 0) {
      const projected = await fetch(`/api/bff/investments/plans/${parsed.investmentPlanId}/projection`, { cache: "no-store" });
      setProjection(projected.ok ? normalizePlanProjection(await projected.json()) : null);
    } else {
      setProjection(null);
    }
  }, [month]);

  const load = useCallback(async () => {
    const [productsResponse, accountsResponse] = await Promise.all([
      fetch("/api/bff/investments/products", { cache: "no-store" }),
      fetch("/api/bff/accounts", { cache: "no-store" })
    ]);

    if (!productsResponse.ok) throw await parseApiError(productsResponse, "Unable to load investment products.");
    if (!accountsResponse.ok) throw await parseApiError(accountsResponse, "Unable to load accounts.");

    setProducts(normalizeProducts(await productsResponse.json()));
    setAccounts(normalizeAccounts(await accountsResponse.json()));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([load(), loadPlan()]);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Unable to load investments.");
      }
    })();
  }, [load, loadPlan]);

  function edit(product: InvestmentProduct) {
    setEditingId(product.investmentProductId);
    setForm({
      accountId: String(product.accountId),
      name: product.name,
      institution: product.institution,
      active: product.active,
      offers: product.offers.map((offer) => ({
        capturedForMonth: offer.capturedForMonth,
        validFrom: offer.validFrom,
        validTo: offer.validityInferred ? "" : offer.validTo,
        sourceUrl: offer.sourceUrl,
        sourceLabel: offer.sourceLabel,
        termsText: offer.termsText,
        conditionsConfirmed: offer.conditionsConfirmed,
        tiers: offer.tiers.map((tier) => ({
          minimumAmount: String(tier.minimumAmount),
          maximumAmount: tier.maximumAmount === null ? "" : String(tier.maximumAmount),
          annualRatePercent: String(tier.annualRatePercent),
          specialConditionText: tier.specialConditionText
        }))
      }))
    });
    setErrors({});
    setError(null);
  }

  async function save() {
    if (!form) return;
    const nextErrors = validateProductForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    setError(null);
    try {
      const response = await csrfFetch(editingId ? `/api/bff/investments/products/${editingId}` : "/api/bff/investments/products", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toProductPayload(form))
      });
      if (!response.ok) throw await parseApiError(response, "Unable to save investment product.");
      await Promise.all([load(), loadPlan()]);
      setForm(null);
      setEditingId(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save investment product.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(product: InvestmentProduct) {
    setError(null);
    try {
      const response = await csrfFetch(`/api/bff/investments/products/${product.investmentProductId}/active`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !product.active })
      });
      if (!response.ok) throw await parseApiError(response, "Unable to update product status.");
      await Promise.all([load(), loadPlan()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update product status.");
    }
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const response = await csrfFetch("/api/bff/investments/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planMonth: month,
          projectionMonths: 12,
          // Only the tiers declared by this month's offers that are actually confirmed: an id from any
          // other month or from an offer that no longer exists is never sent, and an unconfirmed tier is
          // left out so the server reports it as `conditions_not_confirmed` instead of allocating it.
          confirmedTierIds: confirmedTierIdsForGeneration(conditionTiers, confirmedTierIds)
        })
      });
      if (!response.ok) throw await parseApiError(response, "Unable to generate the plan.");
      await loadPlan();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to generate the plan.");
    } finally {
      setGenerating(false);
    }
  }

  const gate = plan ? resolveGenerationGate(plan, confirmedTierIds) : { canGenerate: false, blockers: [] };
  const changeOffer = (index: number, patch: Partial<OfferDraft>) =>
    setForm((current) => current && { ...current, offers: current.offers.map((offer, i) => (i === index ? { ...offer, ...patch } : offer)) });
  const changeTier = (offerIndex: number, tierIndex: number, patch: Partial<OfferDraft["tiers"][number]>) =>
    setForm((current) =>
      current && {
        ...current,
        offers: current.offers.map((offer, i) =>
          i === offerIndex ? { ...offer, tiers: offer.tiers.map((tier, j) => (j === tierIndex ? { ...tier, ...patch } : tier)) } : offer
        )
      }
    );

  function toggleTierConfirmation(tierId: number, checked: boolean) {
    setConfirmedTierIds((current) => {
      const next = new Set(current);
      if (checked) next.add(tierId);
      else next.delete(tierId);
      return next;
    });
  }

  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm text-muted">Fixed income</p>
        <h1 className="text-2xl font-bold">Investments</h1>
        <p className="text-muted">
          Record verified offer snapshots to generate scenarios. This catalog never moves money or changes account balances, and it never
          invents a rate: every number below is text you entered.
        </p>
      </header>

      {error ? <Alert variant="danger">{error}</Alert> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Product catalog</h2>
        <Button
          type="button"
          onClick={() => {
            setForm(emptyProductForm(month));
            setEditingId(null);
            setErrors({});
            setError(null);
          }}
        >
          Add product
        </Button>
      </div>

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Investment products</caption>
          <thead>
            <tr className="border-b">
              <th className="p-3">Product</th>
              <th className="p-3">Institution</th>
              <th className="p-3">Account</th>
              <th className="p-3">Status</th>
              <th className="p-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.investmentProductId} className="border-b last:border-0">
                <td className="p-3">{product.name}</td>
                <td className="p-3">{product.institutionLabel || institutionLabel(product.institution)}</td>
                <td className="p-3">
                  {product.accountName ?? accounts.find((account) => account.accountId === product.accountId)?.name ?? `Account ${product.accountId}`}
                </td>
                <td className="p-3">{product.active ? "Active" : "Inactive"}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" className="h-8 px-3 text-xs" onClick={() => edit(product)}>
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant={product.active ? "danger" : "secondary"}
                      className="h-8 px-3 text-xs"
                      onClick={() => void toggleActive(product)}
                    >
                      {product.active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!products.length ? (
              <tr>
                <td colSpan={5} className="p-4 text-muted">
                  No products configured.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {form ? (
        <section className="rounded border p-4" aria-labelledby="product-form-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="product-form-title" className="font-semibold">
              {editingId ? "Edit product" : "New product"}
            </h2>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setForm(null);
                setEditingId(null);
              }}
            >
              Cancel
            </Button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Product name" error={errors.name}>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} aria-invalid={Boolean(errors.name)} />
            </Field>
            <Field label="Institution" error={errors.institution}>
              <select
                value={form.institution}
                onChange={(event) => setForm({ ...form, institution: event.target.value })}
                aria-invalid={Boolean(errors.institution)}
              >
                <option value="">Select institution</option>
                {INVESTMENT_INSTITUTIONS.map((institution) => (
                  <option key={institution.code} value={institution.code}>
                    {institution.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Eligible account" error={errors.accountId}>
              <select
                value={form.accountId}
                disabled={editingId !== null}
                onChange={(event) => setForm({ ...form, accountId: event.target.value })}
                aria-invalid={Boolean(errors.accountId)}
              >
                <option value="">Select account</option>
                {eligibleAccounts.map((account) => (
                  <option key={account.accountId} value={account.accountId}>
                    {account.name}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 self-end">
              <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
              Active product
            </label>
          </div>

          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Offers</h3>
              <Button
                type="button"
                variant="secondary"
                className="h-8 px-3 text-xs"
                onClick={() => setForm({ ...form, offers: [...form.offers, emptyOffer(month)] })}
              >
                Add offer
              </Button>
            </div>
            {errors.offers ? <p className="text-sm text-red-600">{errors.offers}</p> : null}

            {form.offers.map((offer, offerIndex) => (
              <fieldset key={offerIndex} className="space-y-4 border p-4">
                <legend className="px-1 font-medium">Offer {offerIndex + 1}</legend>
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Capture month" error={errors[`offers.${offerIndex}.capturedForMonth`]}>
                    <input
                      type="month"
                      value={offer.capturedForMonth}
                      onChange={(event) => changeOffer(offerIndex, { capturedForMonth: event.target.value })}
                    />
                  </Field>
                  <Field label="Valid from">
                    <input type="date" value={offer.validFrom} onChange={(event) => changeOffer(offerIndex, { validFrom: event.target.value })} />
                  </Field>
                  <Field label="Valid to (blank = Dec 31 of capture year)" error={errors[`offers.${offerIndex}.validity`]}>
                    <input
                      type="date"
                      value={offer.validTo}
                      placeholder={inferredValidTo(offer.capturedForMonth) ?? ""}
                      onChange={(event) => changeOffer(offerIndex, { validTo: event.target.value })}
                    />
                  </Field>
                  <Field label="Source label" error={errors[`offers.${offerIndex}.sourceLabel`]}>
                    <input value={offer.sourceLabel} onChange={(event) => changeOffer(offerIndex, { sourceLabel: event.target.value })} />
                  </Field>
                  <Field label="HTTPS source URL" error={errors[`offers.${offerIndex}.sourceUrl`]}>
                    <input type="url" value={offer.sourceUrl} onChange={(event) => changeOffer(offerIndex, { sourceUrl: event.target.value })} />
                  </Field>
                  <Field label="Terms text (optional)" error={errors[`offers.${offerIndex}.termsText`]}>
                    <textarea
                      rows={2}
                      value={offer.termsText}
                      maxLength={1000}
                      onChange={(event) => changeOffer(offerIndex, { termsText: event.target.value })}
                    />
                  </Field>
                  <label className="flex items-center gap-2 self-end">
                    <input
                      type="checkbox"
                      checked={offer.conditionsConfirmed}
                      onChange={(event) => changeOffer(offerIndex, { conditionsConfirmed: event.target.checked })}
                    />
                    Conditions verified
                  </label>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="font-medium">Marginal tiers</h4>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-8 px-3 text-xs"
                      onClick={() =>
                        changeOffer(offerIndex, {
                          tiers: [
                            ...offer.tiers,
                            { minimumAmount: offer.tiers.at(-1)?.maximumAmount || "", maximumAmount: "", annualRatePercent: "", specialConditionText: "" }
                          ]
                        })
                      }
                    >
                      Add tier
                    </Button>
                  </div>
                  {errors[`offers.${offerIndex}.tiers`] ? <p className="mb-2 text-sm text-red-600">{errors[`offers.${offerIndex}.tiers`]}</p> : null}

                  <div className="space-y-2">
                    {offer.tiers.map((tier, tierIndex) => (
                      <div className="grid gap-2 md:grid-cols-5" key={tierIndex}>
                        <Field label="Minimum" error={errors[`offers.${offerIndex}.tiers.${tierIndex}.minimumAmount`]}>
                          <input
                            inputMode="decimal"
                            value={tier.minimumAmount}
                            onChange={(event) => changeTier(offerIndex, tierIndex, { minimumAmount: event.target.value })}
                          />
                        </Field>
                        <Field label="Maximum (blank = unbounded)" error={errors[`offers.${offerIndex}.tiers.${tierIndex}.maximumAmount`]}>
                          <input
                            inputMode="decimal"
                            value={tier.maximumAmount}
                            onChange={(event) => changeTier(offerIndex, tierIndex, { maximumAmount: event.target.value })}
                          />
                        </Field>
                        <Field label="Annual rate %" error={errors[`offers.${offerIndex}.tiers.${tierIndex}.annualRatePercent`]}>
                          <input
                            inputMode="decimal"
                            value={tier.annualRatePercent}
                            onChange={(event) => changeTier(offerIndex, tierIndex, { annualRatePercent: event.target.value })}
                          />
                        </Field>
                        <Field label="Special condition (optional)" error={errors[`offers.${offerIndex}.tiers.${tierIndex}.specialConditionText`]}>
                          <input
                            value={tier.specialConditionText}
                            maxLength={1000}
                            onChange={(event) => changeTier(offerIndex, tierIndex, { specialConditionText: event.target.value })}
                          />
                        </Field>
                        <Button
                          type="button"
                          variant="ghost"
                          className="self-end"
                          disabled={offer.tiers.length === 1}
                          onClick={() => changeOffer(offerIndex, { tiers: offer.tiers.filter((_, i) => i !== tierIndex) })}
                        >
                          Remove tier
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  type="button"
                  variant="danger"
                  className="h-8 px-3 text-xs"
                  disabled={form.offers.length === 1}
                  onClick={() => setForm({ ...form, offers: form.offers.filter((_, i) => i !== offerIndex) })}
                >
                  Remove offer
                </Button>
              </fieldset>
            ))}
          </div>

          <div className="mt-6">
            <Button type="button" loading={saving} loadingText="Saving..." onClick={() => void save()}>
              {editingId ? "Save product" : "Create product"}
            </Button>
          </div>
        </section>
      ) : null}

      <div className="rounded border p-4">
        <h2 className="font-semibold">Monthly plan — {month}</h2>
        <p className="mt-1 text-sm text-muted">
          The 12-month scenario uses current linked-account balances only and never moves money.
        </p>

        {plan ? (
          <>
            <p className="mt-2 text-sm" data-testid="plan-state">
              {planStateLabel(plan)}
            </p>

            {plan.allocations.length ? (
              <ul className="mt-3 space-y-2">
                {plan.allocations.map((allocation) => (
                  <li key={allocation.investmentProductId} className="rounded border p-3 text-sm">
                    <p className="font-medium">
                      {allocation.productName} — {allocation.institutionLabel || institutionLabel(allocation.institution)}
                    </p>
                    <p>Current linked-account balance: {allocation.allocatedAmount.toFixed(2)}</p>
                    <p className="text-muted">
                      Offer {allocation.offerCapturedForMonth} · valid from {allocation.offerValidFrom} to {allocation.offerValidTo}
                      {allocation.validityInferred ? " (inferred validity)" : ""}
                    </p>
                    {allocation.offerFreshness ? (
                      <p className="text-muted">{OFFER_FRESHNESS_COPY[allocation.offerFreshness]}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">No product is eligible for this month.</p>
            )}

            {plan.exclusions.length ? (
              <div className="mt-4">
                <h3 className="font-semibold">Excluded products — {exclusionSummary(plan.exclusions)}</h3>
                <table className="mt-2 w-full text-left text-sm">
                  <caption className="sr-only">Products excluded from this plan and the reason</caption>
                  <thead>
                    <tr className="border-b">
                      <th className="p-2">Product</th>
                      <th className="p-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.exclusions.map((exclusion) => (
                      <tr key={`${exclusion.investmentProductId}-${exclusion.reason}`} className="border-b last:border-0">
                        <td className="p-2">{exclusion.productName}</td>
                        <td className="p-2">{exclusion.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {conditionTiers.length ? (
              <fieldset className="mt-4 space-y-2">
                <legend className="font-semibold">Special conditions to confirm</legend>
                <p className="text-sm text-muted">
                  A tier that declares condition text is only allocated when you confirm it explicitly. An unconfirmed tier is never
                  assumed and is reported as excluded (<code>conditions_not_confirmed</code>).
                </p>
                <ul className="space-y-2">
                  {conditionTiers.map((tier) => {
                    const inputId = `condition-${tier.investmentProductId}-${tier.investmentRateTierId}`;
                    return (
                      <li key={inputId} className="flex items-start gap-2 text-sm">
                        <input
                          id={inputId}
                          type="checkbox"
                          checked={confirmedTierIds.has(tier.investmentRateTierId)}
                          onChange={(event) => toggleTierConfirmation(tier.investmentRateTierId, event.target.checked)}
                        />
                        <label htmlFor={inputId}>{conditionCandidateLabel(tier)}</label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ) : null}

            {!plan.isPersisted && gate.blockers.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
                {gate.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            ) : null}

            <Button type="button" className="mt-3" loading={generating} loadingText="Generating..." disabled={!gate.canGenerate} onClick={() => void generate()}>
              {plan.isPersisted ? `Regenerate ${month} plan` : `Generate ${month} plan`}
            </Button>

            {projection ? (
              <div className="mt-4">
                <h3 className="font-semibold">{projection.planMonth} projection</h3>
                {projection.allocations.map((allocation) => (
                  <article key={allocation.investmentProductId} className="mt-3">
                    <h4>
                      {allocation.productName} — {allocation.institutionLabel || institutionLabel(allocation.institution)}
                    </h4>
                    <ul>
                      {allocation.projection.map((row) => (
                        <li key={row.month}>
                          {row.month}: interest {row.interest.toFixed(2)}, closing {row.closingBalance.toFixed(2)}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">No plan for {month} yet, and no previous plan to carry from.</p>
        )}
      </div>
    </section>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  const id = `field-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  return (
    <label className="grid gap-1 text-sm">
      <span>{label}</span>
      {children}
      {error ? (
        <span id={`${id}-error`} className="text-red-600">
          {error}
        </span>
      ) : null}
    </label>
  );
}
