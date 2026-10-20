"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DataGrid } from "@/components/data-grid/data-grid";
import { gridMeta } from "@/lib/ui/grid-responsive";
import { formatRateDate, rateLabel, type CurrencyRow } from "./_lib/currencies-model";

type Props = {
  rows: CurrencyRow[];
  canForceRefresh: boolean;
  onForceRefresh: () => Promise<void>;
};

/**
 * Solo lectura. Las divisas se siembran por migración y las tasas las escribe el job diario, así que no
 * hay alta, edición ni borrado que ofrecer: inventar un formulario aquí sugeriría una capacidad que el
 * backend no tiene. La única acción es adelantar la corrida del job.
 */
export function CurrenciesSection({ rows, canForceRefresh, onForceRefresh }: Props) {
  const [sorting, setSorting] = useState([{ id: "code", desc: false }]);
  const [refreshing, setRefreshing] = useState(false);

  const columns = useMemo<ColumnDef<CurrencyRow>[]>(
    () => [
      { accessorKey: "code", header: "Código", meta: gridMeta({ mobileRole: "title" }) },
      { accessorKey: "name", header: "Nombre", meta: gridMeta({ mobileRole: "subtitle" }) },
      { accessorKey: "symbol", header: "Símbolo", meta: gridMeta({ mobileLabel: "Símbolo", tabletHidden: true }) },
      { accessorKey: "decimals", header: "Decimales", meta: gridMeta({ mobileLabel: "Decimales", tabletHidden: true }) },
      {
        id: "rate",
        header: "Tasa (MXN)",
        // El valor ordenable es numérico; la celda muestra la etiqueta ya formateada.
        accessorFn: (row) => row.rateMxn ?? -1,
        cell: ({ row }) => rateLabel(row.original)
      },
      {
        id: "rateDate",
        header: "Fecha de la tasa",
        accessorFn: (row) => row.rateDate ?? "",
        cell: ({ row }) => formatRateDate(row.original.rateDate)
      },
      {
        id: "source",
        header: "Fuente",
        accessorFn: (row) => row.source ?? "",
        meta: gridMeta({ mobileLabel: "Fuente", tabletHidden: true }),
        cell: ({ row }) => row.original.source ?? "—"
      }
    ],
    []
  );

  async function handleForceRefresh() {
    setRefreshing(true);
    try {
      await onForceRefresh();
    } finally {
      // El resultado (éxito, "ya estaban al día" o error) lo comunica el contenedor por toast.
      setRefreshing(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-muted max-w-2xl text-xs">
          Las tasas se publican por día hábil. Cuando una fecha no tiene publicación, los importes usan la
          última tasa anterior y la muestran junto con su fecha.
        </p>

        {canForceRefresh ? (
          <Button
            type="button"
            variant="secondary"
            loading={refreshing}
            loadingText="Actualizando..."
            onClick={() => void handleForceRefresh()}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span>Actualizar tasas</span>
          </Button>
        ) : null}
      </div>

      <div className="app-grid-skin app-grid-skin-flat overflow-hidden rounded-none p-0">
        <DataGrid
          columns={columns}
          rows={rows}
          sorting={sorting}
          onSortingChange={setSorting}
          emptyMessage="Sin monedas en el catálogo"
        />
      </div>
    </section>
  );
}
