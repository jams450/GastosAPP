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
  EMAIL_RULE_ACTIONS,
  EMAIL_RULE_ACTION_LABELS,
  EMAIL_RULE_MAX_PRIORITY,
  describeEmailRuleTarget,
  summarizeEmailRule
} from "@/lib/contracts/email-rules";
import type { EmailRule, EmailRuleAction, EmailRuleGroup } from "@/lib/contracts/email-rules";
import type { EmailLabel } from "@/lib/contracts/email-labels";
import { CatalogActionButton } from "../../catalogs/_shared/catalog-action-button";
import { SectionFilterBar } from "../../catalogs/_shared/section-filter-bar";
import { StatusBadge } from "../../catalogs/_shared/status-badge";
import { useCatalogSectionState } from "../../catalogs/_shared/use-catalog-section-state";
import { createEmailRule, fetchEmailRule, setEmailRuleActive, updateEmailRule } from "../_lib/email-rules-api";
import { RulesGroupEditor, emptyGroup } from "./rules-group-editor";

type Props = {
  rules: EmailRule[];
  labels: EmailLabel[];
  onCatalogChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  onSuccess: (message: string) => void;
};

type EmailRuleFormState = {
  id: number | null;
  name: string;
  action: EmailRuleAction;
  root: EmailRuleGroup;
  targetLabelId: string;
  priority: string;
  active: boolean;
};

function emptyForm(labels: EmailLabel[]): EmailRuleFormState {
  return {
    id: null,
    name: "",
    action: "assign_label",
    root: emptyGroup(),
    targetLabelId: labels.length > 0 ? String(labels[0].labelId) : "",
    priority: "100",
    active: true
  };
}

/**
 * El árbol es la fuente activa. Las columnas planas se envían vacías: el motor las ignora cuando hay
 * grupos, y el servidor las refleja desde la primera condición porque la base todavía las declara
 * `NOT NULL` con `CHECK`. Una acción terminal viaja sin etiqueta: no hay destino que aplicar.
 */
function toPayload(form: EmailRuleFormState) {
  return {
    name: form.name.trim(),
    action: form.action,
    matchField: "" as const,
    matchType: "" as const,
    matchValue: "",
    targetLabelId: form.action === "assign_label" ? Number(form.targetLabelId) : null,
    priority: Number(form.priority.trim() === "" ? "100" : form.priority),
    active: form.active,
    root: form.root
  };
}

