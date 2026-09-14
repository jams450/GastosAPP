import { parseApiError } from "@/lib/bff/client-session";
import type { CatalogsResponse } from "../_lib/transactions-types";

export async function fetchTransactionsCatalogs(): Promise<CatalogsResponse> {
  const response = await fetch("/api/bff/transactions/catalogs", { cache: "no-store" });
  if (!response.ok) {
    throw await parseApiError(response, "No fue posible cargar catálogos");
  }

  return (await response.json()) as CatalogsResponse;
}
