"use client";

import { CatalogSingleScreenClient } from "../_shared/catalog-single-screen-client";
import { fetchMerchants } from "../_shared/catalogs-api";
import { MerchantsSection } from "./merchants-section";

type Props = { username: string };

export function MerchantsClient({ username }: Props) {
  return (
    <CatalogSingleScreenClient
      username={username}
      title="Catálogos · Comercios"
      subtitle="Gestión individual de comercios."
      loadData={fetchMerchants}
      renderSection={({ data, onDataChanged, onError, onSuccess }) => (
        <MerchantsSection
          merchants={data}
          onCatalogChanged={onDataChanged}
          onError={onError}
          onSuccess={onSuccess}
        />
      )}
    />
  );
}
