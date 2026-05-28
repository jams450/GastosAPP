"use client";

import type { Category } from "@/lib/contracts/categories";
import type { Subcategory } from "@/lib/contracts/subcategories";
import { CatalogSingleScreenClient } from "../_shared/catalog-single-screen-client";
import { fetchCategories, fetchSubcategories } from "../_shared/catalogs-api";
import { SubcategoriesSection } from "./subcategories-section";

type Props = { username: string };

type SubcategoriesScreenData = {
  categories: Category[];
  subcategories: Subcategory[];
};

async function loadSubcategoriesScreenData(): Promise<SubcategoriesScreenData> {
  const [subcategories, categories] = await Promise.all([fetchSubcategories(), fetchCategories()]);
  return { subcategories, categories };
}

export function SubcategoriesClient({ username }: Props) {
  return (
    <CatalogSingleScreenClient
      username={username}
      title="Catálogos · Subcategorías"
      subtitle="Gestión individual de subcategorías."
      entityLabel="subcategorías"
      loadData={loadSubcategoriesScreenData}
      countFromData={(data) => data.subcategories.length}
      renderSection={({ data, onDataChanged, onError, onSuccess }) => (
        <SubcategoriesSection
          categories={data.categories}
          subcategories={data.subcategories}
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
