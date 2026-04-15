"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { AppMenu } from "@/components/navigation/app-menu";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DataGrid } from "@/components/data-grid/data-grid";
import type { Category, CategoryType } from "@/lib/contracts/categories";
import type { Merchant } from "@/lib/contracts/merchants";
import type { Subcategory } from "@/lib/contracts/subcategories";
import type { Tag } from "@/lib/contracts/tags";

type Props = {
  username: string;
};

type CatalogsResponse = {
  categories: Category[];
  subcategories: Subcategory[];
  merchants: Merchant[];
  tags: Tag[];
};

type CategoryFormState = {
  id: number | null;
  name: string;
  color: string;
  type: CategoryType;
  active: boolean;
  tagsText: string;
};

type SubcategoryFormState = {
  id: number | null;
  categoryId: number | null;
  name: string;
  active: boolean;
};

type MerchantFormState = {
  id: number | null;
  name: string;
  active: boolean;
};

type TagFormState = {
  id: number | null;
  name: string;
  active: boolean;
};

type CatalogSectionKey = "categories" | "subcategories" | "merchants" | "tags";

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

function emptySubcategoryForm(categories: Category[]): SubcategoryFormState {
  return {
    id: null,
    categoryId: categories[0]?.categoryId ?? null,
    name: "",
    active: true
  };
}

function emptyMerchantForm(): MerchantFormState {
  return { id: null, name: "", active: true };
}

function emptyTagForm(): TagFormState {
  return { id: null, name: "", active: true };
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          : "rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300"
      }
    >
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}

