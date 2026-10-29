import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { X } from "lucide-react";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { gridMeta } from "@/lib/ui/grid-responsive";
import {
  EMAIL_LABEL_BEHAVIORS,
  EMAIL_LABEL_BEHAVIOR_LABELS,
  EMAIL_LABEL_KINDS,
  EMAIL_LABEL_KIND_LABELS
} from "@/lib/contracts/email-labels";
import type { EmailLabel, EmailLabelBehavior, EmailLabelKind } from "@/lib/contracts/email-labels";
import { CatalogActionButton } from "../../catalogs/_shared/catalog-action-button";
import { SectionFilterBar } from "../../catalogs/_shared/section-filter-bar";
import { StatusBadge } from "../../catalogs/_shared/status-badge";
import { useCatalogSectionState } from "../../catalogs/_shared/use-catalog-section-state";
import {
  createEmailLabel,
  setEmailLabelActive,
  updateEmailLabel
} from "../_lib/email-labels-api";

type Props = {
  labels: EmailLabel[];
  onCatalogChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  onSuccess: (message: string) => void;
};

type EmailLabelFormState = {
  id: number | null;
  name: string;
  slug: string;
  description: string;
  kind: EmailLabelKind;
  behavior: EmailLabelBehavior;
  color: string;
  sortOrder: string;
  active: boolean;
};

function emptyForm(): EmailLabelFormState {
  return {
    id: null,
    name: "",
    slug: "",
    description: "",
    kind: "folder",
    behavior: "none",
    color: "",
    sortOrder: "0",
    active: true
  };
}

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** El input nativo `color` solo entiende #rrggbb, así que un valor viejo o vacío cae a un gris neutro. */
function isHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value);
}

function toPayload(form: EmailLabelFormState) {
  return {
    name: form.name.trim(),
    slug: form.slug.trim().length > 0 ? form.slug.trim() : null,
    description: form.description.trim().length > 0 ? form.description.trim() : null,
    kind: form.kind,
    behavior: form.behavior,
    color: form.color.trim().length > 0 ? form.color.trim() : null,
    sortOrder: Number(form.sortOrder.trim() === "" ? "0" : form.sortOrder),
    active: form.active
  };
}

