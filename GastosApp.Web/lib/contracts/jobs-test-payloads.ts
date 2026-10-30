/**
 * Payloads con la forma exacta que entrega la API (PascalCase, S1/L7), compartidos por las pruebas
 * del contrato de jobs. No son un test: no los ejecuta `node --test`, solo los importan los módulos
 * `jobs-*.test.ts` que verifiquen catálogo, historial y detalle.
 */

export const partialRun = {
  JobRunId: 42,
  JobKey: "email_ingest",
  Trigger: "manual",
  Status: "partial",
  StartedAtUtc: "2026-11-01T08:00:00+00:00",
  FinishedAtUtc: "2026-11-01T08:00:05.500+00:00",
  DurationMs: 5500,
  RequestedBy: "admin@example.com",
  ItemsProcessed: 12,
  ItemsFailed: 3,
  OutcomeCode: "partial_delivery",
  FailureType: "TimeoutException"
};

export const runningRun = {
  JobRunId: 43,
  JobKey: "fx_rate_sync",
  Trigger: "automatic",
  Status: "running",
  StartedAtUtc: "2026-11-01T09:00:00+00:00",
  FinishedAtUtc: null,
  DurationMs: null,
  RequestedBy: null,
  ItemsProcessed: 0,
  ItemsFailed: 0,
  OutcomeCode: null,
  FailureType: null
};

export const catalogItem = {
  JobKey: "email_ingest",
  DisplayName: "Ingesta diaria de correo",
  Description: "Etiqueta el correo sin etiquetas de usuario.",
  AutomaticEnabled: true,
  AutomaticEnabledBy: "Email:Ingest:Enabled",
  ManualRunAllowed: true,
  ConfiguredOwnerUserId: 7,
  OwnerConfiguredBy: "Email:Ingest:UserId",
  Schedule: {
    Kind: "daily",
    HourUtc: 6,
    IntervalSeconds: null,
    RunsAtStartup: false
  },
  NextRunAtUtc: "2026-11-02T06:00:00+00:00",
  Current: null,
  Last: partialRun,
  Counts: { Running: 0, Succeeded: 2, Partial: 1, Failed: 0, Skipped: 0, Interrupted: 0, Total: 3 }
};

export const catalogPayload = {
  GeneratedAtUtc: "2026-11-01T10:00:00+00:00",
  Jobs: [catalogItem],
  Totals: { Running: 1, Succeeded: 2, Partial: 1, Failed: 0, Skipped: 0, Interrupted: 0, Total: 4 }
};
