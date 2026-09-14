import type { Category } from "@/lib/contracts/categories";
import type { Subcategory } from "@/lib/contracts/subcategories";
import type { Merchant } from "@/lib/contracts/merchants";
import type { Tag } from "@/lib/contracts/tags";
import type { BillableParty } from "@/lib/contracts/billable-parties";
import { csrfFetch } from "@/lib/security/csrf-client";
import { parseApiError } from "@/lib/bff/client-session";

export async function requestJson(path: string, init: RequestInit, fallbackMessage: string): Promise<void> {
  const response = await csrfFetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    throw await parseApiError(response, fallbackMessage);
  }
}

async function fetchCatalogList<T>(path: string, fallbackMessage: string): Promise<T[]> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw await parseApiError(response, fallbackMessage);
  }

  return (await response.json()) as T[];
}

export function fetchCategories(): Promise<Category[]> {
  return fetchCatalogList<Category>("/api/bff/catalogs/categories", "No se pudieron cargar las categorías");
}

export function fetchSubcategories(): Promise<Subcategory[]> {
  return fetchCatalogList<Subcategory>("/api/bff/catalogs/subcategories", "No se pudieron cargar las subcategorías");
}

export function fetchMerchants(): Promise<Merchant[]> {
  return fetchCatalogList<Merchant>("/api/bff/catalogs/merchants", "No se pudieron cargar los comercios");
}

export function fetchTags(): Promise<Tag[]> {
  return fetchCatalogList<Tag>("/api/bff/catalogs/tags", "No se pudieron cargar los tags");
}

export function fetchBillableParties(): Promise<BillableParty[]> {
  return fetchCatalogList<BillableParty>("/api/bff/catalogs/billable-parties", "No se pudieron cargar los responsables cobrables");
}
