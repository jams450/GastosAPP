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
  EMAIL_RULE_MAX_PRIORITY,
  EMAIL_RULE_MATCH_FIELDS,
  EMAIL_RULE_MATCH_FIELD_LABELS,
  EMAIL_RULE_MATCH_TYPES,
  EMAIL_RULE_MATCH_TYPE_LABELS
} from "@/lib/contracts/email-rules";
import type { EmailRule, EmailRuleMatchField, EmailRuleMatchType } from "@/lib/contracts/email-rules";
import type { EmailLabel } from "@/lib/contracts/email-labels";
import { CatalogActionButton } from "../../catalogs/_shared/catalog-action-button";
import { SectionFilterBar } from "../../catalogs/_shared/section-filter-bar";
import { StatusBadge } from "../../catalogs/_shared/status-badge";
import { useCatalogSectionState } from "../../catalogs/_shared/use-catalog-section-state";
import { createEmailRule, setEmailRuleActive, updateEmailRule } from "../_lib/email-rules-api";

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
  matchField: EmailRuleMatchField;
  matchType: EmailRuleMatchType;
  matchValue: string;
  targetLabelId: string;
  priority: string;
  active: boolean;
};

function emptyForm(labels: EmailLabel[]): EmailRuleFormState {
  return {
    id: null,
    name: "",
    matchField: "sender_domain",
    matchType: "ends_with",
    matchValue: "",
    targetLabelId: labels.length > 0 ? String(labels[0].labelId) : "",
    priority: "100",
    active: true
  };
}

function toPayload(form: EmailRuleFormState) {
  return {
    name: form.name.trim(),
    matchField: form.matchField,
    matchType: form.matchType,
    matchValue: form.matchValue.trim(),
    targetLabelId: Number(form.targetLabelId),
    priority: Number(form.priority.trim() === "" ? "100" : form.priority),
    active: form.active
  };
}

/**
 * El dominio se compara literal, incluidos subdominios. La ayuda cambia con el campo elegido porque
 * el error más probable es escribir `paypal.com` con «Es igual a» y no casar `mail.paypal.com`.
 */
function matchHint(field: EmailRuleMatchField): string {
  switch (field) {
    case "sender_domain":
      return "Se compara el dominio completo, subdominios incluidos. Para incluir mail.paypal.com usa «Termina con» y el valor paypal.com.";
    case "sender":
      return "Dirección completa, por ejemplo notificaciones@banco.com.";
    default:
      return "Asunto normalizado: sin acentos, sin mayúsculas y con espacios colapsados.";
  }
}

export function RulesSection({ rules, labels, onCatalogChanged, onError, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
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

  function openEdit(rule: EmailRule) {
    setForm({
      id: rule.emailRuleId,
      name: rule.name,
      matchField: rule.matchField,
      matchType: rule.matchType,
      matchValue: rule.matchValue,
      targetLabelId: String(rule.targetLabelId),
      priority: String(rule.priority),
      active: rule.active
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
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="text-primary truncate font-semibold">{row.original.name}</p>
          <p className="text-muted truncate text-[11px]">
            {EMAIL_RULE_MATCH_FIELD_LABELS[row.original.matchField]}
          </p>
        </div>
      )
    },
    {
      accessorKey: "matchValue",
      header: "Coincidencia",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="text-muted text-[11px]">{EMAIL_RULE_MATCH_TYPE_LABELS[row.original.matchType]}</p>
          <p className="text-secondary truncate font-mono text-xs">{row.original.matchValue}</p>
        </div>
      )
    },
    {
      id: "targetLabel",
      header: "Etiqueta",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-secondary text-xs">
          {row.original.targetLabelName ?? labelById.get(row.original.targetLabelId)?.name ?? "—"}
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
            <CatalogActionButton type="button" action="edit" label="Editar" onClick={() => openEdit(rule)} />
            <CatalogActionButton
              type="button"
              action={rule.active ? "deactivate" : "activate"}
              label={rule.active ? "Desactivar" : "Activar"}
              onClick={() => void toggleActive(rule)}
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
          searchPlaceholder="Buscar regla"
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          activeFilter={activeFilter}
          onActiveFilterChange={setActiveFilter}
          onClearFilters={clearFilters}
          hideFeedback
          actions={<CatalogActionButton type="button" action="create" label="Nueva" onClick={openCreate} />}
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
          <Card className="drawer-enter-panel relative flex h-[100dvh] w-full max-w-none flex-col app-sidebar border-l p-0 sm:h-full sm:max-w-xl" onClick={(event) => event.stopPropagation()}>
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
                    label="Campo"
                    value={form.matchField}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, matchField: event.target.value as EmailRuleMatchField }))
                    }
                  >
                    {EMAIL_RULE_MATCH_FIELDS.map((field) => (
                      <option key={field} value={field}>
                        {EMAIL_RULE_MATCH_FIELD_LABELS[field]}
                      </option>
                    ))}
                  </Select>
                  <Select
                    label="Comparación"
                    value={form.matchType}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, matchType: event.target.value as EmailRuleMatchType }))
                    }
                  >
                    {EMAIL_RULE_MATCH_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {EMAIL_RULE_MATCH_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label="Valor"
                    value={form.matchValue}
                    onChange={(event) => setForm((current) => ({ ...current, matchValue: event.target.value }))}
                    required
                    className="input-semantic rounded-none placeholder:text-muted"
                  />
                  <p className="text-muted -mt-2 text-[11px]">{matchHint(form.matchField)}</p>
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
                  <Input
                    label="Prioridad"
                    type="number"
                    min={0}
                    max={EMAIL_RULE_MAX_PRIORITY}
                    value={form.priority}
                    onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
                    className="input-semantic rounded-none placeholder:text-muted"
                  />
                  <p className="text-muted -mt-2 text-[11px]">Menor número gana. Las reglas se evalúan en ese orden.</p>
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
