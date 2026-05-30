import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Category, CategoryType } from "@/lib/contracts/categories";
import { requestJson } from "../_shared/catalogs-api";
import { SectionFilterBar } from "../_shared/section-filter-bar";
import { CatalogActionButton } from "../_shared/catalog-action-button";
import { StatusBadge } from "../_shared/status-badge";
import { useCatalogSectionState } from "../_shared/use-catalog-section-state";

type Props = {
  categories: Category[];
  onCatalogChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  onSuccess: (message: string) => void;
};

type CategoryFormState = {
  id: number | null;
  name: string;
  color: string;
  type: CategoryType;
  active: boolean;
  tagsText: string;
};

const categoryTypeLabel: Record<CategoryType, string> = {
  income: "Ingreso",
  expense: "Gasto",
  transfer: "Transferencia"
};

function parseTags(tagsText: string): string[] {
  return [...new Set(tagsText.split(",").map((part) => part.trim()).filter(Boolean))].slice(0, 20);
}

function toCategoryRequestPayload(form: CategoryFormState) {
  return {
    name: form.name.trim(),
    color: form.color,
    type: form.type,
    active: form.active,
    tags: parseTags(form.tagsText)
  };
}

async function createCategory(payload: ReturnType<typeof toCategoryRequestPayload>) {
  await requestJson("/api/bff/catalogs/categories", { method: "POST", body: JSON.stringify(payload) }, "No se pudo crear la categoría");
}

async function updateCategory(categoryId: number, payload: ReturnType<typeof toCategoryRequestPayload>) {
  await requestJson(
    `/api/bff/catalogs/categories/${categoryId}`,
    { method: "PUT", body: JSON.stringify(payload) },
    "No se pudo actualizar la categoría"
  );
}

async function patchCategoryActive(categoryId: number, active: boolean) {
  await requestJson(
    `/api/bff/catalogs/categories/${categoryId}/active`,
    { method: "PATCH", body: JSON.stringify({ active }) },
    "No se pudo actualizar el estado de la categoría"
  );
}

function emptyCategoryForm(): CategoryFormState {
  return {
    id: null,
    name: "",
    color: "#000000",
    type: "expense",
    active: true,
    tagsText: ""
  };
}

