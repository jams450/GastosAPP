"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JobRunDetail } from "@/lib/contracts/jobs";
import { fetchJobRun } from "../_lib/jobs-api";

const POLL_INTERVAL_MS = 5_000;

/**
 * Detalle de una corrida. Solo se refresca mientras el diálogo está abierto, la pestaña visible y la
 * corrida sigue `running`: una corrida cerrada ya no cambia y no necesita sondeo.
 */
export function useJobRunDetail(jobRunId: number | null) {
  const [detail, setDetail] = useState<JobRunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const detailRef = useRef<JobRunDetail | null>(null);

  const load = useCallback(async (id: number, mode: "initial" | "silent") => {
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    if (mode === "initial") setLoading(true);

    try {
      const next = await fetchJobRun(id);
      if (!mountedRef.current) return;
      detailRef.current = next;
      setDetail(next);
      setError(null);
    } catch (caught) {
      if (!mountedRef.current) return;
      if (mode === "initial") {
        setError(caught instanceof Error ? caught.message : "No se pudo leer la corrida.");
      }
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (jobRunId === null) {
      detailRef.current = null;
      setDetail(null);
      setError(null);
      setLoading(false);
      return;
    }

    detailRef.current = null;
    setDetail(null);
    setError(null);
    void load(jobRunId, "initial");

    const poll = () => {
      if (document.visibilityState !== "visible") return;
      if (detailRef.current?.status !== "running") return;
      void load(jobRunId, "silent");
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void load(jobRunId, "silent");
    };

    const interval = window.setInterval(poll, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [jobRunId, load]);

  const reload = useCallback(() => {
    if (jobRunId !== null) void load(jobRunId, "initial");
  }, [jobRunId, load]);

  return { detail, loading, error, reload };
}
