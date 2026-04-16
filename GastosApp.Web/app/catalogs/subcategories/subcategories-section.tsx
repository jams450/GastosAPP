import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Category } from "@/lib/contracts/categories";
import type { Subcategory } from "@/lib/contracts/subcategories";
import { requestJson } from "../_shared/catalogs-api";
import { rowActionButtonClass } from "../_shared/action-button-style";
import { SectionCard } from "../_shared/section-card";
import { StatusBadge } from "../_shared/status-badge";

type Props = {
  categories: Category[];
  subcategories: Subcategory[];
  expanded: boolean;
  onToggle: () => void;
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

export function SubcategoriesSection({ categories, subcategories, expanded, onToggle, onCatalogChanged, onError, onSuccess }: Props) {
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
  const filteredSubcategories = useMemo(
    () => (categoryFilterId ? subcategories.filter((subcategory) => subcategory.categoryId === categoryFilterId) : subcategories),
    [categoryFilterId, subcategories]
  );

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
      const payload = {
        categoryId: subcategoryForm.categoryId,
        name: subcategoryForm.name,
        active: subcategoryForm.active
      };

      if (subcategoryForm.id) {
        await requestJson(
          `/api/bff/catalogs/subcategories/${subcategoryForm.id}`,
          { method: "PUT", body: JSON.stringify(payload) },
          "No se pudo actualizar la subcategoría"
        );
        onSuccess("Subcategoría actualizada correctamente.");
      } else {
        await requestJson(
          "/api/bff/catalogs/subcategories",
          { method: "POST", body: JSON.stringify(payload) },
          "No se pudo crear la subcategoría"
        );
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
      await requestJson(
        `/api/bff/catalogs/subcategories/${subcategory.subcategoryId}/active`,
        { method: "PATCH", body: JSON.stringify({ active: !subcategory.active }) },
        "No se pudo actualizar el estado de la subcategoría"
      );
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
      header: "Acciones",
      enableSorting: false,
      cell: ({ row }) => {
        const subcategory = row.original;
        return (
          <div className="flex items-center gap-1.5">
            <Button type="button" variant="secondary" className={rowActionButtonClass} onClick={() => openEditSubcategoryModal(subcategory)}>
              Editar
            </Button>
            <Button
              type="button"
              variant={subcategory.active ? "danger" : "secondary"}
              className={rowActionButtonClass}
              onClick={() => void toggleSubcategoryActive(subcategory)}
              disabled={saving}
            >
              {subcategory.active ? "Desactivar" : "Activar"}
            </Button>
          </div>
        );
      }
    }
  ];

  return (
    <>
      <SectionCard
        title="Subcategorías"
        count={subcategories.length}
        expanded={expanded}
        onToggle={onToggle}
        onCreate={openCreateSubcategoryModal}
        createLabel="Nueva"
      >
        <div className="space-y-2">
          <label className="grid max-w-xs gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
            Filtrar por categoría
            <select
              value={categoryFilterId ?? ""}
              onChange={(event) => {
                const value = Number(event.target.value);
                setCategoryFilterId(Number.isFinite(value) && value > 0 ? value : null);
              }}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Todas</option>
              {categories.map((category) => (
                <option key={category.categoryId} value={category.categoryId}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <DataGrid
            columns={subcategoryColumns}
            rows={filteredSubcategories}
            density="compact"
            emptyMessage="Sin subcategorías"
            initialSorting={[{ id: "name", desc: false }]}
          />
        </div>
      </SectionCard>

      {subcategoryModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-lg p-1">
            <form className="space-y-4" onSubmit={(event) => void submitSubcategory(event)}>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{subcategoryForm.id ? "Editar subcategoría" : "Nueva subcategoría"}</h3>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                Categoría
                <select
                  value={subcategoryForm.categoryId ?? ""}
                  onChange={(event) =>
                    setSubcategoryForm((current) => ({
                      ...current,
                      categoryId: Number.isFinite(Number(event.target.value)) ? Number(event.target.value) : null
                    }))
                  }
                  className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {activeCategories.map((category) => (
                    <option key={category.categoryId} value={category.categoryId}>
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
              />
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={subcategoryForm.active}
                  onChange={(event) => setSubcategoryForm((current) => ({ ...current, active: event.target.checked }))}
                />
                Activa
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setSubcategoryModalOpen(false)}>
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
