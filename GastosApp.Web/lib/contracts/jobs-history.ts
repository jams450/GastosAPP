/**
 * Historial paginado y sus filtros (S1/L5).
 *
 * El historial solo crece (no hay retención destructiva en este primer módulo), así que la página y
 * su tamaño se acotan siempre. Las filas que no se pueden pintar se descartan una por una: una página
 * con 25 filas ilegibles no es un error del contrato, es un historial vacío.
 */

import { field, isRecord, toInteger, toNonNegativeInteger } from "./jobs-payload.ts";
import { normalizeJobRunSummary, type JobRunSummary } from "./jobs-runs.ts";
import {
  clampHistoryPage,
  clampHistoryPageSize,
  type JobKey,
  type JobStatus,
  type JobTrigger
} from "./jobs-vocabulary.ts";

export type JobHistoryPage = {
  items: JobRunSummary[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export function hasJobHistoryShape(input: unknown): boolean {
  return isRecord(input) && Array.isArray(field(input, "items"));
}

export function normalizeJobHistory(input: unknown, fallback: { page: number; pageSize: number }): JobHistoryPage {
  const fallbackPage = clampHistoryPage(fallback.page);
  const fallbackPageSize = clampHistoryPageSize(fallback.pageSize);

  if (!isRecord(input)) {
    return { items: [], page: fallbackPage, pageSize: fallbackPageSize, totalCount: 0, totalPages: 0 };
  }

  const rawItems = field(input, "items");
  const items = Array.isArray(rawItems)
    ? rawItems
        .map((raw) => normalizeJobRunSummary(raw))
        .filter((item): item is JobRunSummary => item !== null)
    : [];

  const page = toInteger(field(input, "page"));
  const pageSize = toInteger(field(input, "pageSize"));
  const totalCount = toNonNegativeInteger(field(input, "totalCount")) ?? 0;
  const effectivePageSize = clampHistoryPageSize(pageSize ?? fallbackPageSize);
  const reportedTotalPages = toNonNegativeInteger(field(input, "totalPages"));

  return {
    items,
    page: clampHistoryPage(page ?? fallbackPage),
    pageSize: effectivePageSize,
    totalCount,
    totalPages: reportedTotalPages ?? (totalCount <= 0 ? 0 : Math.ceil(totalCount / effectivePageSize))
  };
}

/* ------------------------------------------------------------------------- */
/* Filtros del historial                                                      */
/* ------------------------------------------------------------------------- */

export type JobHistoryFilterSelection = {
  jobKey: JobKey | "all";
  status: JobStatus | "all";
  trigger: JobTrigger | "all";
  page: number;
  pageSize: number;
};

/** Query string sin `?`, con orden estable para que la firma de los filtros sea comparable. */
export function buildJobHistoryQuery(filters: JobHistoryFilterSelection): string {
  const params = new URLSearchParams();
  if (filters.jobKey !== "all") params.set("jobKey", filters.jobKey);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.trigger !== "all") params.set("trigger", filters.trigger);
  params.set("page", String(clampHistoryPage(filters.page)));
  params.set("pageSize", String(clampHistoryPageSize(filters.pageSize)));
  return params.toString();
}