export function CategoriesSection({ categories, onCatalogChanged, onError, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm());
  const [typeFilter, setTypeFilter] = useState<CategoryType | "all">("all");

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
    rows: categories,
    initialSorting,
    searchPredicate: (row, normalizedQuery) => row.name.toLowerCase().includes(normalizedQuery) || row.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery)),
    activePredicate: (row) => row.active,
    extraFilterPredicate: (row) => (typeFilter === "all" ? true : row.type === typeFilter)
  });

  function clearAllFilters() {
    clearFilters();
    setTypeFilter("all");
  }

  function openCreateCategoryModal() {
    setCategoryForm(emptyCategoryForm());
    setCategoryModalOpen(true);
    onError(null);
  }

  function openEditCategoryModal(category: Category) {
    setCategoryForm({
      id: category.categoryId,
      name: category.name,
      color: category.color,
      type: category.type,
      active: category.active,
      tagsText: category.tags.join(", ")
    });
    setCategoryModalOpen(true);
    onError(null);
  }

  async function submitCategory(event: FormEvent) {
    event.preventDefault();

    setSaving(true);
    onError(null);
    try {
      const payload = toCategoryRequestPayload(categoryForm);

      if (categoryForm.id) {
        await updateCategory(categoryForm.id, payload);
        onSuccess("Categoría actualizada correctamente.");
      } else {
        await createCategory(payload);
        onSuccess("Categoría creada correctamente.");
      }

      setCategoryModalOpen(false);
      await onCatalogChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo guardar la categoría");
    } finally {
      setSaving(false);
    }
  }

  async function toggleCategoryActive(category: Category) {
    setSaving(true);
    onError(null);
    try {
      await patchCategoryActive(category.categoryId, !category.active);
      onSuccess(`Categoría ${!category.active ? "activada" : "desactivada"}.`);
      await onCatalogChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo actualizar la categoría");
    } finally {
      setSaving(false);
    }
  }

  const categoryColumns: ColumnDef<Category>[] = [
    { accessorKey: "name", header: "Nombre" },
    {
      accessorKey: "type",
      header: "Tipo",
      cell: ({ row }) => categoryTypeLabel[row.original.type]
    },
    {
      accessorKey: "color",
      header: "Color",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
          <span className="h-2.5 w-2.5 rounded-full border border-slate-300" style={{ backgroundColor: row.original.color }} />
          {row.original.color}
        </span>
      )
    },
    {
      id: "tags",
      header: "Tags",
      accessorFn: (row) => row.tags.length,
      cell: ({ row }) => row.original.tags.length
    },
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
        const category = row.original;
        return (
          <div className="flex items-center gap-1.5">
            <CatalogActionButton type="button" action="edit" label="Editar" onClick={() => openEditCategoryModal(category)} />
            <CatalogActionButton
              type="button"
              action={category.active ? "deactivate" : "activate"}
              label={category.active ? "Desactivar" : "Activar"}
              onClick={() => void toggleCategoryActive(category)}
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
          searchPlaceholder="Buscar por nombre o tag"
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          activeFilter={activeFilter}
          onActiveFilterChange={setActiveFilter}
          onClearFilters={clearAllFilters}
          extraFilters={[
            {
              label: "Tipo",
              content: (
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value as CategoryType | "all")}
                  className="h-8 rounded-none border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 outline-none transition focus:border-zinc-500 focus:ring-1 focus:ring-zinc-600"
                >
                  <option value="all">Todos</option>
                  <option value="income">Ingreso</option>
                  <option value="expense">Gasto</option>
                  <option value="transfer">Transferencia</option>
                </select>
              )
            }
          ]}
          chips={
            typeFilter !== "all"
              ? [
                  {
                    id: "type",
                    label: `Tipo: ${categoryTypeLabel[typeFilter]}`,
                    onClear: () => setTypeFilter("all")
                  }
                ]
              : undefined
          }
          hideFeedback
          actions={
            <CatalogActionButton
              type="button"
              action="create"
              label="Nueva"
              onClick={openCreateCategoryModal}
            />
          }
        />
      </section>

      <section className="p-3 sm:p-4">
        <div className="users-desktop-table users-nextui-table overflow-hidden rounded-none p-0">
          <DataGrid
            columns={categoryColumns}
            rows={filteredRows}
            sorting={sorting}
            onSortingChange={setSorting}
            emptyMessage="Sin categorías"
          />
        </div>
      </section>

      {categoryModalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-end bg-black/70 p-0 backdrop-blur-sm sm:items-stretch">
          <Card className="relative flex h-[100dvh] w-full flex-col rounded-none border-l border-blue-500/40 bg-zinc-950 p-0 shadow-[0_0_40px_rgba(37,99,235,0.15)] sm:h-full sm:max-w-xl">
            <form className="flex h-full flex-col" onSubmit={(event) => void submitCategory(event)}>
              <div className="sticky top-0 z-10 border-b border-blue-500/30 bg-zinc-950/95 px-4 py-3 sm:px-5 sm:py-4">
                <div className="mb-1 h-1 w-12 bg-blue-500/80 sm:hidden" aria-hidden="true" />
                <h3 className="text-base font-semibold tracking-wide text-zinc-100 sm:text-lg">{categoryForm.id ? "Editar categoría" : "Nueva categoría"}</h3>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
              <Input label="Nombre" value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} required />
              <Input label="Color" type="color" value={categoryForm.color} onChange={(event) => setCategoryForm((current) => ({ ...current, color: event.target.value }))} />
              <label className="grid gap-1.5 text-sm font-medium text-zinc-300">
                Tipo
                <select
                  value={categoryForm.type}
                  onChange={(event) => setCategoryForm((current) => ({ ...current, type: event.target.value as CategoryType }))}
                  className="h-11 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-600"
                >
                  <option value="income">Ingreso</option>
                  <option value="expense">Gasto</option>
                  <option value="transfer">Transferencia</option>
                </select>
              </label>
              <Input
                label="Tags (separados por coma)"
                value={categoryForm.tagsText}
                onChange={(event) => setCategoryForm((current) => ({ ...current, tagsText: event.target.value }))}
                placeholder="steam, fanatical, oferta"
              />
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={categoryForm.active}
                  onChange={(event) => setCategoryForm((current) => ({ ...current, active: event.target.checked }))}
                />
                Activa
              </label>
              </div>
              <div className="border-t border-blue-500/30 bg-zinc-950/95 px-4 py-3 sm:px-5 sm:py-4">
                <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" className="h-9 rounded-md border-zinc-700 bg-zinc-900 text-zinc-100 hover:border-zinc-600 hover:bg-zinc-800" onClick={() => setCategoryModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" loading={saving} loadingText="Guardando..." className="h-9 rounded-md !border-[#0F3158] !bg-[#0F3158] text-white hover:!border-[#144277] hover:!bg-[#144277]">
                  Guardar
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