export function RulesSection({ rules, labels, onCatalogChanged, onError, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<EmailRuleFormState>(() => emptyForm(labels));

  const initialSorting = useMemo(() => [{ id: "priority", desc: false }], []);
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
    rows: rules,
    initialSorting,
    searchPredicate: (row, normalizedQuery) =>
      row.name.toLowerCase().includes(normalizedQuery) ||
      row.matchValue.toLowerCase().includes(normalizedQuery) ||
      (row.targetLabelName ?? "").toLowerCase().includes(normalizedQuery),
    activePredicate: (row) => row.active
  });

  const labelById = useMemo(() => new Map(labels.map((label) => [label.labelId, label])), [labels]);

  function openCreate() {
    setForm(emptyForm(labels));
    setDrawerOpen(true);
    onError(null);
  }

  async function openEdit(rule: EmailRule) {
    setLoadingDetail(true);
    setDrawerOpen(false);
    onError(null);
    try {
      // El listado no incluye el árbol: solo el detalle permite editar sin perder subgrupos.
      const detail = await fetchEmailRule(rule.emailRuleId);
      const root: EmailRuleGroup = detail.root ?? {
        combinator: "and",
        negated: false,
        conditions: [
          {
            matchField: detail.matchField,
            matchType: detail.matchType,
            matchValue: detail.matchValue,
            negated: false
          }
        ],
        groups: []
      };
      setForm({
        id: detail.emailRuleId,
        name: detail.name,
        action: detail.action,
        root,
        targetLabelId: detail.targetLabelId === null ? "" : String(detail.targetLabelId),
        priority: String(detail.priority),
        active: detail.active
      });
      setDrawerOpen(true);
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo cargar el detalle de la regla");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();

    setSaving(true);
    onError(null);
    try {
      const payload = toPayload(form);

      if (form.id) {
        await updateEmailRule(form.id, payload);
        onSuccess("Regla actualizada correctamente.");
      } else {
        await createEmailRule(payload);
        onSuccess("Regla creada correctamente.");
      }

      setDrawerOpen(false);
      await onCatalogChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo guardar la regla");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(rule: EmailRule) {
    setSaving(true);
    onError(null);
    try {
      await setEmailRuleActive(rule.emailRuleId, !rule.active);
      onSuccess(`Regla ${!rule.active ? "activada" : "desactivada"}.`);
      await onCatalogChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo actualizar la regla");
    } finally {
      setSaving(false);
    }
  }

  const columns: ColumnDef<EmailRule>[] = [
    {
      accessorKey: "name",
      header: "Regla",
      meta: gridMeta({ mobileRole: "title" }),
      cell: ({ row }) => <span className="text-primary truncate font-semibold">{row.original.name}</span>
    },
    {
      accessorKey: "matchValue",
      header: "Condiciones",
      cell: ({ row }) => (
        <span className="text-secondary truncate font-mono text-xs">{summarizeEmailRule(row.original)}</span>
      )
    },
    {
      id: "targetLabel",
      header: "Etiqueta",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-secondary text-xs">
          {describeEmailRuleTarget(
            row.original,
            row.original.targetLabelId === null ? null : labelById.get(row.original.targetLabelId)?.name
          )}
        </span>
      )
    },
    {
      accessorKey: "priority",
      header: "Prioridad",
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
        const rule = row.original;
        return (
          <div className="flex justify-end gap-1.5">
            <CatalogActionButton type="button" action="edit" label="Editar" onClick={() => void openEdit(rule)} disabled={saving || loadingDetail} />
            <CatalogActionButton
              type="button"
              action={rule.active ? "deactivate" : "activate"}
              label={rule.active ? "Desactivar" : "Activar"}
              onClick={() => void toggleActive(rule)}
              disabled={saving || loadingDetail}
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
          searchPlaceholder="Buscar regla"
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          activeFilter={activeFilter}
          onActiveFilterChange={setActiveFilter}
          onClearFilters={clearFilters}
          hideFeedback
          actions={<CatalogActionButton type="button" action="create" label="Nueva" onClick={openCreate} disabled={saving || loadingDetail} />}
        />
      </section>

      <section>
        <div className="app-grid-skin app-grid-skin-flat overflow-hidden rounded-none p-0">
          <DataGrid
            columns={columns}
            rows={filteredRows}
            sorting={sorting}
            onSortingChange={setSorting}
            emptyMessage="Sin reglas: todo el correo cae en revisión"
            stickyActionsColumn
          />
        </div>
      </section>

      {drawerOpen ? (
        <div className="drawer-enter-backdrop fixed inset-0 z-[70] flex items-end justify-end bg-[var(--color-overlay)] backdrop-blur-sm sm:items-stretch" role="presentation">
          <Card className="drawer-enter-panel relative flex h-[100dvh] w-full max-w-none flex-col app-sidebar border-l p-0 sm:h-full sm:max-w-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header-semantic">
              <div className="mb-1 h-1 w-12 bg-[var(--color-accent)]/70 sm:hidden" />
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-primary mt-1 text-lg font-semibold">
                  {form.id ? "Editar regla" : "Nueva regla"}
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
                  <Select
                    label="Acción"
                    value={form.action}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, action: event.target.value as EmailRuleAction }))
                    }
                  >
                    {EMAIL_RULE_ACTIONS.map((action) => (
                      <option key={action} value={action}>
                        {EMAIL_RULE_ACTION_LABELS[action]}
                      </option>
                    ))}
                  </Select>
                  <p className="text-muted -mt-2 text-[11px]">
                    La primera regla que casa decide y la evaluación se detiene. Revisión y LLM no llevan etiqueta: el
                    correo espera una decisión en vez de recibir una.
                  </p>
                  {form.action === "assign_label" ? (
                    <Select
                      label="Etiqueta destino"
                      value={form.targetLabelId}
                      onChange={(event) => setForm((current) => ({ ...current, targetLabelId: event.target.value }))}
                      required
                    >
                      {labels.length === 0 ? <option value="">Sin etiquetas: crea una primero</option> : null}
                      {labels.map((label) => (
                        <option key={label.labelId} value={label.labelId}>
                          {label.name}
                          {label.active ? "" : " (inactiva)"}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                  <Input
                    label="Prioridad"
                    type="number"
                    min={0}
                    max={EMAIL_RULE_MAX_PRIORITY}
                    value={form.priority}
                    onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
                    className="input-semantic rounded-none placeholder:text-muted"
                  />
                  <p className="text-muted -mt-2 text-[11px]">
                    Menor número gana. Una regla general debe llevar número más alto que las específicas, o se
                    las come.
                  </p>
                  <label className="text-secondary flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                    />
                    Activa
                  </label>
                </section>

                <section className="drawer-section-semantic rounded-none border-[var(--color-border)] bg-[var(--color-surface-2)]">
                  <h4 className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">Condiciones</h4>
                  <p className="text-muted text-[11px]">
                    «Y» exige todas; «O» basta con una. Marca «NO» para invertir una condición o un grupo completo:
                    «dominio X Y NO (factura O invoice)». El dominio se compara literal, subdominios incluidos: para
                    incluir mail.paypal.com usa «Termina con» y el valor paypal.com.
                  </p>
                  <RulesGroupEditor
                    group={form.root}
                    depth={0}
                    onChange={(root) => setForm((current) => ({ ...current, root }))}
                  />
                </section>
              </div>

              <div className="drawer-footer-semantic">
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" className="h-8 rounded-none px-3 text-xs font-bold" onClick={() => setDrawerOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" variant="primary" loading={saving} loadingText="Guardando..." className="h-8 rounded-none px-3 text-xs font-bold">
                    {form.id ? "Guardar cambios" : "Crear regla"}
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
