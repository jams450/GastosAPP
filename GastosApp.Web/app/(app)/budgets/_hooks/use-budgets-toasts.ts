"use client";

import { useCallback, useEffect, useState } from "react";
import type { BudgetsToast } from "../_components/budgets-toast-stack";

const TOAST_TTL_MS = 3200;

export function useBudgetsToasts() {
  const [toasts, setToasts] = useState<BudgetsToast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((message: string, variant: BudgetsToast["variant"]) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current.slice(-2), { id, message, variant }]);
  }, []);

  const success = useCallback((message: string) => pushToast(message, "success"), [pushToast]);
  const error = useCallback((message: string) => pushToast(message, "error"), [pushToast]);

  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToasts((current) => current.slice(1));
    }, TOAST_TTL_MS);

    return () => window.clearTimeout(timeout);
  }, [toasts]);

  return {
    toasts,
    dismissToast,
    success,
    error
  };
}
