"use client";

import { useEffect, useState } from "react";
import { AppMenu } from "@/components/navigation/app-menu";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import type { CatalogSectionKey, CatalogsResponse } from "./_shared/catalogs-types";
import { fetchCatalogsBootstrap } from "./_shared/catalogs-api";
import { CategoriesSection } from "./categories/categories-section";
import { MerchantsSection } from "./merchants/merchants-section";
import { SubcategoriesSection } from "./subcategories/subcategories-section";
import { TagsSection } from "./tags/tags-section";

type Props = {
  username: string;
};

export function CatalogsClient({ username }: Props) {
  const [catalogs, setCatalogs] = useState<CatalogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<CatalogSectionKey | null>("categories");

  function toggleSection(section: CatalogSectionKey) {
    setExpandedSection((current) => (current === section ? null : section));
  }

  const categories = catalogs?.categories ?? [];
  const subcategories = catalogs?.subcategories ?? [];
  const merchants = catalogs?.merchants ?? [];
  const tags = catalogs?.tags ?? [];

  async function loadCatalogs() {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchCatalogsBootstrap();
      setCatalogs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los catálogos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCatalogs();
  }, []);

  return (
    <main className="min-h-dvh bg-slate-100 px-4 py-8 dark:bg-slate-900 md:px-8">
      <section className="mx-auto w-full max-w-6xl space-y-4">
        <Card className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">Catálogos</p>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 md:text-2xl">Gestión de catálogos</h1>
              <p className="text-xs text-slate-600 dark:text-slate-400">Hola {username}. Base para tablas compactas y evolución a server-side.</p>
            </div>

            <AppMenu username={username} compact />
          </div>
        </Card>

        {error ? <Alert variant="danger">{error}</Alert> : null}
        {globalSuccess ? <Alert>{globalSuccess}</Alert> : null}

        {loading ? (
          <Card className="p-4">
            <p className="text-xs text-slate-600 dark:text-slate-400">Cargando catálogos...</p>
          </Card>
        ) : (
          <div className="space-y-3">
            <CategoriesSection
              categories={categories}
              expanded={expandedSection === "categories"}
              onToggle={() => toggleSection("categories")}
              onCatalogChanged={loadCatalogs}
              onError={setError}
              onSuccess={setGlobalSuccess}
            />

            <SubcategoriesSection
              categories={categories}
              subcategories={subcategories}
              expanded={expandedSection === "subcategories"}
              onToggle={() => toggleSection("subcategories")}
              onCatalogChanged={loadCatalogs}
              onError={setError}
              onSuccess={setGlobalSuccess}
            />

            <MerchantsSection
              merchants={merchants}
              expanded={expandedSection === "merchants"}
              onToggle={() => toggleSection("merchants")}
              onCatalogChanged={loadCatalogs}
              onError={setError}
              onSuccess={setGlobalSuccess}
            />

            <TagsSection
              tags={tags}
              expanded={expandedSection === "tags"}
              onToggle={() => toggleSection("tags")}
              onCatalogChanged={loadCatalogs}
              onError={setError}
              onSuccess={setGlobalSuccess}
            />
          </div>
        )}
      </section>
    </main>
  );
}
