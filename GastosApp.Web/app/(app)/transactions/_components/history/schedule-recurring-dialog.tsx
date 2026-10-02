"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { validateRecurringItemPayload, type RecurringItem } from "@/lib/contracts/recurring-items";
import { csrfFetch } from "@/lib/security/csrf-client";
import {
  isProposalUnchanged,
  mapProposalToForm,
  SCHEDULE_CONFLICT_COPY,
  SCHEDULE_NOT_NOW_COPY,
  scheduleAmountLabel,
  scheduleDayLabel,
  scheduleKindLabel,
  scheduleRepeatCopy,
  subcategoryOptionsForScope,
  toScheduleWritePayload,
  validateScheduleForm,
  type ScheduleFormErrors,
  type ScheduleFormValues
} from "../../_lib/transactions-schedule";
import type { CatalogsResponse, TransactionHistoryItem } from "../../_lib/transactions-types";

type Props = {
  item: TransactionHistoryItem | null;
  open: boolean;
  catalogs: CatalogsResponse | null;
  onClose: () => void;
  onCreated: () => Promise<void>;
  onError: (message: string) => void;
};

const AMOUNT_MODE_OPTIONS = [
  { value: "fixed", label: "Monto fijo" },
  { value: "average", label: "Promedio del historial" }
] as const;

const FROM_TRANSACTION_ENDPOINT = "/api/bff/recurring-items/from-transaction";
const CATALOG_ENDPOINT = "/api/bff/catalogs/recurring-items";
const EXISTING_LINK_LABEL = "Ver en Programadas";

/**
 * Diálogo "Programar" del histórico. Contrasted con `Repetir`: aquel precarga el formulario de
 * captura para registrar la transacción **ahora**; este crea una plantilla recurrente que **se
 * repite cada mes** hacia adelante, y por eso la aritmética (día local, mes siguiente, rechazos)
 * llega derivada desde el backend en lugar de calcularse aquí.
 */
