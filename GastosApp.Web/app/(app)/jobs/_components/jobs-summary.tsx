import { Card } from "@/components/ui/card";
import { JOB_STATUSES, type JobStatusCounts } from "@/lib/contracts/jobs";
import { JOB_STATUS_LABELS } from "../_lib/jobs-ui";
import { JobStatusBadge } from "./job-status-badge";

type Props = { totals: JobStatusCounts };

/**
 * Conteos globales del historial. Se muestran los seis estados —no solo los fallos— porque el módulo
 * existe para ver el estado completo de los jobs; el total es la suma de esos seis.
 */
export function JobsSummary({ totals }: Props) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7" aria-label="Conteos del historial de jobs">
      <Card className="p-3">
        <p className="text-muted text-xs font-semibold uppercase tracking-[0.1em]">Corridas registradas</p>
        <p className="text-primary mt-2 text-2xl font-semibold tabular-nums">{totals.total}</p>
        <p className="text-muted mt-1 text-[11px]">Historial completo, sin retención destructiva.</p>
      </Card>

      {JOB_STATUSES.map((status) => (
        <Card key={status} className="p-3">
          <JobStatusBadge status={status} />
          <p className="text-primary mt-2 text-2xl font-semibold tabular-nums">{totals[status]}</p>
          <p className="text-muted mt-1 text-[11px]">{JOB_STATUS_LABELS[status]}</p>
        </Card>
      ))}
    </section>
  );
}
