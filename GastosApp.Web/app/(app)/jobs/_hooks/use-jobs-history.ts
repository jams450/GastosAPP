"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  JOB_HISTORY_DEFAULT_PAGE_SIZE,
  type JobHistoryFilterSelection,
  type JobHistoryPage,
  type JobKey,
  type JobStatus,
  type JobTrigger
} from "@/lib/contracts/jobs";
import { fetchJobHistory } from "../_lib/jobs-api";

const POLL_INTERVAL_MS = 20_000;

export const DEFAULT_HISTORY_FILTERS: JobHistoryFilterSelection = {
  jobKey: "all",
  status: "all",
  trigger: "all",
  page: 1,
  pageSize: JOB_HISTORY_DEFAULT_PAGE_SIZE
};

function signature(filters: JobHistoryFilterSelection): string {
  return `${filters.jobKey}|${filters.status}|${filters.trigger}|${filters.page}|${filters.pageSize}`;
}

/**
 * Historial paginado con filtros.
 *
 * - Una sola petición en vuelo. Si los filtros cambian mientras una lectura viaja, se encola la
 *   última selección en vez de lanzar otra en paralelo.
 * - La respuesta se aplica solo si su firma de filtros sigue siendo la actual: una respuesta que
 *   llega tarde no puede repintar la tabla con los filtros viejos.
 * - El sondeo se detiene cuando la pestaña se oculta o el componente se desmonta.
 */
export function useJobsHistory(initial: JobHistoryFilterSelection = DEFAULT_HISTORY_FILTERS) {
  const [filters, setFilters] = useState<JobHistoryFilterSelection>(initial);
  const [data, setData] = useState<JobHistoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const queuedRef = useRef<JobHistoryFilterSelection | null>(null);
  const filtersRef = useRef(filters);

  const run = useCallback(async (snapshot: JobHistoryFilterSelection, mode: "user" | "silent") => {
    if (inFlightRef.current) {
      queuedRef.current = snapshot;
      return;
    }

    inFlightRef.current = true;
    if (mode === "user") setLoading(true);

    try {
      const page = await fetchJobHistory(snapshot);
      if (!mountedRef.current) return;
      // Respuesta de una selección que ya no está en pantalla: se descarta.
      if (signature(snapshot) !== signature(filtersRef.current)) return;
      setData(page);
      setError(null);
    } catch (caught) {
      if (!mountedRef.current) return;
      if (mode === "user") {
        setError(caught instanceof Error ? caught.message : "No se pudo leer el historial de jobs.");
      }
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current && mode === "user") setLoading(false);

      const queued = queuedRef.current;
      queuedRef.current = null;
      if (queued && mountedRef.current) void run(queued, "user");
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    filtersRef.current = filters;
    void run(filters, "user");

    const poll = () => {
      if (document.visibilityState !== "visible") return;
      void run(filtersRef.current, "silent");
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void run(filtersRef.current, "silent");
    };

    const interval = window.setInterval(poll, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [filters, run]);

  const patchFilters = useCallback((patch: Partial<JobHistoryFilterSelection>) => {
    setFilters((current) => {
      const next: JobHistoryFilterSelection = { ...current, ...patch };
      const filterChanged =
        (patch.jobKey !== undefined && patch.jobKey !== current.jobKey) ||
        (patch.status !== undefined && patch.status !== current.status) ||
        (patch.trigger !== undefined && patch.trigger !== current.trigger);

      // Cambiar un filtro vuelve a la primera página: la página 7 de una selección nueva suele no
      // existir y la tabla quedaría vacía sin explicación.
      if (filterChanged) next.page = 1;
      return next;
    });
  }, []);

  const setJobKey = useCallback((jobKey: JobKey | "all") => patchFilters({ jobKey }), [patchFilters]);
  const setStatus = useCallback((status: JobStatus | "all") => patchFilters({ status }), [patchFilters]);
  const setTrigger = useCallback((trigger: JobTrigger | "all") => patchFilters({ trigger }), [patchFilters]);
  const setPage = useCallback((page: number) => patchFilters({ page }), [patchFilters]);
  const setPageSize = useCallback(
    (pageSize: number) => patchFilters({ pageSize, page: 1 }),
    [patchFilters]
  );
  const reload = useCallback(() => run(filtersRef.current, "user"), [run]);

  return {
    filters,
    data,
    loading,
    error,
    setJobKey,
    setStatus,
    setTrigger,
    setPage,
    setPageSize,
    patchFilters,
    reload
  };
}
