import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import type { FormEvent } from "react";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { BillableParty } from "@/lib/contracts/billable-parties";
import { requestJson } from "../_shared/catalogs-api";
import { SectionFilterBar } from "../_shared/section-filter-bar";
import { CatalogActionButton } from "../_shared/catalog-action-button";
import { StatusBadge } from "../_shared/status-badge";
import { useCatalogSectionState } from "../_shared/use-catalog-section-state";

type Props = {
  billableParties: BillableParty[];
  onCatalogChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  onSuccess: (message: string) => void;
};

type BillablePartyType = "self" | "system_user" | "external_person";

type FormState = {
  id: number | null;
  displayName: string;
  type: BillablePartyType;
  active: boolean;
  notes: string;
};

const billablePartyTypeLabel: Record<BillablePartyType, string> = {
  self: "Yo",
  system_user: "Usuario del sistema",
  external_person: "Externo"
};

function emptyForm(): FormState {
  return { id: null, displayName: "", type: "external_person", active: true, notes: "" };
}

function toBillablePartyRequestPayload(form: FormState) {
  return {
    displayName: form.displayName.trim(),
    type: form.type,
    active: form.active,
    notes: form.notes.trim() || undefined
  };
}

async function createBillableParty(payload: ReturnType<typeof toBillablePartyRequestPayload>) {
  await requestJson("/api/bff/catalogs/billable-parties", { method: "POST", body: JSON.stringify(payload) }, "No se pudo crear responsable");
}

async function updateBillableParty(billablePartyId: number, payload: ReturnType<typeof toBillablePartyRequestPayload>) {
  await requestJson(
    `/api/bff/catalogs/billable-parties/${billablePartyId}`,
    { method: "PUT", body: JSON.stringify(payload) },
    "No se pudo actualizar responsable"
  );
}

async function patchBillablePartyActive(billablePartyId: number, active: boolean) {
  await requestJson(
    `/api/bff/catalogs/billable-parties/${billablePartyId}/active`,
    { method: "PATCH", body: JSON.stringify({ active }) },
    "No se pudo actualizar estado"
  );
}

export function BillablePartiesSection({ billableParties, onCatalogChanged, onError, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const { filteredRows, searchQuery, setSearchQuery, activeFilter, setActiveFilter, sorting, setSorting, clearFilters } = useCatalogSectionState({
    rows: billableParties,
    initialSorting: [{ id: "displayName", desc: false }],
    searchPredicate: (row, normalized) => row.displayName.toLowerCase().includes(normalized),
    activePredicate: (row) => row.active
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    onError(null);
    try {
      const payload = toBillablePartyRequestPayload(form);
      if (form.id) {
        await updateBillableParty(form.id, payload);
        onSuccess("Responsable actualizado correctamente.");
      } else {
        await createBillableParty(payload);
        onSuccess("Responsable creado correctamente.");
      }
      setOpen(false);
      await onCatalogChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo guardar responsable");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: BillableParty) {
    setSaving(true);
    onError(null);
    try {
      await patchBillablePartyActive(item.billablePartyId, !item.active);
      onSuccess(`Responsable ${item.active ? "desactivado" : "activado"}.`);
      await onCatalogChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo actualizar responsable");
    } finally {
      setSaving(false);
    }
  }

  const columns: ColumnDef<BillableParty>[] = [
    { accessorKey: "displayName", header: "Nombre" },
    {
      accessorKey: "type",
      header: "Tipo",
      cell: ({ row }) => billablePartyTypeLabel[(row.original.type as BillablePartyType) ?? "external_person"]
    },
    { accessorKey: "active", header: "Estado", cell: ({ row }) => <StatusBadge active={row.original.active} /> },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1.5">
          <CatalogActionButton
            type="button"
            action="edit"
            label="Editar"
            onClick={() => {
              setForm({
                id: row.original.billablePartyId,
                displayName: row.original.displayName,
                type: row.original.type,
                active: row.original.active,
                notes: row.original.notes ?? ""
              });
              setOpen(true);
            }}
          />
          <CatalogActionButton
            type="button"
            action={row.original.active ? "deactivate" : "activate"}
            label={row.original.active ? "Desactivar" : "Activar"}
            onClick={() => void toggleActive(row.original)}
            disabled={saving}
          />
        </div>
      )
    }
  ];

  return (
    <>
      <section className="overflow-hidden px-4 py-3 sm:px-5">
        <SectionFilterBar
          searchPlaceholder="Buscar responsable"
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
              onClick={() => {
                setForm(emptyForm());
                setOpen(true);
                onError(null);
              }}
            />
          }
        />
      </section>

      <section className="p-3 sm:p-4">
        <div className="app-grid-skin overflow-hidden rounded-none p-0">
          <DataGrid
            columns={columns}
            rows={filteredRows}
            sorting={sorting}
            onSortingChange={setSorting}
            emptyMessage="Sin responsables cobrables"
            stickyActionsColumn
          />
        </div>
      </section>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-end bg-[var(--color-overlay)] backdrop-blur-sm sm:items-stretch" role="presentation" onClick={() => setOpen(false)}>
          <Card className="relative flex h-[100dvh] w-full max-w-none flex-col app-sidebar border-l p-0 sm:h-full sm:max-w-xl" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header-semantic">
              <div className="mb-1 h-1 w-12 bg-[var(--color-accent)]/70 sm:hidden" />
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-300">{form.id ? "Editar responsable" : "Nuevo responsable"}</h3>
                <Button type="button" variant="ghost" className="btn-close-semantic" onClick={() => setOpen(false)}>
                  <span>✕</span>
                  <span>Cerrar</span>
                </Button>
              </div>
            </div>

            <form className="flex h-full flex-col" onSubmit={(event) => void submit(event)}>
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
                <section className="space-y-2 rounded-2xl border border-blue-200/60 bg-blue-50/35 p-3 dark:border-blue-900/50 dark:bg-blue-950/20">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">General</h4>
                  <Input
                    label="Nombre"
                    value={form.displayName}
                    onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
                    required
                    className="input-semantic rounded-none placeholder:text-muted"
                  />
                  <label className="text-secondary grid gap-1.5 text-sm font-medium">
                    Tipo
                    <select
                      value={form.type}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          type: event.target.value === "self" || event.target.value === "system_user" ? event.target.value : "external_person"
                        }))
                      }
                      className="input-semantic h-10 rounded-none px-3 text-sm"
                    >
                      <option value="external_person">Externo</option>
                      <option value="system_user">Usuario del sistema</option>
                      <option value="self">Yo</option>
                    </select>
                  </label>
                  <Input
                    label="Notas"
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                    className="input-semantic rounded-none placeholder:text-muted"
                  />
                  <label className="text-secondary flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} />
                    Activo
                  </label>
                </section>
              </div>

              <div className="drawer-footer-semantic">
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" className="h-8 rounded-md border-[var(--color-danger)]/50 bg-[var(--color-danger)]/15 px-3 text-xs font-bold text-[var(--color-danger)] hover:border-[var(--color-danger)]/70 hover:bg-[var(--color-danger)]/25" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" variant="ghost" loading={saving} loadingText="Guardando..." className="h-8 rounded-md border-blue-400/60 bg-blue-500/15 px-3 text-xs font-bold text-blue-700 hover:border-blue-500/70 hover:bg-blue-500/25 hover:text-blue-800 dark:border-blue-700/60 dark:bg-blue-500/25 dark:text-blue-300 dark:hover:border-blue-500/70 dark:hover:bg-blue-500/35 dark:hover:text-blue-100">
                    {form.id ? "Guardar cambios" : "Crear responsable"}
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
