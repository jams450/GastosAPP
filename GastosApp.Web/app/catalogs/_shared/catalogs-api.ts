import type { CatalogsResponse } from "./catalogs-types";
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

export async function fetchCatalogsBootstrap(): Promise<CatalogsResponse> {
  const response = await fetch("/api/bff/catalogs/bootstrap", { cache: "no-store" });
  if (!response.ok) {
    throw await parseApiError(response, "No se pudieron cargar los catálogos");
  }

  return (await response.json()) as CatalogsResponse;
}
