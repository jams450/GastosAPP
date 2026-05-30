import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Tag } from "@/lib/contracts/tags";
import { requestJson } from "../_shared/catalogs-api";
import { SectionFilterBar } from "../_shared/section-filter-bar";
import { CatalogActionButton } from "../_shared/catalog-action-button";
import { StatusBadge } from "../_shared/status-badge";
import { useCatalogSectionState } from "../_shared/use-catalog-section-state";

type Props = {
  tags: Tag[];
  onCatalogChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  onSuccess: (message: string) => void;
};

type TagFormState = {
  id: number | null;
  name: string;
  active: boolean;
};

function emptyTagForm(): TagFormState {
  return { id: null, name: "", active: true };
}

function toTagRequestPayload(form: TagFormState) {
  return {
    name: form.name.trim(),
    active: form.active
  };
}

async function createTag(payload: ReturnType<typeof toTagRequestPayload>) {
  await requestJson("/api/bff/catalogs/tags", { method: "POST", body: JSON.stringify(payload) }, "No se pudo crear el tag");
}

async function updateTag(tagId: number, payload: ReturnType<typeof toTagRequestPayload>) {
  await requestJson(`/api/bff/catalogs/tags/${tagId}`, { method: "PUT", body: JSON.stringify(payload) }, "No se pudo actualizar el tag");
}

async function patchTagActive(tagId: number, active: boolean) {
  await requestJson(
    `/api/bff/catalogs/tags/${tagId}/active`,
    { method: "PATCH", body: JSON.stringify({ active }) },
    "No se pudo actualizar el estado del tag"
  );
}

export function TagsSection({ tags, onCatalogChanged, onError, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagForm, setTagForm] = useState<TagFormState>(emptyTagForm());

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
    rows: tags,
    initialSorting,
    searchPredicate: (row, normalizedQuery) => row.name.toLowerCase().includes(normalizedQuery),
    activePredicate: (row) => row.active
  });

  function openCreateTagModal() {
    setTagForm(emptyTagForm());
    setTagModalOpen(true);
    onError(null);
  }

  function openEditTagModal(tag: Tag) {
    setTagForm({ id: tag.tagId, name: tag.name, active: tag.active });
    setTagModalOpen(true);
    onError(null);
  }

  async function submitTag(event: FormEvent) {
    event.preventDefault();

    setSaving(true);
    onError(null);
    try {
      const payload = toTagRequestPayload(tagForm);

      if (tagForm.id) {
        await updateTag(tagForm.id, payload);
        onSuccess("Tag actualizado correctamente.");
      } else {
        await createTag(payload);
        onSuccess("Tag creado correctamente.");
      }

      setTagModalOpen(false);
      await onCatalogChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo guardar el tag");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTagActive(tag: Tag) {
    setSaving(true);
    onError(null);
    try {
      await patchTagActive(tag.tagId, !tag.active);
      onSuccess(`Tag ${!tag.active ? "activado" : "desactivado"}.`);
      await onCatalogChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo actualizar el tag");
    } finally {
      setSaving(false);
    }
  }

  const tagColumns: ColumnDef<Tag>[] = [
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
        const tag = row.original;
        return (
          <div className="flex items-center gap-1.5">
            <CatalogActionButton type="button" action="edit" label="Editar" onClick={() => openEditTagModal(tag)} />
            <CatalogActionButton
              type="button"
              action={tag.active ? "deactivate" : "activate"}
              label={tag.active ? "Desactivar" : "Activar"}
              onClick={() => void toggleTagActive(tag)}
              disabled={saving}
            />
          </div>
        );
      }
    }
  ];

  return (
    <>
      <section className="overflow-hidden px-4 py-3 sm:px-5">
        <SectionFilterBar
          searchPlaceholder="Buscar tag"
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
              onClick={openCreateTagModal}
            />
          }
        />
      </section>

      <section className="p-3 sm:p-4">
        <div className="users-desktop-table users-nextui-table overflow-hidden rounded-none p-0">
          <DataGrid
            columns={tagColumns}
            rows={filteredRows}
            sorting={sorting}
            onSortingChange={setSorting}
            emptyMessage="Sin tags"
          />
        </div>
      </section>

      {tagModalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-end bg-black/70 backdrop-blur-sm sm:items-stretch" role="presentation" onClick={() => setTagModalOpen(false)}>
          <Card className="relative flex h-[100dvh] w-full max-w-none flex-col border-l border-blue-500/40 bg-zinc-950 p-0 shadow-[0_0_40px_rgba(37,99,235,0.15)] sm:h-full sm:max-w-xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 border-b border-blue-500/30 bg-zinc-950/95 px-4 py-3 backdrop-blur sm:px-5 sm:py-4">
              <div className="mb-1 h-1 w-12 bg-blue-500/80 sm:hidden" />
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold text-zinc-100">{tagForm.id ? "Editar tag" : "Nuevo tag"}</h3>
                <Button type="button" variant="ghost" className="h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 text-zinc-200 hover:bg-zinc-800" onClick={() => setTagModalOpen(false)}>
                  Cerrar
                </Button>
              </div>
            </div>

            <form className="flex h-full flex-col" onSubmit={(event) => void submitTag(event)}>
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
                <section className="space-y-2 border border-zinc-800 p-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">General</h4>
                  <Input
                    label="Nombre"
                    value={tagForm.name}
                    onChange={(event) => setTagForm((current) => ({ ...current, name: event.target.value }))}
                    required
                    className="rounded-none border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
                  />
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input type="checkbox" checked={tagForm.active} onChange={(event) => setTagForm((current) => ({ ...current, active: event.target.checked }))} />
                    Activo
                  </label>
                </section>
              </div>

              <div className="border-t border-blue-500/30 bg-zinc-950/95 px-4 py-3 sm:px-5 sm:py-4">
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" className="h-8 rounded-md border-zinc-700 bg-zinc-900 px-3 text-xs font-bold" onClick={() => setTagModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" loading={saving} loadingText="Guardando..." className="h-8 rounded-md !border-[#0F3158] !bg-[#0F3158] px-3 text-xs font-bold text-white hover:!border-[#144277] hover:!bg-[#144277]">
                    {tagForm.id ? "Guardar cambios" : "Crear tag"}
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
