"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Account } from "@/lib/contracts/accounts";
import { normalizeAccounts } from "@/lib/contracts/accounts";
import { parseApiError } from "@/lib/bff/client-session";
import { csrfFetch } from "@/lib/security/csrf-client";

type Tier = { minimumAmount: string; maximumAmount: string | null; annualRatePercent: string };
type FormTier = Omit<Tier, "maximumAmount"> & { maximumAmount: string };
type Offer = { capturedForMonth: string; validFrom: string; validTo: string; sourceUrl: string; sourceLabel: string; conditionsConfirmed: boolean; tiers: Tier[] };
type FormOffer = Omit<Offer, "tiers"> & { tiers: FormTier[] };
type Product = { investmentProductId: number; name: string; institution: string; accountId: number; active: boolean; offers: Offer[] };
type Plan = { planMonth: string; allocations: { productName: string; institution: string; allocatedAmount: number; projection: { month: string; interest: number; closingBalance: number }[] }[] };
type Form = { accountId: string; name: string; institution: string; active: boolean; offers: FormOffer[] };
type Errors = Record<string, string>;

const month = new Date().toISOString().slice(0, 7);
const emptyTier = (): FormTier => ({ minimumAmount: "0", maximumAmount: "", annualRatePercent: "" });
const emptyOffer = (): FormOffer => ({ capturedForMonth: month, validFrom: "", validTo: "", sourceUrl: "", sourceLabel: "", conditionsConfirmed: false, tiers: [emptyTier()] });
const emptyForm = (): Form => ({ accountId: "", name: "", institution: "", active: true, offers: [emptyOffer()] });

function validate(form: Form): Errors {
  const errors: Errors = {};
  if (!/^\d+$/.test(form.accountId)) errors.accountId = "Select one eligible account.";
  if (!form.name.trim()) errors.name = "Product name is required.";
  if (!form.institution.trim()) errors.institution = "Institution is required.";
  if (!form.offers.length) errors.offers = "At least one offer is required.";
  const months = new Set<string>();
  form.offers.forEach((offer, offerIndex) => {
    const prefix = `offers.${offerIndex}`;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(offer.capturedForMonth)) errors[`${prefix}.capturedForMonth`] = "Use a capture month.";
    else if (months.has(offer.capturedForMonth)) errors[`${prefix}.capturedForMonth`] = "Capture month must be unique.";
    else months.add(offer.capturedForMonth);
    if (!offer.validFrom || !offer.validTo || offer.validTo < offer.validFrom) errors[`${prefix}.validity`] = "Enter a valid start and end date.";
    try { const url = new URL(offer.sourceUrl); if (url.protocol !== "https:") throw new Error(); } catch { errors[`${prefix}.sourceUrl`] = "Use an HTTPS source URL."; }
    if (!offer.sourceLabel.trim()) errors[`${prefix}.sourceLabel`] = "Source label is required.";
    if (!offer.tiers.length) errors[`${prefix}.tiers`] = "At least one marginal tier is required.";
    let expectedMinimum = 0;
    offer.tiers.forEach((tier, tierIndex) => {
      const tierPrefix = `${prefix}.tiers.${tierIndex}`;
      const minimum = Number(tier.minimumAmount);
      const maximum = tier.maximumAmount === "" ? null : Number(tier.maximumAmount);
      const rate = Number(tier.annualRatePercent);
      if (!Number.isFinite(minimum) || minimum !== expectedMinimum || minimum < 0) errors[`${tierPrefix}.minimumAmount`] = `Must equal ${expectedMinimum}.`;
      if (!Number.isFinite(rate) || rate < 0) errors[`${tierPrefix}.annualRatePercent`] = "Enter a non-negative annual rate.";
      if (maximum === null) { if (tierIndex !== offer.tiers.length - 1) errors[`${tierPrefix}.maximumAmount`] = "Only the final tier may be unbounded."; }
      else if (!Number.isFinite(maximum) || maximum <= minimum) errors[`${tierPrefix}.maximumAmount`] = "Maximum must exceed minimum.";
      if (maximum !== null && Number.isFinite(maximum)) expectedMinimum = maximum;
    });
    if (offer.tiers.at(-1)?.maximumAmount !== "") errors[`${prefix}.tiers`] = "The final tier must be unbounded.";
  });
  return errors;
}

