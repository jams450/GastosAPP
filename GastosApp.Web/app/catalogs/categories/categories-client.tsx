"use client";

import { CatalogSingleScreenClient } from "../_shared/catalog-single-screen-client";
import { fetchCategories } from "../_shared/catalogs-api";
import { CategoriesSection } from "./categories-section";

type Props = { username: string };

export function CategoriesClient({ username }: Props) {
  return (
    <CatalogSingleScreenClient
      username={username}
      title="Catálogos · Categorías"
      subtitle="Gestión individual de categorías."
      entityLabel="categorías"
      loadData={fetchCategories}
      countFromData={(categories) => categories.length}
      renderSection={({ data, onDataChanged, onError, onSuccess }) => (
        <CategoriesSection
          categories={data}
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
