"use client";

import { useCallback, useEffect, useState } from "react";

export type JobsToast = {
  id: string;
  message: string;
  variant: "success" | "error" | "info";
};

const TOAST_TTL_MS = 5000;

/** Avisos efímeros de la pantalla; el estado operativo vive en el catálogo y el historial. */
export function useJobsToasts() {
  const [toasts, setToasts] = useState<JobsToast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback((message: string, variant: JobsToast["variant"]) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current.slice(-2), { id, message, variant }]);
  }, []);

  const success = useCallback((message: string) => pushToast(message, "success"), [pushToast]);
  const error = useCallback((message: string) => pushToast(message, "error"), [pushToast]);
  const info = useCallback((message: string) => pushToast(message, "info"), [pushToast]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timeout = window.setTimeout(() => {
      setToasts((current) => current.slice(1));
    }, TOAST_TTL_MS);
    return () => window.clearTimeout(timeout);
  }, [toasts]);

  return { toasts, dismissToast, success, error, info };
}
