import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import type { Category } from "@/lib/contracts/categories";
import type { Subcategory } from "@/lib/contracts/subcategories";
import { requestJson } from "../_shared/catalogs-api";
import { SectionFilterBar } from "../_shared/section-filter-bar";
import { CatalogActionButton } from "../_shared/catalog-action-button";
import { StatusBadge } from "../_shared/status-badge";
import { useCatalogSectionState } from "../_shared/use-catalog-section-state";

type Props = {
  categories: Category[];
  subcategories: Subcategory[];
  onCatalogChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  onSuccess: (message: string) => void;
};

type SubcategoryFormState = {
  id: number | null;
  categoryId: number | null;
  name: string;
  active: boolean;
};

function emptySubcategoryForm(categories: Category[]): SubcategoryFormState {
  return {
    id: null,
    categoryId: categories[0]?.categoryId ?? null,
    name: "",
    active: true
  };
}

function toSubcategoryRequestPayload(form: SubcategoryFormState) {
  return {
    categoryId: form.categoryId,
    name: form.name.trim(),
    active: form.active
  };
}

async function createSubcategory(payload: ReturnType<typeof toSubcategoryRequestPayload>) {
  await requestJson(
    "/api/bff/catalogs/subcategories",
    { method: "POST", body: JSON.stringify(payload) },
    "No se pudo crear la subcategoría"
  );
}

async function updateSubcategory(subcategoryId: number, payload: ReturnType<typeof toSubcategoryRequestPayload>) {
  await requestJson(
    `/api/bff/catalogs/subcategories/${subcategoryId}`,
    { method: "PUT", body: JSON.stringify(payload) },
    "No se pudo actualizar la subcategoría"
  );
}

async function patchSubcategoryActive(subcategoryId: number, active: boolean) {
  await requestJson(
    `/api/bff/catalogs/subcategories/${subcategoryId}/active`,
    { method: "PATCH", body: JSON.stringify({ active }) },
    "No se pudo actualizar el estado de la subcategoría"
  );
}

