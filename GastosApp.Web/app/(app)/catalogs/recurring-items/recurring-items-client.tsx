"use client";

import type { Account } from "@/lib/contracts/accounts";
import type { Category } from "@/lib/contracts/categories";
import type { Merchant } from "@/lib/contracts/merchants";
import type { RecurringItem, RecurringItemConfig } from "@/lib/contracts/recurring-items";
import type { Subcategory } from "@/lib/contracts/subcategories";
import { CatalogSingleScreenClient } from "../_shared/catalog-single-screen-client";
import { fetchRecurringItems } from "../_shared/catalogs-api";
import { RecurringItemsSection } from "./recurring-items-section";

type Props = { username: string };

type RecurringItemsScreenData = {
  items: RecurringItem[];
  catalogs: {
    accounts: Account[];
    categories: Category[];
    subcategories: Subcategory[];
    merchants: Merchant[];
  };
  config: RecurringItemConfig;
};

type RecurringItemsCatalogsResponse = {
  accounts?: Account[];
  categories?: Category[];
  subcategories?: Subcategory[];
  merchants?: Merchant[];
};

async function fetchRecurringItemsCatalogs(): Promise<RecurringItemsScreenData["catalogs"]> {
  const response = await fetch("/api/bff/recurring-items/catalogs", { cache: "no-store" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
    throw new Error(body?.message ?? body?.Message ?? "No se pudieron cargar los catálogos de la partida");
  }

  const payload = (await response.json()) as RecurringItemsCatalogsResponse;
  return {
    accounts: payload.accounts ?? [],
    categories: payload.categories ?? [],
    subcategories: payload.subcategories ?? [],
    merchants: payload.merchants ?? []
  };
}

async function fetchRecurringItemConfig(): Promise<RecurringItemConfig> {
  const response = await fetch("/api/bff/recurring-items/config", { cache: "no-store" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
    throw new Error(body?.message ?? body?.Message ?? "No se pudo cargar la configuración de ejecución automática");
  }

  const payload = (await response.json()) as RecurringItemConfig;
  return {
    autoExecuteAvailable: Boolean(payload.autoExecuteAvailable),
    reason: typeof payload.reason === "string" && payload.reason.trim().length > 0 ? payload.reason : null
  };
}

async function loadRecurringItemsScreenData(): Promise<RecurringItemsScreenData> {
  const [items, catalogs, config] = await Promise.all([
    fetchRecurringItems(),
    fetchRecurringItemsCatalogs(),
    fetchRecurringItemConfig()
  ]);

  return { items, catalogs, config };
}

export function RecurringItemsClient({ username }: Props) {
  return (
    <CatalogSingleScreenClient
      username={username}
      title="Catálogos · Programadas"
      subtitle="Gastos e ingresos programados que generan partidas cada mes."
      loadData={loadRecurringItemsScreenData}
      renderSection={({ data, onDataChanged, onError, onSuccess }) => (
        <RecurringItemsSection
          items={data.items}
          accounts={data.catalogs.accounts}
          categories={data.catalogs.categories}
          subcategories={data.catalogs.subcategories}
          merchants={data.catalogs.merchants}
          config={data.config}
          onCatalogChanged={onDataChanged}
          onError={onError}
          onSuccess={onSuccess}
        />
      )}
    />
  );
}
