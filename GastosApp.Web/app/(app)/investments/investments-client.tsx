"use client";

import { useCallback, useEffect, useMemo, useState, useRef, useId, cloneElement, type ReactElement, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { tableActionBaseClass, tableActionStyles } from "@/lib/ui/table-action-styles";
import { PageHeader } from "@/components/navigation/page-header";
import { CatalogToastStack } from "../catalogs/_shared/catalog-toast-stack";
import { useCatalogToasts } from "../catalogs/_shared/use-catalog-toasts";
import { InvestmentDashboard } from "./_components/investment-dashboard";
import { InvestmentCatalog } from "./_components/investment-catalog";
import { InvestmentPlanGrid } from "./_components/investment-plan-grid";
import { buildInvestmentDashboard } from "./_lib/investment-dashboard";
import { loadInvestmentPlan } from "./_lib/investment-plan-load";
import { normalizeInvestmentAccounts } from "./_lib/investment-current-balance";
import { InvestmentFormDrawer } from "./_components/investment-form-drawer";
import type { Account } from "@/lib/contracts/accounts";
import { INVESTMENT_INSTITUTIONS } from "@/lib/contracts/investment-institutions";
import {
  normalizeProducts,
  type InvestmentPlan,
  type InvestmentProduct,
  type InvestmentPlanProjection
} from "@/lib/contracts/investments";
import { parseApiError } from "@/lib/bff/client-session";
import { csrfFetch } from "@/lib/security/csrf-client";
import {
  eligibleLinkAccounts,
  emptyOffer,
  emptyProductForm,
  inferredValidTo,
  toProductPayload,
  validateProductForm,
  type OfferFormValue,
  type ProductFormErrors,
  type ProductFormValues
} from "./_lib/investment-form-model";
import { exclusionReasonLabel, investmentErrorMessage } from "./_lib/investment-copy";
import {
  conditionCandidateLabel,
  conditionCandidates,
  confirmedTierIdsForGeneration,
  exclusionSummary,
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
  const [accountError, setAccountError] = useState<string | null>(null);
  const [linkProduct, setLinkProduct] = useState<InvestmentProduct | null>(null);
  const [linkAccountId, setLinkAccountId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [plan, setPlan] = useState<InvestmentPlan | null>(null);
  const [projection, setProjection] = useState<InvestmentPlanProjection | null>(null);
  const [projectionError, setProjectionError] = useState<string | null>(null);
  const planRequest = useRef(0);
  const [form, setForm] = useState<ProductDraft | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectionMonths, setProjectionMonths] = useState(12);
  const { toasts, dismissToast, success } = useCatalogToasts();
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirmedTierIds, setConfirmedTierIds] = useState<Set<number>>(new Set());

  const eligibleAccounts = useMemo(() => eligibleLinkAccounts(accounts, products, editingId, form?.active ?? true), [accounts, products, editingId, form?.active]);
  const linkAccounts = useMemo(() => eligibleLinkAccounts(accounts, products, linkProduct?.investmentProductId ?? null, linkProduct?.active ?? true), [accounts, products, linkProduct]);

  /**
   * Condition tiers that need an explicit attestation for this month. Derived from the catalog rather
   * than from the plan so a tier stays confirmable even after its product was excluded (for example for
   * a missing confirmation), and scoped to the month's capture so a stale tier id is never sent.
   */
  const conditionTiers = useMemo(() => conditionCandidates(products, month), [products, month]);

  const loadPlan = useCallback(async () => {
    const requestId = ++planRequest.current;
    setProjection(null);
    setProjectionError(null);
    try {
      const result = await loadInvestmentPlan(month);
      // A slower earlier refresh must not replace a newer plan/projection pair.
      if (requestId !== planRequest.current) return;
      setPlan(result.plan);
      setProjection(result.projection);
      setProjectionError(result.projectionError);
      if (result.plan) setProjectionMonths(result.plan.projectionMonths);
      setConfirmedTierIds(result.plan ? priorConfirmedTierIds(result.plan) : new Set());
    } catch (reason) {
      if (requestId !== planRequest.current) return;
      throw reason;
    }
  }, [month]);

  const load = useCallback(async () => {
    const [productsResponse, accountsResponse] = await Promise.all([
      fetch("/api/bff/investments/products", { cache: "no-store" }),
      fetch("/api/bff/accounts", { cache: "no-store" }).catch(() => null)
    ]);

    if (!productsResponse.ok) throw await parseApiError(productsResponse, "No se pudieron cargar los productos de inversión.");
    setProducts(normalizeProducts(await productsResponse.json()));
    setAccountError(null);
    try {
      if (!accountsResponse?.ok) throw new Error("accounts_load_failed");
      const rawAccounts: unknown = await accountsResponse.json();
      if (!Array.isArray(rawAccounts)) throw new Error("accounts_payload_invalid");
      const normalized = normalizeInvestmentAccounts(rawAccounts);
      if (normalized.length !== rawAccounts.length) throw new Error("accounts_payload_invalid");
      setAccounts(normalized);
    } catch {
      setAccounts([]);
      setAccountError("No se pudieron cargar las cuentas. Puedes guardar el producto sin vincular una cuenta e intentarlo de nuevo más tarde.");
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([load(), loadPlan()]);
      } catch (reason) {
        setError(investmentErrorMessage(reason, "No se pudieron cargar las inversiones."));
      } finally {
        setLoading(false);
      }
    })();
  }, [load, loadPlan]);

  function edit(product: InvestmentProduct) {
    setEditingId(product.investmentProductId);
    setForm({
      accountId: product.accountId === null ? "" : String(product.accountId),
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
    if (Object.keys(nextErrors).length) {
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[role="dialog"] [aria-invalid="true"]')?.focus());
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await csrfFetch(editingId ? `/api/bff/investments/products/${editingId}` : "/api/bff/investments/products", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toProductPayload(form))
      });
      if (!response.ok) throw await parseApiError(response, "No se pudo guardar el producto de inversión.");
      const selected = new Set(confirmedTierIds);
      await Promise.all([load(), loadPlan()]);
      setConfirmedTierIds((current) => new Set([...current, ...selected]));
      setForm(null);
      setEditingId(null);
      success(editingId ? "Producto actualizado" : "Producto creado");
    } catch (reason) {
      setError(investmentErrorMessage(reason, "No se pudo guardar el producto de inversión."));
    } finally {
      setSaving(false);
    }
  }

  async function saveLink() {
    if (!linkProduct) return;
    setSaving(true);
    setError(null);
    try {
      const response = await csrfFetch(`/api/bff/investments/products/${linkProduct.investmentProductId}/account`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: linkAccountId === "" ? null : Number(linkAccountId) })
      });
      if (!response.ok) throw await parseApiError(response, "No se pudo actualizar la cuenta vinculada.");
      // Loading a plan may reseed confirmations; retain this session's explicit selections as well.
      const selected = new Set(confirmedTierIds);
      await Promise.all([load(), loadPlan()]);
      setConfirmedTierIds((current) => new Set([...current, ...selected]));
      setLinkProduct(null);
      success("Cuenta vinculada actualizada");
    } catch (reason) {
      setError(investmentErrorMessage(reason, "No se pudo actualizar la cuenta vinculada."));
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
      if (!response.ok) throw await parseApiError(response, "No se pudo actualizar el estado del producto.");
      await Promise.all([load(), loadPlan()]);
      success(product.active ? "Producto desactivado" : "Producto activado");
    } catch (reason) {
      setError(investmentErrorMessage(reason, "No se pudo actualizar el estado del producto."));
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
          projectionMonths,
          // Only the tiers declared by this month's offers that are actually confirmed: an id from any
          // other month or from an offer that no longer exists is never sent, and an unconfirmed tier is
          // left out so the server reports it as `conditions_not_confirmed` instead of allocating it.
          confirmedTierIds: confirmedTierIdsForGeneration(conditionTiers, confirmedTierIds)
        })
      });
      if (!response.ok) throw await parseApiError(response, "No se pudo generar el plan.");
      await loadPlan();
      success("Plan mensual generado");
    } catch (reason) {
      setError(investmentErrorMessage(reason, "No se pudo generar el plan."));
    } finally {
      setGenerating(false);
    }
  }

  const dashboard = useMemo(() => buildInvestmentDashboard(plan, projectionMonths, projection), [plan, projectionMonths, projection]);

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
      <PageHeader section="Renta fija" title="Inversiones" variant="plain" subtitle="Registra ofertas verificadas para generar escenarios. No se mueve dinero ni se modifican saldos; solo se utilizan las tasas que registras." />
      <CatalogToastStack toasts={toasts} onDismiss={dismissToast} />

      <Alert role="note" className="border-[var(--color-warning)] bg-[var(--color-warning)]/10 text-primary">
        <strong>Proyección estimada, no un rendimiento garantizado ni saldo real.</strong> Revisa cada mes las tasas, vigencias y condiciones de los productos antes de generar el plan.
      </Alert>
      {error ? <Alert variant="danger">{error}</Alert> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="font-semibold text-primary">Resumen del plan</h2><p className="mt-1 text-xs text-muted">Consulta de 1 a 24 meses con la misma instantánea. Cambiar el horizonte no regenera el plan.</p></div>
        <div className="max-w-xs">
          <Input id="investment-projection-months" label="Horizonte de proyección (meses)" type="number" min={1} max={24} value={projectionMonths}
            error={Number.isInteger(projectionMonths) && projectionMonths >= 1 && projectionMonths <= 24 ? undefined : "Indica entre 1 y 24 meses."}
            onChange={(event) => setProjectionMonths(Number(event.target.value))} />
        </div>
      </div>
      {projectionError ? <Alert variant="danger">{projectionError}</Alert> : null}
      {!loading && !plan?.isPersisted ? <Alert role="note">Plan pendiente de generación. El catálogo y los saldos actuales de las cuentas vinculadas se muestran abajo; no son proyecciones ni asignaciones generadas.</Alert> : null}
      {accountError && !form && !linkProduct ? <Alert variant="danger">{accountError}</Alert> : null}
      <InvestmentDashboard plan={plan} dashboard={dashboard} horizon={projectionMonths} loading={loading} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Catálogo de productos</h2>
        <Button
          type="button"
          disabled={loading}
          onClick={() => {
            setForm(emptyProductForm(month));
            setEditingId(null);
            setErrors({});
            setError(null);
          }}
        >
          Agregar producto
        </Button>
      </div>

      <InvestmentCatalog products={products} accounts={accounts} month={month} loading={loading}
        onEdit={edit} onToggle={(product) => void toggleActive(product)}
        onLink={(product) => { setLinkProduct(product); setLinkAccountId(product.accountId === null ? "" : String(product.accountId)); setError(null); }} />

      {linkProduct ? (
        <InvestmentFormDrawer title={`Cuenta de ${linkProduct.name}`} saving={saving}
          onClose={() => { if (!saving) setLinkProduct(null); }} onSubmit={() => void saveLink()}
          footer={<Button type="submit" loading={saving} loadingText="Guardando...">Guardar vínculo</Button>}>
          {error ? <p role="alert" className="text-danger">{error}</p> : null}
          {accountError ? <p role="alert" className="text-danger">{accountError}</p> : null}
          <Select id="investment-link-account" label="Cuenta vinculada (opcional)" value={linkAccountId} onChange={(event) => setLinkAccountId(event.target.value)}>
            <option value="">Sin cuenta vinculada</option>
            {linkProduct.accountId !== null && !linkAccounts.some((account) => account.accountId === linkProduct.accountId) ?
              <option value={linkProduct.accountId}>{linkProduct.accountName ?? `Cuenta ${linkProduct.accountId}`} — no elegible; desvincula o cambia</option> : null}
            {linkAccounts.map((account) => <option key={account.accountId} value={account.accountId}>{account.name}</option>)}
          </Select>
          <p className="text-muted text-xs">Solo cuentas activas, sin crédito y que generen intereses. Cambiar el vínculo no modifica ofertas, confirmaciones ni planes ya generados.</p>
        </InvestmentFormDrawer>
      ) : null}

      {form ? (
        <InvestmentFormDrawer
          title={editingId ? "Editar producto" : "Nuevo producto"}
          saving={saving}
          onClose={() => { if (!saving) { setForm(null); setEditingId(null); } }}
          onSubmit={() => void save()}
          footer={<div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" className="h-8 rounded-none px-3 text-xs font-bold" disabled={saving} onClick={() => { setForm(null); setEditingId(null); }}>Cancelar</Button>
            <Button type="submit" loading={saving} loadingText="Guardando..." className="h-8 rounded-none px-3 text-xs font-bold">{editingId ? "Guardar cambios" : "Crear producto"}</Button>
          </div>}
        >
          <section className="drawer-section-semantic rounded-none border-[var(--color-border)] bg-[var(--color-surface-2)]">
          <h3 className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">Producto y cuenta</h3>
          {accountError ? <p role="alert" className="text-danger">{accountError}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input id="investment-product-name" label="Nombre del producto" error={errors.name} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <Select id="investment-institution" label="Institución" error={errors.institution}
                value={form.institution}
                onChange={(event) => setForm({ ...form, institution: event.target.value })}
                aria-invalid={Boolean(errors.institution)}
              >
                <option value="">Selecciona una institución</option>
                {INVESTMENT_INSTITUTIONS.map((institution) => (
                  <option key={institution.code} value={institution.code}>
                    {institution.label}
                  </option>
                ))}
              </Select>

            <Select id="investment-account" label="Cuenta vinculada (opcional)" error={errors.accountId}
                value={form.accountId}
                onChange={(event) => setForm({ ...form, accountId: event.target.value })}
                aria-invalid={Boolean(errors.accountId)}
              >
                <option value="">Sin cuenta vinculada</option>
                {form.accountId !== "" && !eligibleAccounts.some((account) => String(account.accountId) === form.accountId) ?
                  <option value={form.accountId}>{products.find((product) => product.investmentProductId === editingId)?.accountName ?? `Cuenta ${form.accountId}`} — no elegible; desvincula o cambia</option> : null}
                {eligibleAccounts.map((account) => (
                  <option key={account.accountId} value={account.accountId}>
                    {account.name}
                  </option>
                ))}
              </Select>

            <label className="flex items-center gap-2 self-end">
              <input className="h-4 w-4 accent-[var(--color-accent)]" type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
              Producto activo
            </label>
          </div>

          <p className="m-0 text-[11px] font-medium text-muted">Puedes registrar ofertas sin cuenta y vincularla después. Solo cuentas activas, sin crédito y que generen intereses; una cuenta por producto y un producto activo por cuenta. Sin vínculo elegible no hay proyección.</p>
          </section>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Ofertas mensuales</h3>
              <Button
                type="button"
                variant="secondary"
                className="h-8 rounded-none px-3 text-xs font-bold"
                onClick={() => setForm({ ...form, offers: [...form.offers, emptyOffer(month)] })}
              >
                Agregar oferta
              </Button>
            </div>
            {errors.offers ? <p role="alert" className="text-sm text-[var(--color-danger)]">{errors.offers}</p> : null}

            {form.offers.map((offer, offerIndex) => (
              <fieldset key={offerIndex} className="drawer-section-semantic space-y-4 rounded-none border-[var(--color-border)] bg-[var(--color-surface-2)]">
                <legend className="px-1 font-medium">Oferta {offerIndex + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input id={`investment-field-${offerIndex}-month`} label="Mes de captura" error={errors[`offers.${offerIndex}.capturedForMonth`]}
                      type="month"
                      value={offer.capturedForMonth}
                      onChange={(event) => changeOffer(offerIndex, { capturedForMonth: event.target.value })}
                    />
                  <Input id={`investment-field-${offerIndex}-from`} label="Vigente desde" error={errors[`offers.${offerIndex}.validity`]} type="date" value={offer.validFrom} onChange={(event) => changeOffer(offerIndex, { validFrom: event.target.value })} />
                  <Input id={`investment-field-${offerIndex}-to`} label="Vigente hasta (opcional)" error={errors[`offers.${offerIndex}.validity`]}
                      type="date"
                      value={offer.validTo}
                      placeholder={inferredValidTo(offer.capturedForMonth) ?? ""}
                      onChange={(event) => changeOffer(offerIndex, { validTo: event.target.value })}
                    />
                  <Input id={`investment-field-${offerIndex}-source-label`} label="Nombre de la fuente" error={errors[`offers.${offerIndex}.sourceLabel`]} value={offer.sourceLabel} onChange={(event) => changeOffer(offerIndex, { sourceLabel: event.target.value })} />
                  <Input id={`investment-field-${offerIndex}-source-url`} label="URL de la fuente (HTTPS)" error={errors[`offers.${offerIndex}.sourceUrl`]} type="url" value={offer.sourceUrl} onChange={(event) => changeOffer(offerIndex, { sourceUrl: event.target.value })} />
                  <Field label="Términos (opcional)" error={errors[`offers.${offerIndex}.termsText`]}>
                    <textarea
                      className="input-semantic min-h-20 w-full px-3 py-2 text-sm"
                      rows={2}
                      value={offer.termsText}
                      maxLength={1000}
                      onChange={(event) => changeOffer(offerIndex, { termsText: event.target.value })}
                    />
                  </Field>
                  <label className="flex items-center gap-2 self-end">
                    <input
                      className="h-4 w-4 accent-[var(--color-accent)]"
                      type="checkbox"
                      checked={offer.conditionsConfirmed}
                      onChange={(event) => changeOffer(offerIndex, { conditionsConfirmed: event.target.checked })}
                    />
                    Condiciones verificadas
                  </label>
                </div>

                <p className="m-0 text-[11px] font-medium text-muted">Si dejas el fin vacío, la vigencia se infiere hasta el {displayDate(inferredValidTo(offer.capturedForMonth) ?? "")}.</p>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="font-medium">Tramos marginales</h4>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-8 rounded-none px-3 text-xs font-bold"
                      onClick={() =>
                        changeOffer(offerIndex, {
                          tiers: [
                            ...offer.tiers,
                            { minimumAmount: offer.tiers.at(-1)?.maximumAmount || "", maximumAmount: "", annualRatePercent: "", specialConditionText: "" }
                          ]
                        })
                      }
                    >
                      Agregar tramo
                    </Button>
                  </div>
                  {errors[`offers.${offerIndex}.tiers`] ? <p role="alert" className="mb-2 text-sm text-[var(--color-danger)]">{errors[`offers.${offerIndex}.tiers`]}</p> : null}

                  <div className="space-y-2">
                    {offer.tiers.map((tier, tierIndex) => (
                      <div className="grid gap-3 border border-default p-3 sm:grid-cols-2" key={tierIndex}>
                        <h5 className="font-semibold text-sm sm:col-span-2">Tramo {tierIndex + 1}</h5>
                        <Input id={`investment-field-${offerIndex}-${tierIndex}-min`} label="Mínimo (MXN)" error={errors[`offers.${offerIndex}.tiers.${tierIndex}.minimumAmount`]}
                            inputMode="decimal"
                            value={tier.minimumAmount}
                            onChange={(event) => changeTier(offerIndex, tierIndex, { minimumAmount: event.target.value })}
                          />
                        <Input id={`investment-field-${offerIndex}-${tierIndex}-max`} label="Máximo (vacío = sin límite)" error={errors[`offers.${offerIndex}.tiers.${tierIndex}.maximumAmount`]}
                            inputMode="decimal"
                            value={tier.maximumAmount}
                            onChange={(event) => changeTier(offerIndex, tierIndex, { maximumAmount: event.target.value })}
                          />
                        <Input id={`investment-field-${offerIndex}-${tierIndex}-rate`} label="Tasa anual (%)" error={errors[`offers.${offerIndex}.tiers.${tierIndex}.annualRatePercent`]}
                            inputMode="decimal"
                            value={tier.annualRatePercent}
                            onChange={(event) => changeTier(offerIndex, tierIndex, { annualRatePercent: event.target.value })}
                          />
                        <Input id={`investment-field-${offerIndex}-${tierIndex}-condition`} label="Condición especial (opcional)" error={errors[`offers.${offerIndex}.tiers.${tierIndex}.specialConditionText`]}
                            value={tier.specialConditionText}
                            maxLength={1000}
                            onChange={(event) => changeTier(offerIndex, tierIndex, { specialConditionText: event.target.value })}
                          />
                        <Button
                          type="button"
                          variant="ghost"
                          className={`${tableActionBaseClass} ${tableActionStyles.delete} self-end`}
                          aria-label={`Quitar tramo ${tierIndex + 1} de la oferta ${offerIndex + 1}`}
                          disabled={offer.tiers.length === 1}
                          onClick={() => changeOffer(offerIndex, { tiers: offer.tiers.filter((_, i) => i !== tierIndex) })}
                        >
                          Quitar tramo {tierIndex + 1}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  type="button"
                  variant="danger"
                  className="h-8 rounded-none px-3 text-xs font-bold"
                  disabled={form.offers.length === 1}
                  onClick={() => setForm({ ...form, offers: form.offers.filter((_, i) => i !== offerIndex) })}
                >
                  Quitar oferta {offerIndex + 1}
                </Button>
              </fieldset>
            ))}
          </div>

          {error ? <Alert variant="danger">{error}</Alert> : null}
        </InvestmentFormDrawer>
      ) : null}

      <div className="app-panel rounded-none border p-4">
        <h2 className="font-semibold">Plan mensual — {month}</h2>
        <p className="mt-1 text-sm text-muted">
          Al generar se capturan los saldos observados de las cuentas elegibles. El plan conserva esa instantánea y no mueve dinero; regenerar sustituye la instantánea del mes.
        </p>

        {plan ? (
          <>
            <p className="mt-2 text-sm" data-testid="plan-state">
              {planStateLabel(plan)}
            </p>

            <InvestmentPlanGrid plan={plan} series={dashboard.allocations} starting={dashboard.starting} />

            {plan.exclusions.length ? (
              <div className="mt-4">
                <h3 className="font-semibold">Productos excluidos — {exclusionSummary(plan.exclusions)}</h3>
                <div className="mt-2 overflow-x-auto focus-ring" tabIndex={0} role="region" aria-label="Productos excluidos"><table className="w-full min-w-[420px] text-left text-sm">
                  <caption className="sr-only">Productos excluidos de este plan y sus motivos</caption>
                  <thead>
                    <tr className="border-b">
                      <th scope="col" className="p-2">Producto</th>
                      <th scope="col" className="p-2">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.exclusions.map((exclusion) => (
                      <tr key={`${exclusion.investmentProductId}-${exclusion.reason}`} className="border-b last:border-0">
                        <td className="p-2">{exclusion.productName}</td>
                        <td className="p-2">{exclusionReasonLabel(exclusion.reason)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            ) : null}

            {conditionTiers.length ? (
              <fieldset className="mt-4 space-y-2">
                <legend className="font-semibold">Condiciones especiales por confirmar</legend>
                <p className="text-sm text-muted">
                  Un tramo con condiciones especiales solo se incluye cuando las confirmas expresamente. Si no lo confirmas,
                  el producto se excluye por condiciones no confirmadas.
                </p>
                <ul className="space-y-2">
                  {conditionTiers.map((tier) => {
                    const inputId = `condition-${tier.investmentProductId}-${tier.investmentRateTierId}`;
                    return (
                      <li key={inputId} className="flex items-start gap-2 text-sm">
                        <input
                          id={inputId}
                          className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
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

            <Button type="button" className="mt-3" loading={generating} loadingText="Generando..." disabled={!gate.canGenerate || !Number.isInteger(projectionMonths) || projectionMonths < 1 || projectionMonths > 24} onClick={() => void generate()}>
              {plan.isPersisted ? `Regenerar plan de ${month}` : `Generar plan de ${month}`}
            </Button>


          </>
        ) : (
          <p className="mt-3 text-sm text-muted">{loading ? "Cargando plan mensual..." : <>Aún no hay un plan para {month} ni un plan anterior que sirva de base.</>}</p>
        )}
      </div>
    </section>
  );
}

function displayDate(value: string): string {
  if (!value) return "una fecha válida";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="grid gap-1.5 text-sm font-medium text-primary">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children as ReactElement<Record<string, unknown>>, { id, "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-error` : undefined })}
      {error ? <span role="alert" id={`${id}-error`} className="text-xs text-[var(--color-danger)]">{error}</span> : null}
    </div>
  );
}
