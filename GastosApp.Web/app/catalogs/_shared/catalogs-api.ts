import type { CatalogsResponse } from "./catalogs-types";

function redirectToLoginOnUnauthorized(response: Response): never {
  if (response.status === 401 && typeof window !== "undefined") {
    window.location.replace("/login?reason=session_expired");
  }

  throw new Error("Session expired");
}

export async function requestJson(path: string, init: RequestInit, fallbackMessage: string): Promise<void> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    if (response.status === 401) {
      redirectToLoginOnUnauthorized(response);
    }

    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? fallbackMessage);
  }
}

export async function fetchCatalogsBootstrap(): Promise<CatalogsResponse> {
  const response = await fetch("/api/bff/catalogs/bootstrap", { cache: "no-store" });
  if (!response.ok) {
    if (response.status === 401) {
      redirectToLoginOnUnauthorized(response);
    }

    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? "No se pudieron cargar los catálogos");
  }

  return (await response.json()) as CatalogsResponse;
}
