"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format/currency";
import { formatRateDate } from "@/app/(app)/catalogs/currencies/_lib/currencies-model";
import type { CurrencyRateState } from "../../_lib/use-currency-rate";

type Props = {
  state: CurrencyRateState;
  amountNumber: number;
  amountIsValid: boolean;
};

/**
 * Divisa y tipo de cambio de un movimiento.
 *
 * La tasa viene resuelta del catálogo pero es editable: una publicación equivocada o un ajuste acordado
 * tienen que poder corregirse. Cuando el usuario la cambia se dice explícitamente que ya no es la
 * publicada, para que nadie crea que el valor lo puso Banxico.
 */
export function CurrencyRateField({ state, amountNumber, amountIsValid }: Props) {
  const {
    currencies,
    currencyCode,
    setCurrencyCode,
    fxRate,
    setFxRate,
    fxRateDate,
    suggestedRate,
    rateLoading,
    rateError,
    isCarryForward,
    isBaseCurrency,
    resetRate
  } = state;

  const rate = Number(fxRate);
  const rateIsValid = Number.isFinite(rate) && rate > 0;
  const wasEdited = suggestedRate !== null && rateIsValid && rate !== suggestedRate;
  const mxnTotal = isBaseCurrency ? amountNumber : rateIsValid ? amountNumber * rate : null;

  return (
    <div className="grid gap-3">
      <Select
        label="Divisa"
        value={currencyCode}
        onChange={(event) => setCurrencyCode(event.target.value)}
      >
        {currencies.length === 0 ? <option value="MXN">MXN · Peso mexicano</option> : null}
        {currencies.map((currency) => (
          <option key={currency.code} value={currency.code}>
            {currency.code} · {currency.name}
          </option>
        ))}
      </Select>

      {isBaseCurrency ? (
        <p className="text-muted px-1 text-xs">
          En pesos no hay tipo de cambio: el importe ya está en MXN.
        </p>
      ) : (
        <>
          <Input
            label={`Tipo de cambio (MXN por 1 ${currencyCode})`}
            type="number"
            step="0.000001"
            min="0.000001"
            value={fxRate}
            onChange={(event) => setFxRate(event.target.value)}
            placeholder={rateLoading ? "Cargando..." : "0.000000"}
            className="text-right"
            required
          />

          <div className="grid gap-1 px-1 text-xs">
            {rateLoading ? <span className="text-muted">Buscando la tasa publicada...</span> : null}

            {!rateLoading && rateError ? (
              <span className="text-[var(--color-danger)]">{rateError}</span>
            ) : null}

            {!rateLoading && !rateError && fxRateDate ? (
              <span className="text-muted">
                Tasa publicada el {formatRateDate(fxRateDate)}
                {isCarryForward ? " · es la última anterior a la fecha del movimiento" : ""}
              </span>
            ) : null}

            {wasEdited ? (
              <span className="text-muted">
                Modificaste la tasa publicada.{" "}
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto p-0 text-xs underline"
                  onClick={resetRate}
                >
                  Volver a {suggestedRate}
                </Button>
              </span>
            ) : null}

            {amountIsValid && mxnTotal !== null ? (
              <span className="text-lg font-semibold tabular-nums text-[var(--color-success)]">
                Equivale a {formatCurrency(mxnTotal, "es-MX", "MXN")}
              </span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
