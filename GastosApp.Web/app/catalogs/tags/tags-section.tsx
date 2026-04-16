import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import type { FormEvent } from "react";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Tag } from "@/lib/contracts/tags";
import { requestJson } from "../_shared/catalogs-api";
import { rowActionButtonClass } from "../_shared/action-button-style";
import { SectionCard } from "../_shared/section-card";
import { StatusBadge } from "../_shared/status-badge";

type Props = {
  tags: Tag[];
  expanded: boolean;
  onToggle: () => void;
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

export function TagsSection({ tags, expanded, onToggle, onCatalogChanged, onError, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagForm, setTagForm] = useState<TagFormState>(emptyTagForm());

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
      const payload = {
        name: tagForm.name,
        active: tagForm.active
      };

      if (tagForm.id) {
        await requestJson(`/api/bff/catalogs/tags/${tagForm.id}`, { method: "PUT", body: JSON.stringify(payload) }, "No se pudo actualizar el tag");
        onSuccess("Tag actualizado correctamente.");
      } else {
        await requestJson("/api/bff/catalogs/tags", { method: "POST", body: JSON.stringify(payload) }, "No se pudo crear el tag");
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
      await requestJson(
        `/api/bff/catalogs/tags/${tag.tagId}/active`,
        { method: "PATCH", body: JSON.stringify({ active: !tag.active }) },
        "No se pudo actualizar el estado del tag"
      );
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
      header: "Acciones",
      enableSorting: false,
      cell: ({ row }) => {
        const tag = row.original;
        return (
          <div className="flex items-center gap-1.5">
            <Button type="button" variant="secondary" className={rowActionButtonClass} onClick={() => openEditTagModal(tag)}>
              Editar
            </Button>
            <Button
              type="button"
              variant={tag.active ? "danger" : "secondary"}
              className={rowActionButtonClass}
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
    <>
      <SectionCard title="Tags" count={tags.length} expanded={expanded} onToggle={onToggle} onCreate={openCreateTagModal}>
        <DataGrid columns={tagColumns} rows={tags} density="compact" emptyMessage="Sin tags" initialSorting={[{ id: "name", desc: false }]} />
      </SectionCard>

      {tagModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-lg p-1">
            <form className="space-y-4" onSubmit={(event) => void submitTag(event)}>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{tagForm.id ? "Editar tag" : "Nuevo tag"}</h3>
              <Input label="Nombre" value={tagForm.name} onChange={(event) => setTagForm((current) => ({ ...current, name: event.target.value }))} required />
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={tagForm.active} onChange={(event) => setTagForm((current) => ({ ...current, active: event.target.checked }))} />
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
    </>
  );
}
