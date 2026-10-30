"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JobOverview } from "@/lib/contracts/jobs";
import { fetchJobsOverview } from "../_lib/jobs-api";

/** El catálogo es barato (un agregado por job) y alimenta estados en vivo; 15 s alcanza. */
const POLL_INTERVAL_MS = 15_000;

/**
 * Catálogo con refresco periódico **solo** mientras la pestaña está montada y visible.
 *
 * Dos guardas que la pantalla necesita para no mentir:
 * - una sola lectura en vuelo: dos respuestas que llegan en desorden pintarían un estado viejo;
 * - oculta la pestaña no se encuesta, y al volver se refresca de inmediato, así que no se muestra un
 *   "en ejecución" congelado de hace media hora.
 */
export function useJobsCatalog() {
  const [overview, setOverview] = useState<JobOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const hasDataRef = useRef(false);
  const queuedRef = useRef<"initial" | "silent" | null>(null);

  const load = useCallback(async (mode: "initial" | "silent") => {
    if (inFlightRef.current) {
      // Un refresco silencioso no reemplaza al que está en vuelo; uno inicial sí se reintenta.
      if (mode === "initial") queuedRef.current = mode;
      return;
    }

    inFlightRef.current = true;
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const next = await fetchJobsOverview();
      if (!mountedRef.current) return;
      hasDataRef.current = true;
      setOverview(next);
      setError(null);
    } catch (caught) {
      if (!mountedRef.current) return;
      // Un refresco silencioso conserva el último catálogo conocido: vaciar la pantalla por un
      // timeout momentáneo es peor que mostrar el estado anterior con la marca de "actualizando".
      if (!hasDataRef.current) {
        setError(caught instanceof Error ? caught.message : "No se pudo leer el catálogo de jobs.");
      }
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }

      const queued = queuedRef.current;
      queuedRef.current = null;
      if (queued && mountedRef.current) void load(queued);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load("initial");

    const poll = () => {
      if (document.visibilityState === "visible") void load("silent");
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void load("silent");
    };

    const interval = window.setInterval(poll, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load]);

  const refresh = useCallback(() => load("silent"), [load]);

  return { overview, loading, refreshing, error, refresh };
}
