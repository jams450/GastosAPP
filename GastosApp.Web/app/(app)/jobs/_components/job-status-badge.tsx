import type { JobStatus, JobTrigger } from "@/lib/contracts/jobs";
import { JOB_STATUS_LABELS, JOB_TRIGGER_LABELS, statusBadgeClass } from "../_lib/jobs-ui";

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={statusBadgeClass(status)}>
      {status === "running" ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" /> : null}
      {JOB_STATUS_LABELS[status]}
    </span>
  );
}

export function JobTriggerBadge({ trigger }: { trigger: JobTrigger }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-3)] px-2 py-0.5 text-[10px] font-semibold text-secondary">
      {JOB_TRIGGER_LABELS[trigger]}
    </span>
  );
}
