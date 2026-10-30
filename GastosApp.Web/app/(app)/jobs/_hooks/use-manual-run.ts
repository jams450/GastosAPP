"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JobKey } from "@/lib/contracts/jobs";
import { requestManualRun, type ManualRunOutcome } from "../_lib/jobs-api";

export type ManualRunResult = ManualRunOutcome | { kind: "ignored" };

/**
 * Estado de la ejecución a demanda.
 *
 * - `pendingRef` es la guarda contra el doble envío: dos clics no abren dos corridas.
 * - Un resultado incierto (red o 502) deja el job **bloqueado** y publica un aviso: la única salida
 *   es revisar el historial y confirmarlo, nunca reintentar a ciegas.
 */
export function useManualRun() {
  const [pendingJobKey, setPendingJobKey] = useState<JobKey | null>(null);
  const [blockedJobKey, setBlockedJobKey] = useState<JobKey | null>(null);
  const [uncertainNotice, setUncertainNotice] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const pendingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async (jobKey: JobKey, reason: string | null): Promise<ManualRunResult> => {
    if (pendingRef.current) return { kind: "ignored" };

    pendingRef.current = true;
    if (mountedRef.current) setPendingJobKey(jobKey);

    try {
      const outcome = await requestManualRun(jobKey, reason);
      if (!mountedRef.current) return outcome;

      if (outcome.kind === "uncertain") {
        setBlockedJobKey(jobKey);
        setUncertainNotice(outcome.message);
      }

      return outcome;
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setPendingJobKey(null);
    }
  }, []);

  const acknowledgeUncertain = useCallback(() => {
    setBlockedJobKey(null);
    setUncertainNotice(null);
  }, []);

  return {
    run,
    pendingJobKey,
    blockedJobKey,
    uncertainNotice,
    acknowledgeUncertain,
    isPending: pendingJobKey !== null
  };
}
