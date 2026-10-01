"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format/currency";
import { formatDate, formatMonthLabel } from "@/app/(app)/dashboard/_components/dashboard-format";
import { institutionLabel } from "@/lib/contracts/investment-institutions";
import type { Account } from "@/lib/contracts/accounts";
import type { InvestmentProduct, InvestmentTier } from "@/lib/contracts/investments";
import { tableActionBaseClass, tableActionStyles } from "@/lib/ui/table-action-styles";
import { linkedCurrentBalance } from "../_lib/investment-current-balance";

export function TierSchedule({ tiers }: { tiers: ReadonlyArray<InvestmentTier & { conditionConfirmed?: boolean }> }) {
  if (!tiers.length || tiers.some((tier) => !Number.isFinite(tier.minimumAmount) || !Number.isFinite(tier.annualRatePercent) || (tier.maximumAmount !== null && !Number.isFinite(tier.maximumAmount)))) return <p className="text-xs text-muted">Sin tramos válidos registrados; no se asume una tasa.</p>;
  return <ul className="space-y-1 text-xs">{tiers.map((tier, index) => (
    <li key={`${tier.investmentRateTierId}-${index}`}>
      <span className="font-medium">{formatCurrency(tier.minimumAmount)} a {tier.maximumAmount === null ? "sin límite" : formatCurrency(tier.maximumAmount)}: {tier.annualRatePercent}% anual</span>
      {tier.specialConditionText ? <p className="mt-1 text-muted">{tier.specialConditionText}{tier.conditionConfirmed === undefined ? "" : tier.conditionConfirmed ? " · Confirmada en el plan" : " · Sin confirmar"}</p> : null}
    </li>
  ))}</ul>;
}

export function InvestmentCatalog({ products, accounts, month, loading, onEdit, onLink, onToggle }: {
  products: InvestmentProduct[]; accounts: Account[]; month: string; loading: boolean;
  onEdit: (product: InvestmentProduct) => void; onLink: (product: InvestmentProduct) => void; onToggle: (product: InvestmentProduct) => void;
}) {
  if (!products.length) return <Card className="dashboard-card border-dashed p-8 text-center"><p className="text-sm text-muted">{loading ? "Cargando productos…" : "Aún no hay productos. Agrega una oferta; puedes vincular la cuenta después."}</p></Card>;
  return <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy={loading}>
    {products.map((product) => {
      const current = product.offers.find((offer) => offer.capturedForMonth === month);
      const offer = current ?? [...product.offers].sort((a, b) => b.capturedForMonth.localeCompare(a.capturedForMonth))[0];
      const accountName = product.accountId === null ? "Sin cuenta vinculada" : product.accountName ?? accounts.find((account) => account.accountId === product.accountId)?.name ?? `Cuenta ${product.accountId}`;
      return <Card key={product.investmentProductId} className="dashboard-card overflow-hidden">
        <details className="group">
          <summary className="focus-ring flex cursor-pointer list-none items-start justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0 space-y-2">
              <h3 className="m-0 break-words text-base font-semibold text-primary">{product.name}</h3>
              <p className="text-xs text-secondary">{product.institutionLabel || institutionLabel(product.institution)} · {product.active ? "Activo" : "Inactivo"}</p>
              <p className="text-xs text-muted">{accountName}</p>
              <p className="text-xs font-medium text-secondary">Saldo actual de la cuenta: {linkedCurrentBalance(product, accounts) === null ? "No disponible" : formatCurrency(linkedCurrentBalance(product, accounts)!)} <span className="font-normal text-muted">· No es una proyección</span></p>
              <p className={`text-xs font-medium ${current && product.active ? "text-[var(--color-success)]" : "text-muted"}`}>{!product.active ? "Producto inactivo" : current ? `Oferta de ${formatMonthLabel(month)}` : offer ? "Oferta anterior: actualiza para este mes" : "Sin oferta registrada"}</p>
              <p className="text-xs text-muted">{offer ? `${offer.tiers.length} tramos marginales · ${offer.conditionsConfirmed ? "Condiciones verificadas" : "Condiciones por verificar"}` : "Registra tasas y vigencia"}</p>
              <span className="inline-block text-xs font-semibold text-secondary">Ver oferta y acciones</span>
            </div>
            <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
          </summary>
          <div className="space-y-3 border-t border-default p-4">
            {product.accountId === null ? <p className="text-xs text-muted">Producto registrado sin capital asignado. Vincula una cuenta elegible para incluirlo en el plan; no se supone un saldo.</p> : null}
            {offer ? <>
              <p className="text-xs text-muted">Captura: {formatMonthLabel(offer.capturedForMonth)}. Vigencia: {formatDate(offer.validFrom, "UTC")} a {formatDate(offer.validTo, "UTC")}{offer.validityInferred ? " (fin inferido)" : ""}.</p>
              <p className="text-xs font-medium text-secondary">Tasas anuales por porción de capital, no sobre todo el saldo</p>
              <TierSchedule tiers={offer.tiers} />
              {offer.termsText ? <p className="whitespace-pre-wrap break-words text-xs text-secondary">{offer.termsText}</p> : null}
              {/^https:\/\//i.test(offer.sourceUrl) ? <a href={offer.sourceUrl} target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-accent)] underline">{offer.sourceLabel || "Consultar fuente"}<ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only"> (abre una pestaña nueva)</span></a> : <p className="text-xs text-muted">Fuente no disponible</p>}
              {current ? <p className="text-xs text-muted">Las condiciones especiales se confirman por tramo y solo para {formatMonthLabel(month)} en el plan mensual.</p> : null}
            </> : null}
            <div className="flex flex-wrap gap-2 border-t border-default pt-3">
              <Button type="button" variant="secondary" className={`${tableActionBaseClass} ${tableActionStyles.edit}`} onClick={() => onEdit(product)}>Editar</Button>
              <Button type="button" variant="secondary" className={`${tableActionBaseClass} ${tableActionStyles.edit}`} onClick={() => onLink(product)}>Vincular cuenta</Button>
              <Button type="button" variant={product.active ? "danger" : "secondary"} className={`${tableActionBaseClass} ${product.active ? tableActionStyles.deactivate : tableActionStyles.activate}`} onClick={() => onToggle(product)}>{product.active ? "Desactivar" : "Activar"}</Button>
            </div>
          </div>
        </details>
      </Card>;
    })}
  </div>;
}
