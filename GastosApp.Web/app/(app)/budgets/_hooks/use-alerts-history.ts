"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AlertDelivery, AlertOutboxEntry, AlertRetryResult } from "@/lib/contracts/alerts";
import { fetchAlertDeliveries, fetchFailedAlertOutbox, retryAlertOutbox } from "../_lib/budgets-api";

/**
 * Historial de entregas del periodo. El reintento se ofrece solo para entregas cuya fila de
 * outbox está en `failed`, cruzando `deliveryId`. Nunca se lee ni se muestra `payload`.
 */
export function useAlertsHistory(period: string, enabled: boolean) {
  const [deliveries, setDeliveries] = useState<AlertDelivery[]>([]);
  const [failedOutbox, setFailedOutbox] = useState<AlertOutboxEntry[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [history, failed] = await Promise.all([fetchAlertDeliveries(period), fetchFailedAlertOutbox()]);
      setDeliveries(history);
      setFailedOutbox(failed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el historial de alertas");
    } finally {
      setLoading(false);
    }
  }, [period, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const failedByDeliveryId = useMemo(
    () => new Map(failedOutbox.map((entry) => [entry.deliveryId, entry])),
    [failedOutbox]
  );

  const retry = useCallback(
    async (deliveryId: number): Promise<AlertRetryResult | null> => {
      const entry = failedByDeliveryId.get(deliveryId);
      if (!entry) {
        return null;
      }

      setRetryingId(entry.outboxId);
      try {
        const result = await retryAlertOutbox(entry.outboxId);
        await reload();
        return result;
      } finally {
        setRetryingId(null);
      }
    },
    [failedByDeliveryId, reload]
  );

  return {
    deliveries,
    failedByDeliveryId,
    loading,
    error,
    retryingId,
    reload,
    retry
  };
}