export function SubcategoriesSection({ categories, subcategories, onCatalogChanged, onError, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [subcategoryModalOpen, setSubcategoryModalOpen] = useState(false);
  const [subcategoryForm, setSubcategoryForm] = useState<SubcategoryFormState>(emptySubcategoryForm(categories));
  const [categoryFilterId, setCategoryFilterId] = useState<number | null>(null);

  const categoryNameById = useMemo(() => {
    const map = new Map<number, string>();
    categories.forEach((category) => map.set(category.categoryId, category.name));
    return map;
  }, [categories]);

  const activeCategories = useMemo(() => categories.filter((category) => category.active), [categories]);
  const initialSorting = useMemo(() => [{ id: "categoryName", desc: false }, { id: "name", desc: false }], []);
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
    rows: subcategories,
    initialSorting,
    searchPredicate: (row, normalizedQuery) => {
      const categoryName = categoryNameById.get(row.categoryId)?.toLowerCase() ?? "";
      return row.name.toLowerCase().includes(normalizedQuery) || categoryName.includes(normalizedQuery);
    },
    activePredicate: (row) => row.active,
    extraFilterPredicate: (row) => (categoryFilterId ? row.categoryId === categoryFilterId : true)
  });

  function openCreateSubcategoryModal() {
    setSubcategoryForm(emptySubcategoryForm(categories));
    setSubcategoryModalOpen(true);
    onError(null);
  }

  function openEditSubcategoryModal(subcategory: Subcategory) {
    setSubcategoryForm({
      id: subcategory.subcategoryId,
      categoryId: subcategory.categoryId,
      name: subcategory.name,
      active: subcategory.active
    });
    setSubcategoryModalOpen(true);
    onError(null);
  }

  async function submitSubcategory(event: FormEvent) {
    event.preventDefault();

    if (!subcategoryForm.categoryId) {
      onError("Selecciona una categoría para la subcategoría.");
      return;
    }

    setSaving(true);
    onError(null);
    try {
      const payload = toSubcategoryRequestPayload(subcategoryForm);

      if (subcategoryForm.id) {
        await updateSubcategory(subcategoryForm.id, payload);
        onSuccess("Subcategoría actualizada correctamente.");
      } else {
        await createSubcategory(payload);
        onSuccess("Subcategoría creada correctamente.");
      }

      setSubcategoryModalOpen(false);
      await onCatalogChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo guardar la subcategoría");
    } finally {
      setSaving(false);
    }
  }

  async function toggleSubcategoryActive(subcategory: Subcategory) {
    setSaving(true);
    onError(null);
    try {
      await patchSubcategoryActive(subcategory.subcategoryId, !subcategory.active);
      onSuccess(`Subcategoría ${!subcategory.active ? "activada" : "desactivada"}.`);
      await onCatalogChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo actualizar la subcategoría");
    } finally {
      setSaving(false);
    }
  }

  const subcategoryColumns: ColumnDef<Subcategory>[] = [
    { accessorKey: "name", header: "Nombre" },
    {
      id: "categoryName",
      header: "Categoría",
      accessorFn: (row) => categoryNameById.get(row.categoryId) ?? "Sin categoría",
      cell: ({ row }) => categoryNameById.get(row.original.categoryId) ?? "Sin categoría"
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
        const subcategory = row.original;
        return (
          <div className="flex justify-end gap-1.5">
            <CatalogActionButton
              type="button"
              action="edit"
              label="Editar"
              onClick={() => openEditSubcategoryModal(subcategory)}
            />
            <CatalogActionButton
              type="button"
              action={subcategory.active ? "deactivate" : "activate"}
              label={subcategory.active ? "Desactivar" : "Activar"}
              onClick={() => void toggleSubcategoryActive(subcategory)}
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
          title="Filtros"
          subtitle={`Mostrando ${filteredRows.length} de ${subcategories.length} registros`}
          searchPlaceholder="Nombre o categoría"
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          activeFilter={activeFilter}
          onActiveFilterChange={setActiveFilter}
          extraFilters={[
            {
              label: "Categoría",
              content: (
                <select
                  value={categoryFilterId ?? ""}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setCategoryFilterId(Number.isFinite(value) && value > 0 ? value : null);
                  }}
                  className="input-semantic h-8 rounded-none px-2 text-xs font-semibold"
                >
                  <option value="">Todas</option>
                  {categories.map((category) => (
                    <option key={category.categoryId} value={category.categoryId} >
                      {category.name}
                    </option>
                  ))}
                </select>
              )
            }
          ]}
          chips={
            categoryFilterId
              ? [{ id: "category", label: `Categoría: ${categoryNameById.get(categoryFilterId) ?? "Seleccionada"}`, onClear: () => setCategoryFilterId(null) }]
              : undefined
          }
          hideFeedback
          onClearFilters={() => {
            clearFilters();
            setCategoryFilterId(null);
          }}
          actions={
            <CatalogActionButton
              type="button"
              action="create"
              label="Nueva"
              onClick={openCreateSubcategoryModal}
            />
          }
        />
      </section>

      <section className="p-3 sm:p-4">
        <div className="app-grid-skin overflow-hidden rounded-none p-0">
          <DataGrid
            columns={subcategoryColumns}
            rows={filteredRows}
            sorting={sorting}
            onSortingChange={setSorting}
            emptyMessage="Sin subcategorías"
            stickyActionsColumn
          />
        </div>
      </section>

      {subcategoryModalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-end bg-[var(--color-overlay)] backdrop-blur-sm sm:items-stretch" role="presentation" onClick={() => setSubcategoryModalOpen(false)}>
          <Card className="relative flex h-[100dvh] w-full max-w-none flex-col app-sidebar border-l p-0 sm:h-full sm:max-w-xl" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header-semantic">
              <div className="mb-1 h-1 w-12 bg-[var(--color-accent)]/70 sm:hidden" />
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-300">{subcategoryForm.id ? "Editar subcategoría" : "Nueva subcategoría"}</h3>
                <Button type="button" variant="ghost" className="btn-close-semantic" onClick={() => setSubcategoryModalOpen(false)}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Cerrar</span>
                </Button>
              </div>
            </div>

            <form className="flex h-full flex-col" onSubmit={(event) => void submitSubcategory(event)}>
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
                <section className="space-y-2 rounded-2xl border border-blue-200/60 bg-blue-50/35 p-3 dark:border-blue-900/50 dark:bg-blue-950/20">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">General</h4>
                  <label className="text-secondary grid gap-1.5 text-sm font-medium">
                    Categoría
                    <select
                      value={subcategoryForm.categoryId ?? ""}
                      onChange={(event) =>
                        setSubcategoryForm((current) => ({
                          ...current,
                          categoryId: Number.isFinite(Number(event.target.value)) ? Number(event.target.value) : null
                        }))
                      }
                      className="input-semantic h-10 rounded-none px-3 text-sm"
                    >
                      {activeCategories.map((category) => (
                        <option key={category.categoryId} value={category.categoryId} >
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Input
                    label="Nombre"
                    value={subcategoryForm.name}
                    onChange={(event) => setSubcategoryForm((current) => ({ ...current, name: event.target.value }))}
                    required
                    className="input-semantic rounded-none placeholder:text-muted"
                  />
                  <label className="text-secondary flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={subcategoryForm.active}
                      onChange={(event) => setSubcategoryForm((current) => ({ ...current, active: event.target.checked }))}
                    />
                    Activa
                  </label>
                </section>
              </div>

              <div className="drawer-footer-semantic">
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" className="h-8 rounded-md border-[var(--color-danger)]/50 bg-[var(--color-danger)]/15 px-3 text-xs font-bold text-[var(--color-danger)] hover:border-[var(--color-danger)]/70 hover:bg-[var(--color-danger)]/25" onClick={() => setSubcategoryModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" variant="ghost" loading={saving} loadingText="Guardando..." className="h-8 rounded-md border-blue-400/60 bg-blue-500/15 px-3 text-xs font-bold text-blue-700 hover:border-blue-500/70 hover:bg-blue-500/25 hover:text-blue-800 dark:border-blue-700/60 dark:bg-blue-500/25 dark:text-blue-300 dark:hover:border-blue-500/70 dark:hover:bg-blue-500/35 dark:hover:text-blue-100">
                    {subcategoryForm.id ? "Guardar cambios" : "Crear subcategoría"}
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