function toPayload(form: Form) {
  return { accountId: Number(form.accountId), name: form.name.trim(), institution: form.institution.trim(), active: form.active, offers: form.offers.map((offer) => ({ ...offer, sourceUrl: offer.sourceUrl.trim(), sourceLabel: offer.sourceLabel.trim(), tiers: offer.tiers.map((tier) => ({ minimumAmount: Number(tier.minimumAmount), maximumAmount: tier.maximumAmount === "" ? null : Number(tier.maximumAmount), annualRatePercent: Number(tier.annualRatePercent) })) })) };
}

export function InvestmentsClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const eligibleAccounts = useMemo(() => accounts.filter((account) => account.active && !account.isCredit), [accounts]);

  async function load() {
    const [productsResponse, accountsResponse] = await Promise.all([fetch("/api/bff/investments/products", { cache: "no-store" }), fetch("/api/bff/accounts", { cache: "no-store" })]);
    if (!productsResponse.ok) throw await parseApiError(productsResponse, "Unable to load investment products.");
    if (!accountsResponse.ok) throw await parseApiError(accountsResponse, "Unable to load accounts.");
    setProducts(await productsResponse.json());
    setAccounts(normalizeAccounts(await accountsResponse.json()));
  }

  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load investments.")); }, []);

  function edit(product: Product) {
    setEditingId(product.investmentProductId);
    setForm({ accountId: String(product.accountId), name: product.name, institution: product.institution, active: product.active, offers: product.offers.map((offer) => ({ ...offer, tiers: offer.tiers.map((tier) => ({ ...tier, minimumAmount: String(tier.minimumAmount), maximumAmount: tier.maximumAmount ?? "", annualRatePercent: String(tier.annualRatePercent) })) })) });
    setErrors({}); setError(null);
  }

  async function save() {
    if (!form) return;
    const nextErrors = validate(form); setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true); setError(null);
    try {
      const response = await csrfFetch(editingId ? `/api/bff/investments/products/${editingId}` : "/api/bff/investments/products", { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toPayload(form)) });
      if (!response.ok) throw await parseApiError(response, "Unable to save investment product.");
      await load(); setForm(null); setEditingId(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save investment product."); }
    finally { setSaving(false); }
  }

  async function toggleActive(product: Product) {
    setError(null);
    try {
      const response = await csrfFetch(`/api/bff/investments/products/${product.investmentProductId}/active`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !product.active }) });
      if (!response.ok) throw await parseApiError(response, "Unable to update product status.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update product status."); }
  }

  async function generate() { setError(null); const response = await csrfFetch("/api/bff/investments/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planMonth: month, projectionMonths: 12 }) }); if (!response.ok) { setError((await response.json().catch(() => null))?.message ?? "Unable to generate plan."); return; } setPlan(await response.json()); }
  const changeOffer = (index: number, patch: Partial<FormOffer>) => setForm((current) => current && ({ ...current, offers: current.offers.map((offer, i) => i === index ? { ...offer, ...patch } : offer) }));
  const changeTier = (offerIndex: number, tierIndex: number, patch: Partial<FormTier>) => setForm((current) => current && ({ ...current, offers: current.offers.map((offer, i) => i === offerIndex ? { ...offer, tiers: offer.tiers.map((tier, j) => j === tierIndex ? { ...tier, ...patch } : tier) } : offer) }));

  return <section className="space-y-6"><header><p className="text-sm text-muted">Fixed income</p><h1 className="text-2xl font-bold">Investments</h1><p className="text-muted">Record verified offer snapshots to generate scenarios. This catalog never moves money or changes account balances.</p></header>{error ? <Alert variant="danger">{error}</Alert> : null}
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Product catalog</h2><Button type="button" onClick={() => { setForm(emptyForm()); setEditingId(null); setErrors({}); setError(null); }}>Add product</Button></div>
    <div className="overflow-x-auto rounded border"><table className="w-full text-left text-sm"><caption className="sr-only">Investment products</caption><thead><tr className="border-b"><th className="p-3">Product</th><th className="p-3">Institution</th><th className="p-3">Account</th><th className="p-3">Status</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead><tbody>{products.map((product) => <tr key={product.investmentProductId} className="border-b last:border-0"><td className="p-3">{product.name}</td><td className="p-3">{product.institution}</td><td className="p-3">{accounts.find((account) => account.accountId === product.accountId)?.name ?? `Account ${product.accountId}`}</td><td className="p-3">{product.active ? "Active" : "Inactive"}</td><td className="p-3"><div className="flex gap-2"><Button type="button" variant="secondary" className="h-8 px-3 text-xs" onClick={() => edit(product)}>Edit</Button><Button type="button" variant={product.active ? "danger" : "secondary"} className="h-8 px-3 text-xs" onClick={() => void toggleActive(product)}>{product.active ? "Deactivate" : "Activate"}</Button></div></td></tr>)}{!products.length ? <tr><td colSpan={5} className="p-4 text-muted">No products configured.</td></tr> : null}</tbody></table></div>
    {form ? <section className="rounded border p-4" aria-labelledby="product-form-title"><div className="flex items-center justify-between gap-3"><h2 id="product-form-title" className="font-semibold">{editingId ? "Edit product" : "New product"}</h2><Button type="button" variant="ghost" onClick={() => { setForm(null); setEditingId(null); }}>Cancel</Button></div><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Product name" error={errors.name}><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} aria-invalid={Boolean(errors.name)} /></Field><Field label="Institution" error={errors.institution}><input value={form.institution} onChange={(event) => setForm({ ...form, institution: event.target.value })} aria-invalid={Boolean(errors.institution)} /></Field><Field label="Eligible account" error={errors.accountId}><select value={form.accountId} disabled={editingId !== null} onChange={(event) => setForm({ ...form, accountId: event.target.value })} aria-invalid={Boolean(errors.accountId)}><option value="">Select account</option>{eligibleAccounts.map((account) => <option key={account.accountId} value={account.accountId}>{account.name}</option>)}</select></Field><label className="flex items-center gap-2 self-end"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />Active product</label></div>
      <div className="mt-6 space-y-4"><div className="flex items-center justify-between"><h3 className="font-semibold">Offers</h3><Button type="button" variant="secondary" className="h-8 px-3 text-xs" onClick={() => setForm({ ...form, offers: [...form.offers, emptyOffer()] })}>Add offer</Button></div>{errors.offers ? <p className="text-sm text-red-600">{errors.offers}</p> : null}{form.offers.map((offer, offerIndex) => <fieldset key={offerIndex} className="space-y-4 border p-4"><legend className="px-1 font-medium">Offer {offerIndex + 1}</legend><div className="grid gap-4 md:grid-cols-3"><Field label="Capture month" error={errors[`offers.${offerIndex}.capturedForMonth`]}><input type="month" value={offer.capturedForMonth} onChange={(event) => changeOffer(offerIndex, { capturedForMonth: event.target.value })} /></Field><Field label="Valid from"><input type="date" value={offer.validFrom} onChange={(event) => changeOffer(offerIndex, { validFrom: event.target.value })} /></Field><Field label="Valid to" error={errors[`offers.${offerIndex}.validity`]}><input type="date" value={offer.validTo} onChange={(event) => changeOffer(offerIndex, { validTo: event.target.value })} /></Field><Field label="Source label" error={errors[`offers.${offerIndex}.sourceLabel`]}><input value={offer.sourceLabel} onChange={(event) => changeOffer(offerIndex, { sourceLabel: event.target.value })} /></Field><Field label="HTTPS source URL" error={errors[`offers.${offerIndex}.sourceUrl`]}><input type="url" value={offer.sourceUrl} onChange={(event) => changeOffer(offerIndex, { sourceUrl: event.target.value })} /></Field><label className="flex items-center gap-2 self-end"><input type="checkbox" checked={offer.conditionsConfirmed} onChange={(event) => changeOffer(offerIndex, { conditionsConfirmed: event.target.checked })} />Conditions verified</label></div><div><div className="mb-2 flex items-center justify-between"><h4 className="font-medium">Marginal tiers</h4><Button type="button" variant="secondary" className="h-8 px-3 text-xs" onClick={() => changeOffer(offerIndex, { tiers: [...offer.tiers, { minimumAmount: offer.tiers.at(-1)?.maximumAmount || "", maximumAmount: "", annualRatePercent: "" }] })}>Add tier</Button></div>{errors[`offers.${offerIndex}.tiers`] ? <p className="mb-2 text-sm text-red-600">{errors[`offers.${offerIndex}.tiers`]}</p> : null}<div className="space-y-2">{offer.tiers.map((tier, tierIndex) => <div className="grid gap-2 md:grid-cols-4" key={tierIndex}><Field label="Minimum" error={errors[`offers.${offerIndex}.tiers.${tierIndex}.minimumAmount`]}><input inputMode="decimal" value={tier.minimumAmount} onChange={(event) => changeTier(offerIndex, tierIndex, { minimumAmount: event.target.value })} /></Field><Field label="Maximum (blank = unbounded)" error={errors[`offers.${offerIndex}.tiers.${tierIndex}.maximumAmount`]}><input inputMode="decimal" value={tier.maximumAmount} onChange={(event) => changeTier(offerIndex, tierIndex, { maximumAmount: event.target.value })} /></Field><Field label="Annual rate %" error={errors[`offers.${offerIndex}.tiers.${tierIndex}.annualRatePercent`]}><input inputMode="decimal" value={tier.annualRatePercent} onChange={(event) => changeTier(offerIndex, tierIndex, { annualRatePercent: event.target.value })} /></Field><Button type="button" variant="ghost" className="self-end" disabled={offer.tiers.length === 1} onClick={() => changeOffer(offerIndex, { tiers: offer.tiers.filter((_, i) => i !== tierIndex) })}>Remove tier</Button></div>)}</div></div><Button type="button" variant="danger" className="h-8 px-3 text-xs" disabled={form.offers.length === 1} onClick={() => setForm({ ...form, offers: form.offers.filter((_, i) => i !== offerIndex) })}>Remove offer</Button></fieldset>)}</div><div className="mt-6"><Button type="button" loading={saving} loadingText="Saving..." onClick={() => void save()}>{editingId ? "Save product" : "Create product"}</Button></div></section> : null}
    <div className="rounded border p-4"><h2 className="font-semibold">Plan</h2><p className="mt-1 text-sm text-muted">The 12-month scenario uses current linked-account balances only.</p><Button type="button" className="mt-3" onClick={() => void generate()}>Generate {month} plan</Button>{plan ? <div className="mt-4"><h3 className="font-semibold">{plan.planMonth} projection</h3>{plan.allocations.map((allocation) => <article key={allocation.productName} className="mt-3"><h4>{allocation.productName} — {allocation.institution}</h4><p>Current linked-account balance: {allocation.allocatedAmount.toFixed(2)}</p><ul>{allocation.projection.map((row) => <li key={row.month}>{row.month}: interest {row.interest.toFixed(2)}, closing {row.closingBalance.toFixed(2)}</li>)}</ul></article>)}</div> : null}</div></section>;
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) { const id = `field-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`; return <label className="grid gap-1 text-sm"><span>{label}</span>{children}{error ? <span id={`${id}-error`} className="text-red-600">{error}</span> : null}</label>; }