export function LabelsSection({ labels, onCatalogChanged, onError, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<EmailLabelFormState>(emptyForm());

  const initialSorting = useMemo(() => [{ id: "sortOrder", desc: false }], []);
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
    rows: labels,
    initialSorting,
    searchPredicate: (row, normalizedQuery) =>
      row.name.toLowerCase().includes(normalizedQuery) || row.slug.toLowerCase().includes(normalizedQuery),
    activePredicate: (row) => row.active
  });

  function openCreate() {
    setForm(emptyForm());
    setDrawerOpen(true);
    onError(null);
  }

  function openEdit(label: EmailLabel) {
    setForm({
      id: label.labelId,
      name: label.name,
      slug: label.slug,
      description: label.description ?? "",
      kind: label.kind,
      behavior: label.behavior,
      color: label.color ?? "",
      sortOrder: String(label.sortOrder),
      active: label.active
    });
    setDrawerOpen(true);
    onError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();

    setSaving(true);
    onError(null);
    try {
      const payload = toPayload(form);

      if (form.id) {
        await updateEmailLabel(form.id, payload);
        onSuccess("Etiqueta actualizada correctamente.");
      } else {
        await createEmailLabel(payload);
        onSuccess("Etiqueta creada correctamente.");
      }

      setDrawerOpen(false);
      await onCatalogChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo guardar la etiqueta");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(label: EmailLabel) {
    setSaving(true);
    onError(null);
    try {
      await setEmailLabelActive(label.labelId, !label.active);
      onSuccess(`Etiqueta ${!label.active ? "activada" : "desactivada"}.`);
      await onCatalogChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo actualizar la etiqueta");
    } finally {
      setSaving(false);
    }
  }

  const columns: ColumnDef<EmailLabel>[] = [
    {
      accessorKey: "name",
      header: "Etiqueta",
      meta: gridMeta({ mobileRole: "title" }),
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          {row.original.color ? (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--color-border-strong)]"
              style={{ backgroundColor: row.original.color }}
              aria-hidden="true"
            />
          ) : null}
          <div className="min-w-0">
            <p className="text-primary truncate font-semibold">{row.original.name}</p>
            <p className="text-muted truncate text-[11px]">{row.original.description ?? row.original.slug}</p>
          </div>
        </div>
      )
    },
    {
      accessorKey: "behavior",
      header: "Comportamiento",
      cell: ({ row }) => (
        <span className="text-secondary text-xs">{EMAIL_LABEL_BEHAVIOR_LABELS[row.original.behavior]}</span>
      )
    },
    {
      accessorKey: "kind",
      header: "Tipo",
      cell: ({ row }) => <span className="text-muted text-xs">{EMAIL_LABEL_KIND_LABELS[row.original.kind]}</span>
    },
    {
      accessorKey: "sortOrder",
      header: "Orden",
      meta: gridMeta({ tabletHidden: true })
    },
    {
      accessorKey: "active",
      header: "Estado",
      meta: gridMeta({ mobileRole: "status" }),
      cell: ({ row }) => <StatusBadge active={row.original.active} />
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        const label = row.original;
        return (
          <div className="flex justify-end gap-1.5">
            <CatalogActionButton type="button" action="edit" label="Editar" onClick={() => openEdit(label)} />
            <CatalogActionButton
              type="button"
              action={label.active ? "deactivate" : "activate"}
              label={label.active ? "Desactivar" : "Activar"}
              onClick={() => void toggleActive(label)}
              disabled={saving}
            />
          </div>
        );
      }
    }
  ];

  return (
    <>
      <section>
        <SectionFilterBar
          searchPlaceholder="Buscar etiqueta"
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          activeFilter={activeFilter}
          onActiveFilterChange={setActiveFilter}
          onClearFilters={clearFilters}
          hideFeedback
          actions={
            <CatalogActionButton type="button" action="create" label="Nueva" onClick={openCreate} />
          }
        />
      </section>

      <section>
        <div className="app-grid-skin app-grid-skin-flat overflow-hidden rounded-none p-0">
          <DataGrid
            columns={columns}
            rows={filteredRows}
            sorting={sorting}
            onSortingChange={setSorting}
            emptyMessage="Sin etiquetas de correo"
            stickyActionsColumn
          />
        </div>
      </section>

      {drawerOpen ? (
        <div className="drawer-enter-backdrop fixed inset-0 z-[70] flex items-end justify-end bg-[var(--color-overlay)] backdrop-blur-sm sm:items-stretch" role="presentation">
          <Card className="drawer-enter-panel relative flex h-[100dvh] w-full max-w-none flex-col app-sidebar border-l p-0 sm:h-full sm:max-w-xl" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header-semantic">
              <div className="mb-1 h-1 w-12 bg-[var(--color-accent)]/70 sm:hidden" />
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-primary mt-1 text-lg font-semibold">
                  {form.id ? "Editar etiqueta" : "Nueva etiqueta"}
                </h3>
                <Button type="button" variant="ghost" className="btn-close-semantic" onClick={() => setDrawerOpen(false)}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Cerrar</span>
                </Button>
              </div>
            </div>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void submit(event)}>
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
                <section className="drawer-section-semantic rounded-none border-[var(--color-border)] bg-[var(--color-surface-2)]">
                  <h4 className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">General</h4>
                  <Input
                    label="Nombre"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    required
                    className="input-semantic rounded-none placeholder:text-muted"
                  />
                  <Input
                    label="Identificador (opcional)"
                    value={form.slug}
                    onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
                    className="input-semantic rounded-none placeholder:text-muted"
                  />
                  <p className="text-muted -mt-2 text-[11px]">Si lo dejas vacío se deriva del nombre.</p>
                  <Select
                    label="Tipo"
                    value={form.kind}
                    onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as EmailLabelKind }))}
                  >
                    {EMAIL_LABEL_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {EMAIL_LABEL_KIND_LABELS[kind]}
                      </option>
                    ))}
                  </Select>
                  <Select
                    label="Comportamiento"
                    value={form.behavior}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, behavior: event.target.value as EmailLabelBehavior }))
                    }
                  >
                    {EMAIL_LABEL_BEHAVIORS.map((behavior) => (
                      <option key={behavior} value={behavior}>
                        {EMAIL_LABEL_BEHAVIOR_LABELS[behavior]}
                      </option>
                    ))}
                  </Select>
                  <div className="grid gap-1.5 text-sm font-medium">
                    <label htmlFor="email-label-description" className="text-primary">
                      Descripción (opcional)
                    </label>
                    <textarea
                      id="email-label-description"
                      rows={3}
                      value={form.description}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, description: event.target.value }))
                      }
                      className="input-semantic w-full rounded-none px-3 py-2 text-sm"
                    />
                    <p className="text-muted text-[11px]">
                      Qué correo pertenece a esta etiqueta: remitentes y tipos de aviso. Es lo que leerá el
                      respaldo LLM para elegir entre tus etiquetas, así que el nombre solo no alcanza («Banco»
                      y «Gastos» se distinguen aquí).
                    </p>
                  </div>
                  <Input
                    label="Orden"
                    type="number"
                    min={0}
                    value={form.sortOrder}
                    onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))}
                    className="input-semantic rounded-none placeholder:text-muted"
                  />
                  <p className="text-muted -mt-2 text-[11px]">
                    Solo cambia el orden en que se listan las etiquetas. No afecta qué correo cae en cuál: eso lo
                    decide la prioridad de cada regla.
                  </p>
                  <div className="grid gap-1.5 text-sm font-medium">
                    <span className="text-primary">Color (opcional)</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label="Elegir color"
                        value={isHexColor(form.color) ? form.color : "#64748b"}
                        onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
                        className="h-10 w-14 shrink-0 cursor-pointer rounded-none border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1"
                      />
                      <div className="min-w-0 flex-1">
                        <Input
                          aria-label="Código de color"
                          value={form.color}
                          onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
                          placeholder="#64748b"
                          className="input-semantic rounded-none placeholder:text-muted"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-10 shrink-0 rounded-none px-3 text-xs font-bold"
                        onClick={() => setForm((current) => ({ ...current, color: "" }))}
                      >
                        Sin color
                      </Button>
                    </div>
                  </div>
                  <label className="text-secondary flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                    />
                    Activa
                  </label>
                </section>
              </div>

              <div className="drawer-footer-semantic">
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" className="h-8 rounded-none px-3 text-xs font-bold" onClick={() => setDrawerOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" variant="primary" loading={saving} loadingText="Guardando..." className="h-8 rounded-none px-3 text-xs font-bold">
                    {form.id ? "Guardar cambios" : "Crear etiqueta"}
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
