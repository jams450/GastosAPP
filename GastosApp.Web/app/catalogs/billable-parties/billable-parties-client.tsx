"use client";

import { CatalogSingleScreenClient } from "../_shared/catalog-single-screen-client";
import { fetchBillableParties } from "../_shared/catalogs-api";
import { BillablePartiesSection } from "./billable-parties-section";

type Props = { username: string };

export function BillablePartiesClient({ username }: Props) {
  return (
    <CatalogSingleScreenClient
      username={username}
      title="Catálogos · Responsables cobrables"
      subtitle="Gestión individual de responsables cobrables."
      entityLabel="responsables"
      loadData={fetchBillableParties}
      countFromData={(billableParties) => billableParties.length}
      renderSection={({ data, onDataChanged, onError, onSuccess }) => (
        <BillablePartiesSection
          billableParties={data}
          expanded
          onToggle={() => {}}
          onCatalogChanged={onDataChanged}
          onError={onError}
          onSuccess={onSuccess}
        />
      )}
    />
  );
}
