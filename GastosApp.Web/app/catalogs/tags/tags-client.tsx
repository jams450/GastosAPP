"use client";

import { CatalogSingleScreenClient } from "../_shared/catalog-single-screen-client";
import { fetchTags } from "../_shared/catalogs-api";
import { TagsSection } from "./tags-section";

type Props = { username: string };

export function TagsClient({ username }: Props) {
  return (
    <CatalogSingleScreenClient
      username={username}
      title="Catálogos · Tags"
      subtitle="Gestión individual de tags."
      loadData={fetchTags}
      renderSection={({ data, onDataChanged, onError, onSuccess }) => (
        <TagsSection tags={data} onCatalogChanged={onDataChanged} onError={onError} onSuccess={onSuccess} />
      )}
    />
  );
}
