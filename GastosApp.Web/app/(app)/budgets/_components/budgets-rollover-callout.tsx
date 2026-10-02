"use client";

import { CalendarSync } from "lucide-react";
import { useCallback, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { parseApiError } from "@/lib/bff/client-session";
import { normalizeBudgetRollover, type BudgetRolloverResponse } from "@/lib/contracts/budgets";
import { csrfFetch } from "@/lib/security/csrf-client";
import {
  DEFAULT_ROLLOVER_MODE,
  isRolloverNoop,
  resolveRolloverMode,
  ROLLOVER_MODES,
  summarizeRolloverCounts,
  validateRolloverRequest
} from "../_lib/budget-rollover-model";
import { formatPeriodLabel } from "../_lib/budgets-ui";

type Props = {
  /** Periodo destino: el mes abierto que no tiene presupuestos. */
  period: string;
  /** Periodo origen: el mes anterior, del que se clonaría el plan. */
  previousPeriod: string;
  onCompleted: () => Promise<void>;
  onError: (message: string) => void;
};

const ROLLOVER_ENDPOINT = "/api/bff/budgets/rollover";
const ROLLOVER_ERROR_COPY = "No se pudo remontar el plan del mes anterior.";

/** El motivo del backend es más útil que un texto genérico, también en el 409 de "mes ya ocupado". */
async function rolloverError(response: Response, fallback: string): Promise<Error> {
  try {
    return await parseApiError(response, fallback);
  } catch {
    return new Error(fallback);
  }
}

/**
 * "Remontar mes" del plan (sección 2.4 del plan de fase 3).
 *
 * La regla primaria es "sin sorpresas": abrir un mes sin presupuestos **ofrece** clonar el anterior
 * como acción explícita, nunca como job automático. Por eso el camino es siempre en dos pasos: una
 * previsualización con `dryRun: true` habilita el botón de confirmación, y solo ese botón envía la
 * misma petición con `dryRun: false`. Sin previsualización previa no existe un `dryRun: false` en el
 * código: es imposible aplicar sin haber mirado antes qué se va a escribir.
 */
export function BudgetsRolloverCallout({ period, previousPeriod, onCompleted, onError }: Props) {
  const [mode, setMode] = useState<string>(DEFAULT_ROLLOVER_MODE);
  const [preview, setPreview] = useState<BudgetRolloverResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [appliedSummary, setAppliedSummary] = useState<string | null>(null);

  const busy = previewing || applying;
  const resolvedMode = resolveRolloverMode(mode);
  // La previsualización vale solo para el modo con el que se generó: cambiarla invalida el botón.
  const previewMatchesMode = preview !== null && preview.mode === resolvedMode;
  const previewIsNoop = previewMatchesMode && isRolloverNoop(preview);

  const request = useCallback(
    async (dryRun: boolean): Promise<BudgetRolloverResponse> => {
      const response = await csrfFetch(ROLLOVER_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromPeriod: previousPeriod, toPeriod: period, mode: resolvedMode, dryRun })
      });

      if (!response.ok) {
        throw await rolloverError(response, ROLLOVER_ERROR_COPY);
      }

      return normalizeBudgetRollover(await response.json().catch(() => null));
    },
    [period, previousPeriod, resolvedMode]
  );

  const runPreview = useCallback(async () => {
    const validation = validateRolloverRequest({ fromPeriod: previousPeriod, toPeriod: period, mode: resolvedMode });
    if (validation !== null) {
      setValidationError(validation);
      setPreview(null);
      onError(validation);
      return;
    }

    setPreviewing(true);
    setValidationError(null);
    setPreviewError(null);
    setAppliedSummary(null);

    try {
      setPreview(await request(true));
    } catch (err) {
      setPreview(null);
      const message = err instanceof Error ? err.message : ROLLOVER_ERROR_COPY;
      setPreviewError(message);
      onError(message);
    } finally {
      setPreviewing(false);
    }
  }, [onError, period, previousPeriod, request, resolvedMode]);

  const runApply = useCallback(async () => {
    // El botón solo se habilita tras una previsualización no vacía del mismo modo; el guard repite
    // la condición para que la escritura nunca dependa solo del `disabled` de la vista.
    if (!previewMatchesMode || previewIsNoop) {
      return;
    }

    setApplying(true);
    setPreviewError(null);

    try {
      const result = await request(false);
      setAppliedSummary(summarizeRolloverCounts(result));
      setPreview(result);
      onError("");
      await onCompleted();
    } catch (err) {
      const message = err instanceof Error ? err.message : ROLLOVER_ERROR_COPY;
      setPreviewError(message);
      onError(message);
    } finally {
      setApplying(false);
    }
  }, [onCompleted, onError, previewIsNoop, previewMatchesMode, request]);

  return (
    <section className="app-panel px-4 py-3" aria-busy={busy} aria-labelledby="budgets-rollover-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <CalendarSync className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <h2 id="budgets-rollover-title" className="m-0 text-sm font-semibold text-primary">
              Este mes todavía no tiene presupuestos
            </h2>
            <p className="m-0 max-w-2xl text-[13px] text-muted">
              Puedes clonar el plan de {formatPeriodLabel(previousPeriod)} a {formatPeriodLabel(period)}. Los presupuestos se copian
              con sus umbrales y las partidas se remontan según el modo. Nada se escribe hasta que confirmes la previsualización.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,18rem)_auto] sm:items-end">
        <Select
          id="budgets-rollover-mode"
          label="Qué se copia del mes anterior"
          value={resolvedMode}
          disabled={busy}
          onChange={(event) => {
            setMode(event.target.value);
            // El modo es parte de la petición: cambiarlo invalida la previsualización anterior.
            setPreview(null);
            setAppliedSummary(null);
          }}
        >
          {ROLLOVER_MODES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            className="h-9 rounded-none px-3 text-xs font-bold"
            disabled={busy}
            loading={previewing}
            loadingText="Previsualizando..."
            onClick={() => void runPreview()}
          >
            Previsualizar
          </Button>

          <Button
            type="button"
            className="h-9 rounded-none px-3 text-xs font-bold"
            // Confirmar exige una previsualización previa, vigente y con algo que insertar.
            disabled={busy || !previewMatchesMode || previewIsNoop}
            loading={applying}
            loadingText="Remontando..."
            onClick={() => void runApply()}
          >
            Confirmar y clonar
          </Button>
        </div>
      </div>

      <p className="m-0 mt-1.5 text-[11px] text-muted">
        {ROLLOVER_MODES.find((item) => item.value === resolvedMode)?.description}
      </p>

      {validationError ? (
        <Alert variant="danger" className="mt-3">
          {validationError}
        </Alert>
      ) : null}

      {previewError ? (
        <Alert variant="danger" className="mt-3">
          {previewError}
        </Alert>
      ) : null}

      {appliedSummary ? (
        <Alert variant="info" className="mt-3" role="status">
          {appliedSummary}
        </Alert>
      ) : null}

      {previewMatchesMode ? (
        previewIsNoop ? (
          <Alert variant="info" className="mt-3" role="status">
            No hay nada que clonar de {formatPeriodLabel(previousPeriod)}: ese mes no tiene presupuestos ni partidas que remontar.
          </Alert>
        ) : (
          <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5" role="status">
            <p className="m-0 text-sm text-primary">{summarizeRolloverCounts(preview)}</p>
            <p className="m-0 mt-1 text-[11px] text-muted">
              Previsualización: aún no se escribió nada. Al confirmar se ejecuta exactamente esta misma petición.
            </p>
          </div>
        )
      ) : null}
    </section>
  );
}
