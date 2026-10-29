"use client";

import { CatalogSingleScreenClient } from "../../catalogs/_shared/catalog-single-screen-client";
import { fetchEmailLabels } from "../_lib/email-labels-api";
import { LabelsSection } from "./labels-section";

type Props = { username: string };

export function LabelsClient({ username }: Props) {
  return (
    <CatalogSingleScreenClient
      username={username}
      title="Correo · Etiquetas"
      subtitle="Carpetas y etiquetas del clasificador. El comportamiento decide qué hace el motor con cada correo."
      loadData={fetchEmailLabels}
      renderSection={({ data, onDataChanged, onError, onSuccess }) => (
        <LabelsSection labels={data} onCatalogChanged={onDataChanged} onError={onError} onSuccess={onSuccess} />
      )}
    />
  );
}