export function ScheduleRecurringDialog({ item, open, catalogs, onClose, onCreated, onError }: Props) {
  const [form, setForm] = useState<ScheduleFormValues | null>(null);
  const [errors, setErrors] = useState<ScheduleFormErrors>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictName, setConflictName] = useState<string | null>(null);
  // La propuesta normalizada es la referencia del "sin cambios": compararla contra el mismo objeto
  // que produjo el formulario deja claro cuándo se usa el endpoint de derivación y cuándo el alta.
  const [proposal, setProposal] = useState<RecurringItem | null>(null);
  const [derived, setDerived] = useState<{
    name: string;
    kind: string;
    amountMxn: number | null;
    amountMode: string;
    dayOfMonth: number;
    startsPeriod: string;
  } | null>(null);
  const requestId = useRef(0);

  // La lista de subcategorías se acota por la categoría derivada, no por `form.categoryId`: elegir
  // una subcategoría limpia el alcance de categoría, y sin esta referencia aparte la propia opción
  // elegida desaparecería de la lista. La aritmética del alcance XOR vive en el modelo.
  const [subcategoryScopeCategoryId, setSubcategoryScopeCategoryId] = useState<number | null>(null);

  const transactionId = item?.transactionId ?? null;

  // El `dryRun` se dispara al abrir y cada vez que cambia la fila. El contador invalida respuestas
  // tardías: si el usuario abre otra transacción antes de que resuelva la anterior, la vieja se
  // descarta en vez de pisar el formulario nuevo.
  useEffect(() => {
    if (!open || transactionId === null) {
      return;
    }

    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    setErrors({});
    setConflictName(null);
    setProposal(null);
    setDerived(null);
    setForm(null);
    setSubcategoryScopeCategoryId(null);

    (async () => {
      try {
        const response = await csrfFetch(FROM_TRANSACTION_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactionId, dryRun: true })
        });
        if (current !== requestId.current) {
          return;
        }

        if (!response.ok) {
          setError(await upstreamMessage(response, "No se pudo derivar la plantilla de la transacción."));
          return;
        }

        const payload = (await response.json().catch(() => null)) as {
          template?: RecurringItem | null;
        } | null;
        const template = payload?.template ?? null;
        if (!template) {
          setError("El backend no devolvió una propuesta para esta transacción.");
          return;
        }

        setDerived({
          name: template.name,
          kind: template.kind,
          amountMxn: template.amountMxn,
          amountMode: template.amountMode,
          dayOfMonth: template.dayOfMonth,
          startsPeriod: template.startsPeriod
        });
        setProposal(template);
        setForm(mapProposalToForm(template));
        setSubcategoryScopeCategoryId(template.categoryId);
      } catch {
        if (current === requestId.current) {
          setError("No se pudo conectar con el servidor.");
        }
      } finally {
        if (current === requestId.current) {
          setLoading(false);
        }
      }
    })();
  }, [open, transactionId]);

  const kind = form?.kind ?? "expense";
  const isIncome = kind === "income";
  const isAverage = form?.amountMode === "average";

  // Un ingreso solo admite categorías de ingreso; un gasto, categorías de gasto. La lista de
  // subcategorías se acota a las categorías visibles para no ofrecer un alcance que no valida.
  const categoryOptions = useMemo(() => {
    const categories = catalogs?.categoriesByType[isIncome ? "income" : "expense"] ?? catalogs?.categories ?? [];
    return categories;
  }, [catalogs, isIncome]);

  const subcategoryOptions = useMemo(() => {
    if (!catalogs) {
      return [];
    }

    return subcategoryOptionsForScope(catalogs.subcategories, subcategoryScopeCategoryId, kind);
  }, [catalogs, kind, subcategoryScopeCategoryId]);

  const patchForm = useCallback((patch: Partial<ScheduleFormValues>) => {
    setForm((current) => (current === null ? current : { ...current, ...patch }));
    setErrors({});
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!form || !transactionId) {
      return;
    }

    setErrors({});
    setError(null);
    setConflictName(null);

    // Camino corto: la propuesta no se tocó, así que se la deja escribir al propio endpoint de
    // derivación, que es el que conoce la transacción y la unicidad `(kind, name)`.
    if (proposal !== null && isProposalUnchanged(form, proposal)) {
      setSaving(true);
      try {
        const response = await csrfFetch(FROM_TRANSACTION_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactionId, dryRun: false })
        });

        if (response.status === 409) {
          // No se reintenta ni se reescribe: el nombre ya está ocupado y la plantilla existe.
          const payload = (await response.json().catch(() => null)) as { existing?: { name?: string } | null } | null;
          setConflictName(payload?.existing?.name?.trim() || form.name.trim());
          return;
        }

        if (!response.ok) {
          setError(await upstreamMessage(response, "No se pudo crear la plantilla recurrente."));
          return;
        }

        onError("");
        onClose();
        await onCreated();
      } catch {
        setError("No se pudo conectar con el servidor.");
      } finally {
        setSaving(false);
      }
      return;
    }

    // Camino editado: la plantilla ya no es la propuesta del backend, así que se valida con las
    // reglas de español del diálogo y la de escritura del contrato antes de salir.
    const validationErrors = validateScheduleForm(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const validation = validateRecurringItemPayload(toScheduleWritePayload(form));
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    setSaving(true);
    try {
      const response = await csrfFetch(CATALOG_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.data)
      });

      if (response.status === 409) {
        const payload = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
        setConflictName(form.name.trim());
        setError(payload?.message ?? payload?.Message ?? SCHEDULE_CONFLICT_COPY);
        return;
      }

      if (!response.ok) {
        setError(await upstreamMessage(response, "No se pudo crear la plantilla recurrente."));
        return;
      }

      onError("");
      onClose();
      await onCreated();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  }, [form, onClose, onCreated, onError, proposal, transactionId]);

  if (!open || !item) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[var(--color-overlay)] p-4 backdrop-blur-sm"
      role="presentation"
      onClick={saving || loading ? undefined : onClose}
    >
      <section
        className="app-card w-full max-w-2xl p-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="schedule-recurring-title"
        aria-describedby="schedule-recurring-desc"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="schedule-recurring-title" className="text-primary text-sm font-semibold">
          Programar recurrente
        </h3>
        <p id="schedule-recurring-desc" className="text-muted mt-1 text-sm">
          {SCHEDULE_NOT_NOW_COPY}
        </p>

        {loading ? (
          <p className="text-muted mt-4 text-sm">Derivando la propuesta desde la transacción...</p>
        ) : null}

        {/* Resumen de lo que el backend propuso. `kind` se muestra pero no se edita: el API lo
            trata como parte de la identidad de la plantilla. */}
        {derived ? (
          <dl className="mt-4 grid gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">Tipo</dt>
              <dd className="text-primary font-semibold">{scheduleKindLabel(derived.kind)}</dd>
            </div>
            <div>
              <dt className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">Monto</dt>
              <dd className="text-primary font-semibold">{scheduleAmountLabel(derived.amountMxn, derived.amountMode)}</dd>
            </div>
            <div>
              <dt className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">Día</dt>
              <dd className="text-primary font-semibold">{scheduleDayLabel(derived.dayOfMonth)}</dd>
            </div>
            <div>
              <dt className="text-muted text-[11px] font-bold uppercase tracking-[0.14em]">Periodo inicial</dt>
              <dd className="text-primary font-semibold">{derived.startsPeriod}</dd>
            </div>
            <p className="text-muted sm:col-span-2">
              {scheduleRepeatCopy(derived.name, derived.startsPeriod, derived.dayOfMonth)}
            </p>
          </dl>
        ) : null}

        {form ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Input
              label="Nombre"
              value={form.name}
              error={errors.name}
              maxLength={120}
              onChange={(event) => patchForm({ name: event.target.value })}
              required
            />

            <Select
              label="Modo de monto"
              value={form.amountMode}
              error={errors.amountMode}
              onChange={(event) => patchForm({ amountMode: event.target.value })}
              required
            >
              {AMOUNT_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>

            {/* En modo promedio el monto lo deriva el backend del historial: no se edita aquí. */}
            {isAverage ? (
              <div className="grid gap-1.5 text-sm font-medium text-primary">
                <span>Monto (MXN)</span>
                <p className="m-0 flex h-10 items-center border border-default bg-[var(--color-surface-3)] px-3 text-sm font-medium text-muted">
                  Se calcula con el historial
                </p>
              </div>
            ) : (
              <Input
                label="Monto (MXN)"
                type="number"
                inputMode="decimal"
                min={0.01}
                step={0.01}
                value={form.amountMxn}
                error={errors.amountMxn}
                onChange={(event) => patchForm({ amountMxn: event.target.value })}
                required
              />
            )}

            <Input
              label="Día del mes (1-31)"
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              step={1}
              value={form.dayOfMonth}
              error={errors.dayOfMonth}
              onChange={(event) => patchForm({ dayOfMonth: event.target.value })}
              required
            />

            <Select
              label="Cuenta"
              value={form.accountId ?? ""}
              onChange={(event) => patchForm({ accountId: event.target.value ? Number(event.target.value) : null })}
            >
              <option value="">Sin cuenta</option>
              {(catalogs?.accounts ?? []).map((account) => (
                <option key={account.accountId} value={account.accountId}>
                  {account.name}
                </option>
              ))}
            </Select>

            <Select
              label={isIncome ? "Categoría de ingreso" : "Categoría de gasto"}
              value={form.categoryId ?? ""}
              error={errors.scope}
              onChange={(event) => {
                const nextCategoryId = event.target.value ? Number(event.target.value) : null;
                setSubcategoryScopeCategoryId(nextCategoryId);
                patchForm({ categoryId: nextCategoryId, subcategoryId: null });
              }}
            >
              <option value="">Selecciona una categoría</option>
              {categoryOptions.map((category) => (
                <option key={category.categoryId} value={category.categoryId}>
                  {category.name}
                </option>
              ))}
            </Select>

            {/* El ingreso nunca se planifica por subcategoría: el selector se oculta. */}
            {isIncome ? null : (
              <Select
                label="Subcategoría de gasto"
                value={form.subcategoryId ?? ""}
                error={errors.scope}
                onChange={(event) => {
                  const nextSubcategoryId = event.target.value ? Number(event.target.value) : null;
                  // El alcance es XOR, así que se limpia la categoría; el acotamiento de la lista se
                  // conserva apuntando a la categoría de la subcategoría elegida.
                  const parentCategoryId = nextSubcategoryId === null
                    ? subcategoryScopeCategoryId
                    : catalogs?.subcategories.find((subcategory) => subcategory.subcategoryId === nextSubcategoryId)?.categoryId
                      ?? subcategoryScopeCategoryId;
                  setSubcategoryScopeCategoryId(parentCategoryId);
                  patchForm({ subcategoryId: nextSubcategoryId, categoryId: null });
                }}
              >
                <option value="">Sin subcategoría</option>
                {subcategoryOptions.map((subcategory) => (
                  <option key={subcategory.subcategoryId} value={subcategory.subcategoryId}>
                    {subcategory.name}
                  </option>
                ))}
              </Select>
            )}

            <Input
              label="Periodo inicial (aaaa-mm)"
              type="month"
              value={form.startsPeriod}
              error={errors.startsPeriod}
              onChange={(event) => patchForm({ startsPeriod: event.target.value })}
              required
            />
          </div>
        ) : null}

        {conflictName ? (
          <div className="mt-4">
            <Alert variant="danger">
              {SCHEDULE_CONFLICT_COPY}
              {conflictName ? `: ${conflictName}` : ""}. No se creó nada; edítala en el catálogo si querías ajustarla.
            </Alert>
            <a href="/catalogs/recurring-items" className="text-primary mt-2 inline-block text-sm font-semibold underline">
              {EXISTING_LINK_LABEL}
            </a>
          </div>
        ) : null}

        {error ? <Alert variant="danger" className="mt-4">{error}</Alert> : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            loading={loading || saving}
            loadingText={loading ? "Derivando..." : "Guardando..."}
            disabled={!form || loading}
          >
            Crear plantilla
          </Button>
        </div>
      </section>
    </div>
  );
}

/** El motivo del backend es más útil que un texto genérico; 404 significa que no es del usuario. */
async function upstreamMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { message?: string; Message?: string } | null;
  if (response.status === 404) {
    return body?.message ?? body?.Message ?? "La transacción no existe o no pertenece a tu cuenta.";
  }

  return body?.message ?? body?.Message ?? fallback;
}
