import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Merchant } from "@/lib/contracts/merchants";
import { requestJson } from "../_shared/catalogs-api";
import { SectionFilterBar } from "../_shared/section-filter-bar";
import { CatalogActionButton } from "../_shared/catalog-action-button";
import { StatusBadge } from "../_shared/status-badge";
import { useCatalogSectionState } from "../_shared/use-catalog-section-state";

type Props = {
  merchants: Merchant[];
  expanded: boolean;
  onToggle: () => void;
  onCatalogChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  onSuccess: (message: string) => void;
};

type MerchantFormState = {
  id: number | null;
  name: string;
  active: boolean;
};

function emptyMerchantForm(): MerchantFormState {
  return { id: null, name: "", active: true };
}

export function MerchantsSection({ merchants, expanded, onToggle, onCatalogChanged, onError, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [merchantModalOpen, setMerchantModalOpen] = useState(false);
  const [merchantForm, setMerchantForm] = useState<MerchantFormState>(emptyMerchantForm());

  const initialSorting = useMemo(() => [{ id: "name", desc: false }], []);
  const {
    filteredRows,
    searchQuery,
    setSearchQuery,
    activeFilter,
    setActiveFilter,
    sorting,
    setSorting,
    clearFilters
  } = useCatalogSectionState({
    rows: merchants,
    initialSorting,
    searchPredicate: (row, normalizedQuery) => row.name.toLowerCase().includes(normalizedQuery),
    activePredicate: (row) => row.active
  });

  function openCreateMerchantModal() {
    setMerchantForm(emptyMerchantForm());
    setMerchantModalOpen(true);
    onError(null);
  }

  function openEditMerchantModal(merchant: Merchant) {
    setMerchantForm({ id: merchant.merchantId, name: merchant.name, active: merchant.active });
    setMerchantModalOpen(true);
    onError(null);
  }

  async function submitMerchant(event: FormEvent) {
    event.preventDefault();

    setSaving(true);
    onError(null);
    try {
      const payload = {
        name: merchantForm.name,
        active: merchantForm.active
      };

      if (merchantForm.id) {
        await requestJson(
          `/api/bff/catalogs/merchants/${merchantForm.id}`,
          { method: "PUT", body: JSON.stringify(payload) },
          "No se pudo actualizar el comercio"
        );
        onSuccess("Comercio actualizado correctamente.");
      } else {
        await requestJson("/api/bff/catalogs/merchants", { method: "POST", body: JSON.stringify(payload) }, "No se pudo crear el comercio");
        onSuccess("Comercio creado correctamente.");
      }

      setMerchantModalOpen(false);
      await onCatalogChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo guardar el comercio");
    } finally {
      setSaving(false);
    }
  }

  async function toggleMerchantActive(merchant: Merchant) {
    setSaving(true);
    onError(null);
    try {
      await requestJson(
        `/api/bff/catalogs/merchants/${merchant.merchantId}/active`,
        { method: "PATCH", body: JSON.stringify({ active: !merchant.active }) },
        "No se pudo actualizar el estado del comercio"
      );
      onSuccess(`Comercio ${!merchant.active ? "activado" : "desactivado"}.`);
      await onCatalogChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo actualizar el comercio");
    } finally {
      setSaving(false);
    }
  }

  const merchantColumns: ColumnDef<Merchant>[] = [
    { accessorKey: "name", header: "Nombre" },
    {
      accessorKey: "active",
      header: "Estado",
      cell: ({ row }) => <StatusBadge active={row.original.active} />
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        const merchant = row.original;
        return (
          <div className="flex items-center gap-1.5">
            <CatalogActionButton type="button" action="edit" label="Editar" onClick={() => openEditMerchantModal(merchant)} />
            <CatalogActionButton
              type="button"
              action={merchant.active ? "deactivate" : "activate"}
              label={merchant.active ? "Desactivar" : "Activar"}
              onClick={() => void toggleMerchantActive(merchant)}
              disabled={saving}
            />
          </div>
        );
      }
    }
  ];

  return (
    <>
      {expanded ? (
        <>
          <section className="overflow-hidden px-4 py-3 sm:px-5">
            <SectionFilterBar
              searchPlaceholder="Buscar comercio"
              searchValue={searchQuery}
              onSearchChange={setSearchQuery}
              activeFilter={activeFilter}
              onActiveFilterChange={setActiveFilter}
              onClearFilters={clearFilters}
              hideFeedback
              actions={
                <CatalogActionButton
                  type="button"
                  action="create"
                  label="Nueva"
                  onClick={openCreateMerchantModal}
                />
              }
            />
          </section>

          <section className="p-3 sm:p-4">
            <div className="users-desktop-table users-nextui-table overflow-hidden rounded-none p-0">
              <DataGrid
                columns={merchantColumns}
                rows={filteredRows}
                sorting={sorting}
                onSortingChange={setSorting}
                emptyMessage="Sin comercios"
                allowDensityToggle
                densityStorageKey="catalogs-grid-density"
              />
            </div>
          </section>
        </>
      ) : null}

      {merchantModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-lg p-1">
            <form className="space-y-4" onSubmit={(event) => void submitMerchant(event)}>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{merchantForm.id ? "Editar comercio" : "Nuevo comercio"}</h3>
              <Input label="Nombre" value={merchantForm.name} onChange={(event) => setMerchantForm((current) => ({ ...current, name: event.target.value }))} required />
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={merchantForm.active}
                  onChange={(event) => setMerchantForm((current) => ({ ...current, active: event.target.checked }))}
                />
                Activo
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setMerchantModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" loading={saving} loadingText="Guardando...">
                  Guardar
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </>
  );
}
