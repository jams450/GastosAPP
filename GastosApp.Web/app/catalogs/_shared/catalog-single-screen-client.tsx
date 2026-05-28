"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/navigation/admin-shell";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";

type ScreenProps<TData> = {
  username: string;
  title: string;
  subtitle: string;
  entityLabel: string;
  loadData: () => Promise<TData>;
  countFromData: (data: TData) => number;
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
  entityLabel,
  loadData,
  countFromData,
  renderSection
}: ScreenProps<TData>) {
  const [data, setData] = useState<TData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const itemCount = data ? countFromData(data) : 0;

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
    if (!success) {
      return;
    }

    const timeout = window.setTimeout(() => setSuccess(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [success]);

  return (
    <AdminShell
      username={username}
      section="Catálogos"
      title={title}
      subtitle={subtitle}
      meta={
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            {itemCount} {entityLabel}
          </span>
          <span className="rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            Vista individual
          </span>
        </div>
      }
    >
      <section className="space-y-4">
        {error ? <Alert variant="danger">{error}</Alert> : null}
        {success ? <Alert>{success}</Alert> : null}

        {loading || !data ? (
          <Card className="p-4">
            <p className="text-xs text-slate-600 dark:text-slate-400">Cargando catálogo...</p>
          </Card>
        ) : (
          renderSection({
            data,
            onDataChanged: refresh,
            onError: setError,
            onSuccess: setSuccess
          })
        )}
      </section>
    </AdminShell>
  );
}
