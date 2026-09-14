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
      loadData={fetchCategories}
      renderSection={({ data, onDataChanged, onError, onSuccess }) => (
        <CategoriesSection
          categories={data}
          onCatalogChanged={onDataChanged}
          onError={onError}
          onSuccess={onSuccess}
        />
      )}
    />
  );
}
