"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { annualSummaryYearOptions } from "@/lib/contracts/account-annual-summary";

type Props = {
  year: number;
  /** Primer año ofrecible, derivado del inicio de la cuenta. */
  earliestYear: number;
  latestYear: number;
  disabled?: boolean;
  onChange: (year: number) => void;
};

export function AccountAnnualYearSelector({ year, earliestYear, latestYear, disabled = false, onChange }: Props) {
  // Un año pedido por URL fuera del rango declarado de la cuenta se agrega a las opciones en
  // lugar de dejar el `select` en blanco.
  const options = annualSummaryYearOptions(Math.min(earliestYear, year), Math.max(latestYear, year));
  const canStepBack = year - 1 >= Math.min(earliestYear, year);
  const canStepForward = year + 1 <= Math.max(latestYear, year);

  return (
    <div className="flex items-end gap-2">
      <Button
        type="button"
        variant="secondary"
        className="h-10 w-10 shrink-0 px-0"
        aria-label={`Ver el año ${year - 1}`}
        disabled={disabled || !canStepBack}
        onClick={() => onChange(year - 1)}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Button>

      <Select label="Año" value={year} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>

      <Button
        type="button"
        variant="secondary"
        className="h-10 w-10 shrink-0 px-0"
        aria-label={`Ver el año ${year + 1}`}
        disabled={disabled || !canStepForward}
        onClick={() => onChange(year + 1)}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
