"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/navigation/admin-shell";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import type { CatalogSectionKey, CatalogsResponse } from "./_shared/catalogs-types";
import { fetchCatalogsBootstrap } from "./_shared/catalogs-api";
import { CategoriesSection } from "./categories/categories-section";
import { MerchantsSection } from "./merchants/merchants-section";
import { SubcategoriesSection } from "./subcategories/subcategories-section";
import { TagsSection } from "./tags/tags-section";
import { BillablePartiesSection } from "./billable-parties/billable-parties-section";

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
  const billableParties = catalogs?.billableParties ?? [];

  const totalCatalogItems = useMemo(
    () => categories.length + subcategories.length + merchants.length + tags.length + billableParties.length,
    [billableParties.length, categories.length, merchants.length, subcategories.length, tags.length]
  );

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

  useEffect(() => {
    if (!globalSuccess) {
      return;
    }

    const timeout = window.setTimeout(() => setGlobalSuccess(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [globalSuccess]);

  return (
    <AdminShell
      username={username}
      section="Catálogos"
      title="Gestión de catálogos"
      subtitle="Tablas unificadas con búsqueda, filtros, orden y estilos consistentes."
      meta={
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            {totalCatalogItems} elementos
          </span>
          <span className="rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            5 secciones
          </span>
        </div>
      }
    >
      <section className="space-y-4">

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

            <BillablePartiesSection
              billableParties={billableParties}
              expanded={expandedSection === "billableParties"}
              onToggle={() => toggleSection("billableParties")}
              onCatalogChanged={loadCatalogs}
              onError={setError}
              onSuccess={setGlobalSuccess}
            />
          </div>
        )}
      </section>
    </AdminShell>
  );
}
