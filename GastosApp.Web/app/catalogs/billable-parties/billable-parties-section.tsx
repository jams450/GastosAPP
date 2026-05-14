import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { BillableParty } from "@/lib/contracts/billable-parties";
import { requestJson } from "../_shared/catalogs-api";
import { SectionFilterBar } from "../_shared/section-filter-bar";
import { SortSummary } from "../_shared/sort-summary";
import { CatalogActionButton } from "../_shared/catalog-action-button";
import { SectionCard } from "../_shared/section-card";
import { StatusBadge } from "../_shared/status-badge";
import { useCatalogSectionState } from "../_shared/use-catalog-section-state";

type Props = {
  billableParties: BillableParty[];
  expanded: boolean;
  onToggle: () => void;
  onCatalogChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  onSuccess: (message: string) => void;
};

type FormState = { id: number | null; displayName: string; type: "self" | "system_user" | "external_person"; active: boolean; notes: string };

export function BillablePartiesSection({ billableParties, expanded, onToggle, onCatalogChanged, onError, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>({ id: null, displayName: "", type: "external_person", active: true, notes: "" });
  const { filteredRows, searchQuery, setSearchQuery, activeFilter, setActiveFilter, sorting, setSorting, clearFilters, clearSorting } = useCatalogSectionState({
    rows: billableParties,
    initialSorting: [{ id: "displayName", desc: false }],
    searchPredicate: (row, normalized) => row.displayName.toLowerCase().includes(normalized),
    activePredicate: (row) => row.active
  });

  const activeCount = useMemo(() => billableParties.filter((item) => item.active).length, [billableParties]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    onError(null);
    try {
      const payload = { displayName: form.displayName, type: form.type, active: form.active, notes: form.notes || undefined };
      if (form.id) {
        await requestJson(`/api/bff/catalogs/billable-parties/${form.id}`, { method: "PUT", body: JSON.stringify(payload) }, "No se pudo actualizar responsable");
        onSuccess("Responsable actualizado correctamente.");
      } else {
        await requestJson("/api/bff/catalogs/billable-parties", { method: "POST", body: JSON.stringify(payload) }, "No se pudo crear responsable");
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
      await requestJson(`/api/bff/catalogs/billable-parties/${item.billablePartyId}/active`, { method: "PATCH", body: JSON.stringify({ active: !item.active }) }, "No se pudo actualizar estado");
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
    { accessorKey: "type", header: "Tipo" },
    { accessorKey: "active", header: "Estado", cell: ({ row }) => <StatusBadge active={row.original.active} /> },
    {
      id: "actions", header: "Acciones", enableSorting: false,
      cell: ({ row }) => <div className="flex gap-1.5"><CatalogActionButton type="button" action="edit" label="Editar" onClick={() => { setForm({ id: row.original.billablePartyId, displayName: row.original.displayName, type: row.original.type, active: row.original.active, notes: row.original.notes ?? "" }); setOpen(true); }} /><CatalogActionButton type="button" action={row.original.active ? "deactivate" : "activate"} label={row.original.active ? "Desactivar" : "Activar"} onClick={() => void toggleActive(row.original)} disabled={saving} /></div>
    }
  ];

  return (
    <>
      <SectionCard id="catalog-section-billable-parties" title="Responsables cobrables" count={billableParties.length} activeCount={activeCount} inactiveCount={billableParties.length - activeCount} expanded={expanded} onToggle={onToggle} onCreate={() => { setForm({ id: null, displayName: "", type: "external_person", active: true, notes: "" }); setOpen(true); onError(null); }}>
        <DataGrid columns={columns} rows={filteredRows} sorting={sorting} onSortingChange={setSorting} emptyMessage="Sin responsables" allowDensityToggle densityStorageKey="catalogs-grid-density" toolbar={<div className="space-y-2"><SectionFilterBar searchPlaceholder="Buscar responsable" searchValue={searchQuery} onSearchChange={setSearchQuery} activeFilter={activeFilter} onActiveFilterChange={setActiveFilter} onClearFilters={clearFilters} /><SortSummary sorting={sorting} onClearSorting={clearSorting} labelsByColumnId={{ displayName: "Nombre", type: "Tipo", active: "Estado" }} /></div>} />
      </SectionCard>

      {open ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"><Card className="w-full max-w-lg p-1"><form className="space-y-4" onSubmit={(event) => void submit(event)}><h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{form.id ? "Editar responsable" : "Nuevo responsable"}</h3><Input label="Nombre" value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} required /><label className="grid gap-1 text-sm text-slate-700 dark:text-slate-300">Tipo<select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value === "self" || event.target.value === "system_user" ? event.target.value : "external_person" }))} className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="external_person">external_person</option><option value="system_user">system_user</option><option value="self">self</option></select></label><Input label="Notas" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /><label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} />Activo</label><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" loading={saving} loadingText="Guardando...">Guardar</Button></div></form></Card></div> : null}
    </>
  );
}
