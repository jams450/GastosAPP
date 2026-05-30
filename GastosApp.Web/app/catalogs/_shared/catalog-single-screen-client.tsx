"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/navigation/admin-shell";
import { Card } from "@/components/ui/card";
import { CatalogToastStack } from "./catalog-toast-stack";
import { useCatalogToasts } from "./use-catalog-toasts";

type ScreenProps<TData> = {
  username: string;
  title: string;
  subtitle?: string;
  loadData: () => Promise<TData>;
  renderSection: (args: {
    data: TData;
    onDataChanged: () => Promise<void>;
    onError: (message: string | null) => void;
    onSuccess: (message: string) => void;
  }) => ReactNode;
};

export function CatalogSingleScreenClient<TData>({
  username,
  title,
  subtitle,
  loadData,
  renderSection
}: ScreenProps<TData>) {
  const [data, setData] = useState<TData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toasts, dismissToast, success, error: errorToast } = useCatalogToasts();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextData = await loadData();
      setData(nextData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los datos del catálogo");
    } finally {
      setLoading(false);
    }
  }, [loadData]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!error) {
      return;
    }

    errorToast(error);
    setError(null);
  }, [error, errorToast]);

  return (
    <AdminShell
      username={username}
      section="Catálogos"
      title={title}
      subtitle={subtitle}
    >
      <CatalogToastStack toasts={toasts} onDismiss={dismissToast} />

      <section className="space-y-2 md:space-y-2">
        {loading || !data ? (
          <Card className="p-4">
            <p className="text-xs text-slate-600 dark:text-slate-400">Cargando catálogo...</p>
          </Card>
        ) : (
          renderSection({
            data,
            onDataChanged: refresh,
            onError: setError,
            onSuccess: success
          })
        )}
      </section>
    </AdminShell>
  );
}
