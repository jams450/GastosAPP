import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Category, CategoryType } from "@/lib/contracts/categories";
import { requestJson } from "../_shared/catalogs-api";
import { SectionFilterBar } from "../_shared/section-filter-bar";
import { SortSummary } from "../_shared/sort-summary";
import { CatalogActionButton } from "../_shared/catalog-action-button";
import { SectionCard } from "../_shared/section-card";
import { StatusBadge } from "../_shared/status-badge";
import { useCatalogSectionState } from "../_shared/use-catalog-section-state";

type Props = {
  categories: Category[];
  expanded: boolean;
  onToggle: () => void;
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

export function CategoriesSection({ categories, expanded, onToggle, onCatalogChanged, onError, onSuccess }: Props) {
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
    clearFilters,
    clearSorting
  } = useCatalogSectionState({
    rows: categories,
    initialSorting,
    searchPredicate: (row, normalizedQuery) => row.name.toLowerCase().includes(normalizedQuery) || row.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery)),
    activePredicate: (row) => row.active,
    extraFilterPredicate: (row) => (typeFilter === "all" ? true : row.type === typeFilter)
  });

  const activeCount = useMemo(() => categories.filter((category) => category.active).length, [categories]);
  const inactiveCount = categories.length - activeCount;

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
      const payload = {
        name: categoryForm.name,
        color: categoryForm.color,
        type: categoryForm.type,
        active: categoryForm.active,
        tags: parseTags(categoryForm.tagsText)
      };

      if (categoryForm.id) {
        await requestJson(
          `/api/bff/catalogs/categories/${categoryForm.id}`,
          { method: "PUT", body: JSON.stringify(payload) },
          "No se pudo actualizar la categoría"
        );
        onSuccess("Categoría actualizada correctamente.");
      } else {
        await requestJson("/api/bff/catalogs/categories", { method: "POST", body: JSON.stringify(payload) }, "No se pudo crear la categoría");
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
      await requestJson(
        `/api/bff/catalogs/categories/${category.categoryId}/active`,
        { method: "PATCH", body: JSON.stringify({ active: !category.active }) },
        "No se pudo actualizar el estado de la categoría"
      );
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
      header: "Acciones",
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
      <SectionCard
        id="catalog-section-categories"
        title="Categorías"
        count={categories.length}
        activeCount={activeCount}
        inactiveCount={inactiveCount}
        expanded={expanded}
        onToggle={onToggle}
        onCreate={openCreateCategoryModal}
        createLabel="Nueva"
      >
        <DataGrid
          columns={categoryColumns}
          rows={filteredRows}
          sorting={sorting}
          onSortingChange={setSorting}
          emptyMessage="Sin categorías"
          allowDensityToggle
          densityStorageKey="catalogs-grid-density"
          toolbar={
            <div className="space-y-2">
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
                        className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
              />
              <SortSummary
                sorting={sorting}
                onClearSorting={clearSorting}
                labelsByColumnId={{
                  name: "Nombre",
                  type: "Tipo",
                  color: "Color",
                  tags: "Tags",
                  active: "Estado"
                }}
              />
            </div>
          }
        />
      </SectionCard>

      {categoryModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-lg p-1">
            <form className="space-y-4" onSubmit={(event) => void submitCategory(event)}>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{categoryForm.id ? "Editar categoría" : "Nueva categoría"}</h3>
              <Input label="Nombre" value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} required />
              <Input label="Color" type="color" value={categoryForm.color} onChange={(event) => setCategoryForm((current) => ({ ...current, color: event.target.value }))} />
              <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                Tipo
                <select
                  value={categoryForm.type}
                  onChange={(event) => setCategoryForm((current) => ({ ...current, type: event.target.value as CategoryType }))}
                  className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={categoryForm.active}
                  onChange={(event) => setCategoryForm((current) => ({ ...current, active: event.target.checked }))}
                />
                Activa
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setCategoryModalOpen(false)}>
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
