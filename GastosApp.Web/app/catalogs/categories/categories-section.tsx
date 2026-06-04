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
        <span className="text-secondary inline-flex items-center gap-1.5 text-xs">
          <span className="border-default h-2.5 w-2.5 rounded-full border" style={{ backgroundColor: row.original.color }} />
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
          <div className="flex justify-end gap-1.5">
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
                  className="input-semantic h-8 rounded-none px-2 text-xs"
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
        <div className="app-grid-skin overflow-hidden rounded-none p-0">
          <DataGrid
            columns={categoryColumns}
            rows={filteredRows}
            sorting={sorting}
            onSortingChange={setSorting}
            emptyMessage="Sin categorías"
            stickyActionsColumn
          />
        </div>
      </section>

      {categoryModalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-end bg-[var(--color-overlay)] p-0 backdrop-blur-sm sm:items-stretch">
          <Card className="app-sidebar relative flex h-[100dvh] w-full flex-col border-l p-0 sm:h-full sm:max-w-xl">
            <form className="flex h-full flex-col" onSubmit={(event) => void submitCategory(event)}>
              <div className="drawer-header-semantic">
                <h3 className="text-base font-semibold tracking-wide text-blue-700 dark:text-blue-300 sm:text-lg">{categoryForm.id ? "Editar categoría" : "Nueva categoría"}</h3>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                <section className="drawer-section-semantic space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">General</p>
                  <Input
                    label="Nombre *"
                    value={categoryForm.name}
                    onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))}
                    required
                  />
                  <Input
                    label="Color"
                    value={categoryForm.color}
                    onChange={(event) => setCategoryForm((current) => ({ ...current, color: event.target.value }))}
                    placeholder="#4f46e5"
                  />
                  <label className="grid gap-1.5 text-sm font-medium text-secondary">
                    Tipo
                    <select
                      value={categoryForm.type}
                      onChange={(event) => setCategoryForm((current) => ({ ...current, type: event.target.value as CategoryType }))}
                      className="input-semantic h-11 rounded-md px-3 text-sm"
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
                  <label className="text-secondary flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={categoryForm.active}
                      onChange={(event) => setCategoryForm((current) => ({ ...current, active: event.target.checked }))}
                    />
                    Activa
                  </label>
                </section>
              </div>

              <div className="drawer-footer-semantic">
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" className="h-9 rounded-md border-[var(--color-danger)]/50 bg-[var(--color-danger)]/15 text-[var(--color-danger)] hover:border-[var(--color-danger)]/70 hover:bg-[var(--color-danger)]/25" onClick={() => setCategoryModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" variant="ghost" loading={saving} loadingText="Guardando..." className="h-9 rounded-md border-blue-400/60 bg-blue-500/15 text-blue-700 hover:border-blue-500/70 hover:bg-blue-500/25 hover:text-blue-800 dark:border-blue-700/60 dark:bg-blue-500/25 dark:text-blue-300 dark:hover:border-blue-500/70 dark:hover:bg-blue-500/35 dark:hover:text-blue-100">
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