function SectionCard({
  title,
  count,
  expanded,
  onToggle,
  onCreate,
  createLabel = "Nuevo",
  children
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onCreate: () => void;
  createLabel?: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div
        className="flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-lg px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800/40"
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-block text-[11px] text-slate-500 transition-transform dark:text-slate-400 ${expanded ? "rotate-90" : ""}`}
            aria-hidden="true"
          >
            ▸
          </span>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">{count}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            className="h-6 px-1.5 text-[10px]"
            onClick={(event) => {
              event.stopPropagation();
              onCreate();
            }}
          >
            {createLabel}
          </Button>
        </div>
      </div>
      {expanded ? <div className="mt-3">{children}</div> : null}
    </Card>
  );
}

export function CatalogsClient({ username }: Props) {
  const [catalogs, setCatalogs] = useState<CatalogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [subcategoryModalOpen, setSubcategoryModalOpen] = useState(false);
  const [merchantModalOpen, setMerchantModalOpen] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);

  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm());
  const [subcategoryForm, setSubcategoryForm] = useState<SubcategoryFormState>(emptySubcategoryForm([]));
  const [merchantForm, setMerchantForm] = useState<MerchantFormState>(emptyMerchantForm());
  const [tagForm, setTagForm] = useState<TagFormState>(emptyTagForm());
  const [expandedSection, setExpandedSection] = useState<CatalogSectionKey | null>("categories");

  function toggleSection(section: CatalogSectionKey) {
    setExpandedSection((current) => (current === section ? null : section));
  }

  const categories = catalogs?.categories ?? [];
  const subcategories = catalogs?.subcategories ?? [];
  const merchants = catalogs?.merchants ?? [];
  const tags = catalogs?.tags ?? [];
  const rowActionBtnClass = "h-6 px-1.5 text-[10px]";

  const categoryNameById = useMemo(() => {
    const map = new Map<number, string>();
    (catalogs?.categories ?? []).forEach((category) => map.set(category.categoryId, category.name));
    return map;
  }, [catalogs]);

  const activeCategories = useMemo(() => (catalogs?.categories ?? []).filter((category) => category.active), [catalogs]);

  async function loadCatalogs() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/bff/catalogs/bootstrap", { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "No se pudieron cargar los catálogos");
      }

      const data = (await response.json()) as CatalogsResponse;
      setCatalogs(data);
      setSubcategoryForm((current) => ({
        ...current,
        categoryId: current.categoryId ?? data.categories[0]?.categoryId ?? null
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los catálogos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCatalogs();
  }, []);

  async function requestJson(path: string, init: RequestInit, fallbackMessage: string): Promise<void> {
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {})
      }
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(body?.message ?? fallbackMessage);
    }
  }

  function openCreateCategoryModal() {
    setCategoryForm(emptyCategoryForm());
    setCategoryModalOpen(true);
    setError(null);
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
    setError(null);
  }

  async function submitCategory(event: FormEvent) {
    event.preventDefault();

    setSaving(true);
    setError(null);
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
        setGlobalSuccess("Categoría actualizada correctamente.");
      } else {
        await requestJson(
          "/api/bff/catalogs/categories",
          { method: "POST", body: JSON.stringify(payload) },
          "No se pudo crear la categoría"
        );
        setGlobalSuccess("Categoría creada correctamente.");
      }

      setCategoryModalOpen(false);
      await loadCatalogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la categoría");
    } finally {
      setSaving(false);
    }
  }

  async function toggleCategoryActive(category: Category) {
    setSaving(true);
    setError(null);
    try {
      await requestJson(
        `/api/bff/catalogs/categories/${category.categoryId}/active`,
        { method: "PATCH", body: JSON.stringify({ active: !category.active }) },
        "No se pudo actualizar el estado de la categoría"
      );
      setGlobalSuccess(`Categoría ${!category.active ? "activada" : "desactivada"}.`);
      await loadCatalogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la categoría");
    } finally {
      setSaving(false);
    }
  }

  function openCreateSubcategoryModal() {
    setSubcategoryForm(emptySubcategoryForm(categories));
    setSubcategoryModalOpen(true);
    setError(null);
  }

  function openEditSubcategoryModal(subcategory: Subcategory) {
    setSubcategoryForm({
      id: subcategory.subcategoryId,
      categoryId: subcategory.categoryId,
      name: subcategory.name,
      active: subcategory.active
    });
    setSubcategoryModalOpen(true);
    setError(null);
  }

  async function submitSubcategory(event: FormEvent) {
    event.preventDefault();

    if (!subcategoryForm.categoryId) {
      setError("Selecciona una categoría para la subcategoría.");
      return;
    }

    setSaving(true);
    setError(null);
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
        setGlobalSuccess("Subcategoría actualizada correctamente.");
      } else {
        await requestJson(
          "/api/bff/catalogs/subcategories",
          { method: "POST", body: JSON.stringify(payload) },
          "No se pudo crear la subcategoría"
        );
        setGlobalSuccess("Subcategoría creada correctamente.");
      }

      setSubcategoryModalOpen(false);
      await loadCatalogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la subcategoría");
    } finally {
      setSaving(false);
    }
  }

  async function toggleSubcategoryActive(subcategory: Subcategory) {
    setSaving(true);
    setError(null);
    try {
      await requestJson(
        `/api/bff/catalogs/subcategories/${subcategory.subcategoryId}/active`,
        { method: "PATCH", body: JSON.stringify({ active: !subcategory.active }) },
        "No se pudo actualizar el estado de la subcategoría"
      );
      setGlobalSuccess(`Subcategoría ${!subcategory.active ? "activada" : "desactivada"}.`);
      await loadCatalogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la subcategoría");
    } finally {
      setSaving(false);
    }
  }

  function openCreateMerchantModal() {
    setMerchantForm(emptyMerchantForm());
    setMerchantModalOpen(true);
    setError(null);
  }

  function openEditMerchantModal(merchant: Merchant) {
    setMerchantForm({ id: merchant.merchantId, name: merchant.name, active: merchant.active });
    setMerchantModalOpen(true);
    setError(null);
  }

  async function submitMerchant(event: FormEvent) {
    event.preventDefault();

    setSaving(true);
    setError(null);
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
        setGlobalSuccess("Comercio actualizado correctamente.");
      } else {
        await requestJson(
          "/api/bff/catalogs/merchants",
          { method: "POST", body: JSON.stringify(payload) },
          "No se pudo crear el comercio"
        );
        setGlobalSuccess("Comercio creado correctamente.");
      }

      setMerchantModalOpen(false);
      await loadCatalogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el comercio");
    } finally {
      setSaving(false);
    }
  }

  async function toggleMerchantActive(merchant: Merchant) {
    setSaving(true);
    setError(null);
    try {
      await requestJson(
        `/api/bff/catalogs/merchants/${merchant.merchantId}/active`,
        { method: "PATCH", body: JSON.stringify({ active: !merchant.active }) },
        "No se pudo actualizar el estado del comercio"
      );
      setGlobalSuccess(`Comercio ${!merchant.active ? "activado" : "desactivado"}.`);
      await loadCatalogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el comercio");
    } finally {
      setSaving(false);
    }
  }

  function openCreateTagModal() {
    setTagForm(emptyTagForm());
    setTagModalOpen(true);
    setError(null);
  }

  function openEditTagModal(tag: Tag) {
    setTagForm({ id: tag.tagId, name: tag.name, active: tag.active });
    setTagModalOpen(true);
    setError(null);
  }

  async function submitTag(event: FormEvent) {
    event.preventDefault();

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: tagForm.name,
        active: tagForm.active
      };

      if (tagForm.id) {
        await requestJson(
          `/api/bff/catalogs/tags/${tagForm.id}`,
          { method: "PUT", body: JSON.stringify(payload) },
          "No se pudo actualizar el tag"
        );
        setGlobalSuccess("Tag actualizado correctamente.");
      } else {
        await requestJson("/api/bff/catalogs/tags", { method: "POST", body: JSON.stringify(payload) }, "No se pudo crear el tag");
        setGlobalSuccess("Tag creado correctamente.");
      }

      setTagModalOpen(false);
      await loadCatalogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el tag");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTagActive(tag: Tag) {
    setSaving(true);
    setError(null);
    try {
      await requestJson(
        `/api/bff/catalogs/tags/${tag.tagId}/active`,
        { method: "PATCH", body: JSON.stringify({ active: !tag.active }) },
        "No se pudo actualizar el estado del tag"
      );
      setGlobalSuccess(`Tag ${!tag.active ? "activado" : "desactivado"}.`);
      await loadCatalogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el tag");
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
              <Button type="button" variant="secondary" className={rowActionBtnClass} onClick={() => openEditCategoryModal(category)}>
                Editar
              </Button>
              <Button
                type="button"
                variant={category.active ? "danger" : "secondary"}
                className={rowActionBtnClass}
                onClick={() => void toggleCategoryActive(category)}
                disabled={saving}
              >
                {category.active ? "Desactivar" : "Activar"}
              </Button>
            </div>
          );
        }
      }
    ];

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
              <Button type="button" variant="secondary" className={rowActionBtnClass} onClick={() => openEditSubcategoryModal(subcategory)}>
                Editar
              </Button>
              <Button
                type="button"
                variant={subcategory.active ? "danger" : "secondary"}
                className={rowActionBtnClass}
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

  const merchantColumns: ColumnDef<Merchant>[] = [
      { accessorKey: "name", header: "Nombre" },
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
          const merchant = row.original;
          return (
            <div className="flex items-center gap-1.5">
              <Button type="button" variant="secondary" className={rowActionBtnClass} onClick={() => openEditMerchantModal(merchant)}>
                Editar
              </Button>
              <Button
                type="button"
                variant={merchant.active ? "danger" : "secondary"}
                className={rowActionBtnClass}
                onClick={() => void toggleMerchantActive(merchant)}
                disabled={saving}
              >
                {merchant.active ? "Desactivar" : "Activar"}
              </Button>
            </div>
          );
        }
      }
    ];

  const tagColumns: ColumnDef<Tag>[] = [
      { accessorKey: "name", header: "Nombre" },
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
          const tag = row.original;
          return (
            <div className="flex items-center gap-1.5">
              <Button type="button" variant="secondary" className={rowActionBtnClass} onClick={() => openEditTagModal(tag)}>
                Editar
              </Button>
              <Button
                type="button"
                variant={tag.active ? "danger" : "secondary"}
                className={rowActionBtnClass}
                onClick={() => void toggleTagActive(tag)}
                disabled={saving}
              >
                {tag.active ? "Desactivar" : "Activar"}
              </Button>
            </div>
          );
        }
      }
    ];

  return (
    <main className="min-h-dvh bg-slate-100 px-4 py-8 dark:bg-slate-900 md:px-8">
      <section className="mx-auto w-full max-w-6xl space-y-4">
        <Card className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">Catálogos</p>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 md:text-2xl">Gestión de catálogos</h1>
              <p className="text-xs text-slate-600 dark:text-slate-400">Hola {username}. Base para tablas compactas y evolución a server-side.</p>
            </div>

            <AppMenu username={username} compact />
          </div>
        </Card>

        {error ? <Alert variant="danger">{error}</Alert> : null}
        {globalSuccess ? <Alert>{globalSuccess}</Alert> : null}

        {loading ? (
          <Card className="p-4">
            <p className="text-xs text-slate-600 dark:text-slate-400">Cargando catálogos...</p>
          </Card>
        ) : (
          <div className="space-y-3">
            <SectionCard
              title="Categorías"
              count={categories.length}
              expanded={expandedSection === "categories"}
              onToggle={() => toggleSection("categories")}
              onCreate={openCreateCategoryModal}
              createLabel="Nueva"
            >
              <DataGrid columns={categoryColumns} rows={categories} density="compact" emptyMessage="Sin categorías" />
            </SectionCard>

            <SectionCard
              title="Subcategorías"
              count={subcategories.length}
              expanded={expandedSection === "subcategories"}
              onToggle={() => toggleSection("subcategories")}
              onCreate={openCreateSubcategoryModal}
              createLabel="Nueva"
            >
              <DataGrid columns={subcategoryColumns} rows={subcategories} density="compact" emptyMessage="Sin subcategorías" />
            </SectionCard>

            <SectionCard
              title="Comercios"
              count={merchants.length}
              expanded={expandedSection === "merchants"}
              onToggle={() => toggleSection("merchants")}
              onCreate={openCreateMerchantModal}
            >
              <DataGrid columns={merchantColumns} rows={merchants} density="compact" emptyMessage="Sin comercios" />
            </SectionCard>

            <SectionCard
              title="Tags"
              count={tags.length}
              expanded={expandedSection === "tags"}
              onToggle={() => toggleSection("tags")}
              onCreate={openCreateTagModal}
            >
              <DataGrid columns={tagColumns} rows={tags} density="compact" emptyMessage="Sin tags" />
            </SectionCard>
          </div>
        )}
      </section>

      {categoryModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-lg p-6">
            <form className="space-y-4" onSubmit={(event) => void submitCategory(event)}>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {categoryForm.id ? "Editar categoría" : "Nueva categoría"}
              </h3>
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

      {subcategoryModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-lg p-6">
            <form className="space-y-4" onSubmit={(event) => void submitSubcategory(event)}>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {subcategoryForm.id ? "Editar subcategoría" : "Nueva subcategoría"}
              </h3>
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

      {merchantModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-lg p-6">
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

      {tagModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-lg p-6">
            <form className="space-y-4" onSubmit={(event) => void submitTag(event)}>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{tagForm.id ? "Editar tag" : "Nuevo tag"}</h3>
              <Input label="Nombre" value={tagForm.name} onChange={(event) => setTagForm((current) => ({ ...current, name: event.target.value }))} required />
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={tagForm.active}
                  onChange={(event) => setTagForm((current) => ({ ...current, active: event.target.checked }))}
                />
                Activo
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setTagModalOpen(false)}>
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
    </main>
  );
}
