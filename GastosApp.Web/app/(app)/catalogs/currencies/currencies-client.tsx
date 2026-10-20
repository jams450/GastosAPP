"use client";

import { CatalogSingleScreenClient } from "../_shared/catalog-single-screen-client";
import { fetchCurrencyRows } from "./_lib/currencies-api";
import { CurrenciesSection } from "./currencies-section";

type Props = { username: string };

export function CurrenciesClient({ username }: Props) {
  return (
    <CatalogSingleScreenClient
      username={username}
      title="Catálogos · Monedas"
      subtitle="Divisas disponibles y última tasa de cambio publicada."
      // Referencia estable de módulo: si fuera una función en línea, cada render reiniciaría la carga.
      loadData={fetchCurrencyRows}
      renderSection={({ data }) => <CurrenciesSection rows={data} />}
    />
  );
}
