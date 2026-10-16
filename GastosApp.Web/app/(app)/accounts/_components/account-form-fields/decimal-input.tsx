"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";

/**
 * Acepta sólo dígitos, un punto decimal y un signo negativo inicial, de modo que
 * los estados intermedios de captura como "1500.", "-", ".5" o "-." no se pierdan
 * mientras el usuario sigue escribiendo.
 */
const DECIMAL_DRAFT_PATTERN = /^-?\d*\.?\d*$/;

type DecimalInputProps = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number | null;
  onChange: (value: number | null) => void;
  /** Cuando es true, un campo vacío emite null en lugar de 0. */
  nullable?: boolean;
};

export function decimalDraftFromValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "";
  }
  return String(value);
}

export function parseDecimalDraft(draft: string): number | null {
  if (draft === "" || draft === "-" || draft === "." || draft === "-.") {
    return null;
  }
  const parsed = Number(draft);
  return Number.isFinite(parsed) ? parsed : null;
}

export function emitDecimalDraft(draft: string, nullable: boolean): number | null {
  const parsed = parseDecimalDraft(draft);
  if (parsed !== null) {
    return parsed;
  }
  return nullable ? null : 0;
}

/**
 * Input decimal que conserva un borrador de texto mientras se edita y sólo
 * propaga el valor numérico al payload cuando el borrador es interpretable.
 */
export function DecimalInput({ value, onChange, nullable = false, inputMode = "decimal", ...inputProps }: DecimalInputProps) {
  const [draft, setDraft] = useState(() => decimalDraftFromValue(value));
  const lastEmitted = useRef(value);

  useEffect(() => {
    // Reset externo: si el valor cambió fuera de esta captura (crear/editar cuenta),
    // se descarta el borrador y se sincroniza con el valor numérico recibido.
    if (lastEmitted.current !== value) {
      lastEmitted.current = value;
      setDraft(decimalDraftFromValue(value));
    }
  }, [value]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    if (!DECIMAL_DRAFT_PATTERN.test(next)) {
      return;
    }
    setDraft(next);
    const emitted = emitDecimalDraft(next, nullable);
    lastEmitted.current = emitted;
    onChange(emitted);
  }

  return <Input {...inputProps} type="text" inputMode={inputMode} value={draft} onChange={handleChange} />;
}
