"use client";

import { CatalogSingleScreenClient } from "../_shared/catalog-single-screen-client";
import { fetchCurrencyRows, requestFxRateRefresh } from "./_lib/currencies-api";
import { describeSyncResult } from "./_lib/currencies-model";
import { CurrenciesSection } from "./currencies-section";

type Props = {
  username: string;
  canForceRefresh: boolean;
};

export function CurrenciesClient({ username, canForceRefresh }: Props) {
  return (
    <CatalogSingleScreenClient
      username={username}
      title="Catálogos · Monedas"
      subtitle="Divisas disponibles y última tasa de cambio publicada."
      // Referencia estable de módulo: si fuera una función en línea, cada render reiniciaría la carga.
      loadData={fetchCurrencyRows}
      renderSection={({ data, onDataChanged, onSuccess, onError }) => (
        <CurrenciesSection
          rows={data}
          canForceRefresh={canForceRefresh}
          onForceRefresh={async () => {
            try {
              const result = await requestFxRateRefresh();
              // Se recarga el catálogo después: el resultado solo trae conteos, no las tasas nuevas.
              await onDataChanged();
              onSuccess(describeSyncResult(result));
            } catch (error) {
              onError(
                error instanceof Error ? error.message : "No se pudieron actualizar los tipos de cambio"
              );
            }
          }}
        />
      )}
    />
  );
}
