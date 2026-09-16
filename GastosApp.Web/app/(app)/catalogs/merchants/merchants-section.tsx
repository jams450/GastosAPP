import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import type { Merchant } from "@/lib/contracts/merchants";
import { requestJson } from "../_shared/catalogs-api";
import { SectionFilterBar } from "../_shared/section-filter-bar";
import { CatalogActionButton } from "../_shared/catalog-action-button";
import { StatusBadge } from "../_shared/status-badge";
import { useCatalogSectionState } from "../_shared/use-catalog-section-state";

type Props = {
  merchants: Merchant[];
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

function toMerchantRequestPayload(form: MerchantFormState) {
  return {
    name: form.name.trim(),
    active: form.active
  };
}

async function createMerchant(payload: ReturnType<typeof toMerchantRequestPayload>) {
  await requestJson("/api/bff/catalogs/merchants", { method: "POST", body: JSON.stringify(payload) }, "No se pudo crear el comercio");
}

async function updateMerchant(merchantId: number, payload: ReturnType<typeof toMerchantRequestPayload>) {
  await requestJson(
    `/api/bff/catalogs/merchants/${merchantId}`,
    { method: "PUT", body: JSON.stringify(payload) },
    "No se pudo actualizar el comercio"
  );
}

async function patchMerchantActive(merchantId: number, active: boolean) {
  await requestJson(
    `/api/bff/catalogs/merchants/${merchantId}/active`,
    { method: "PATCH", body: JSON.stringify({ active }) },
    "No se pudo actualizar el estado del comercio"
  );
}

export function MerchantsSection({ merchants, onCatalogChanged, onError, onSuccess }: Props) {
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
      const payload = toMerchantRequestPayload(merchantForm);

      if (merchantForm.id) {
        await updateMerchant(merchantForm.id, payload);
        onSuccess("Comercio actualizado correctamente.");
      } else {
        await createMerchant(payload);
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
      await patchMerchantActive(merchant.merchantId, !merchant.active);
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
          <div className="flex justify-end gap-1.5">
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
      <section>
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

      <section>
        <div className="app-grid-skin app-grid-skin-flat overflow-hidden rounded-none p-0">
          <DataGrid
            columns={merchantColumns}
            rows={filteredRows}
            sorting={sorting}
            onSortingChange={setSorting}
            emptyMessage="Sin comercios"
          />
        </div>
      </section>

      {merchantModalOpen ? (
        <div className="drawer-enter-backdrop fixed inset-0 z-[70] flex items-end justify-end bg-[var(--color-overlay)] backdrop-blur-sm sm:items-stretch" role="presentation" onClick={() => setMerchantModalOpen(false)}>
          <Card className="drawer-enter-panel relative flex h-[100dvh] w-full max-w-none flex-col app-sidebar border-l p-0 sm:h-full sm:max-w-xl" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header-semantic">
              <div className="mb-1 h-1 w-12 bg-[var(--color-accent)]/70 sm:hidden" />
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-primary mt-1 text-lg font-semibold">{merchantForm.id ? "Editar comercio" : "Nuevo comercio"}</h3>
                <Button type="button" variant="ghost" className="btn-close-semantic" onClick={() => setMerchantModalOpen(false)}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Cerrar</span>
                </Button>
              </div>
            </div>

            <form className="flex h-full flex-col" onSubmit={(event) => void submitMerchant(event)}>
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
                <section className="drawer-section-semantic rounded-none border-[var(--color-border)] bg-[var(--color-surface-2)]">
                  <h4 className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">General</h4>
                  <Input
                    label="Nombre"
                    value={merchantForm.name}
                    onChange={(event) => setMerchantForm((current) => ({ ...current, name: event.target.value }))}
                    required
                    className="input-semantic rounded-none placeholder:text-muted"
                  />
                  <label className="text-secondary flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={merchantForm.active}
                      onChange={(event) => setMerchantForm((current) => ({ ...current, active: event.target.checked }))}
                    />
                    Activo
                  </label>
                </section>
              </div>

              <div className="drawer-footer-semantic">
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" className="h-8 rounded-none px-3 text-xs font-bold" onClick={() => setMerchantModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" variant="primary" loading={saving} loadingText="Guardando..." className="h-8 rounded-none px-3 text-xs font-bold">
                    {merchantForm.id ? "Guardar cambios" : "Crear comercio"}
                  </Button>
                </div>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </>
  );
}
