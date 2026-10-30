import assert from "node:assert/strict";
import { test } from "node:test";
import { hasJobOverviewShape, normalizeJobOverview } from "./jobs-overview.ts";
import { emptyJobStatusCounts } from "./jobs-runs.ts";
import { JOB_KEYS, JOB_STATUSES } from "./jobs-vocabulary.ts";
import { catalogItem, catalogPayload, partialRun, runningRun } from "./jobs-test-payloads.ts";

test("normalizeJobOverview devuelve valores seguros para una entrada inservible", () => {
  for (const input of [null, undefined, 42, "catalog", [], {}]) {
    const result = normalizeJobOverview(input);

    assert.deepEqual(result.jobs, []);
    assert.deepEqual(result.totals, emptyJobStatusCounts());
    assert.equal(result.generatedAtUtc, null);
  }
});

test("normalizeJobOverview lee el contrato PascalCase completo", () => {
  const result = normalizeJobOverview(catalogPayload);

  assert.equal(result.generatedAtUtc, "2026-11-01T10:00:00.000Z");
  assert.equal(result.jobs.length, 1);

  const [job] = result.jobs;
  assert.equal(job.jobKey, "email_ingest");
  assert.equal(job.displayName, "Ingesta diaria de correo");
  assert.equal(job.description, "Etiqueta el correo sin etiquetas de usuario.");
  assert.equal(job.automaticEnabled, true);
  assert.equal(job.automaticEnabledBy, "Email:Ingest:Enabled");
  assert.equal(job.manualRunAllowed, true);
  assert.equal(job.configuredOwnerUserId, 7);
  assert.equal(job.ownerConfiguredBy, "Email:Ingest:UserId");
  assert.deepEqual(job.schedule, {
    kind: "daily",
    hourUtc: 6,
    intervalSeconds: null,
    runsAtStartup: false
  });
  assert.equal(job.nextRunAtUtc, "2026-11-02T06:00:00.000Z");
  assert.equal(job.current, null);

  assert.equal(job.last?.jobRunId, 42);
  assert.equal(job.last?.jobKey, "email_ingest");
  assert.equal(job.last?.trigger, "manual");
  assert.equal(job.last?.status, "partial");
  assert.equal(job.last?.startedAtUtc, "2026-11-01T08:00:00.000Z");
  assert.equal(job.last?.finishedAtUtc, "2026-11-01T08:00:05.500Z");
  assert.equal(job.last?.durationMs, 5500);
  assert.equal(job.last?.requestedBy, "admin@example.com");
  assert.equal(job.last?.itemsProcessed, 12);
  assert.equal(job.last?.itemsFailed, 3);
  assert.equal(job.last?.outcomeCode, "partial_delivery");
  assert.equal(job.last?.failureType, "TimeoutException");

  assert.equal(job.counts.succeeded, 2);
  assert.equal(job.counts.partial, 1);
  assert.equal(job.counts.total, 3);

  assert.equal(result.totals.running, 1);
  assert.equal(result.totals.total, 4);
});

test("normalizeJobOverview descarta claves y estados fuera del vocabulario", () => {
  const result = normalizeJobOverview({
    GeneratedAtUtc: "2026-11-01T10:00:00+00:00",
    Jobs: [
      { ...catalogItem, JobKey: "drop_everything" },
      { ...catalogItem, JobKey: "fx_rate_sync", DisplayName: "" },
      catalogItem,
      { ...catalogItem, JobKey: "recurring_execution", DisplayName: "Repetido", Counts: { Running: "x", Bogus: 9 } },
      { ...catalogItem, JobKey: "recurring_execution", DisplayName: "Duplicado" }
    ],
    // Un estado desconocido no puede inflar el total.
    Totals: { Running: 1, Succeeded: "2", Failed: 4, Teleported: 100, Total: 999 }
  });

  assert.deepEqual(
    result.jobs.map((job) => job.jobKey),
    ["email_ingest", "recurring_execution"]
  );
  assert.equal(result.jobs[1].displayName, "Repetido");
  assert.equal(result.jobs[1].counts.running, 0);
  assert.equal(result.jobs[1].counts.total, 0);

  assert.equal(result.totals.running, 1);
  assert.equal(result.totals.succeeded, 2);
  assert.equal(result.totals.failed, 4);
  assert.equal(result.totals.total, 7);
});

test("normalizeJobOverview acepta los seis estados, los tres horarios y el horario ausente", () => {
  const statuses = [...JOB_STATUSES];
  const jobs = JOB_KEYS.map((jobKey, index) => ({
    ...catalogItem,
    JobKey: jobKey,
    DisplayName: `Job ${index}`,
    Schedule:
      index === 0
        ? { Kind: "daily", HourUtc: 6 }
        : index === 1
          ? { Kind: "startup_daily", HourUtc: 3, RunsAtStartup: true }
          : index === 2
            ? { Kind: "interval", IntervalSeconds: 60, RunsAtStartup: true }
            : { Kind: "solar_flare" },
    NextRunAtUtc: null,
    Current: index === 0 ? runningRun : null,
    Counts: Object.fromEntries(statuses.map((status, position) => [status, position]))
  }));

  const result = normalizeJobOverview({ Jobs: jobs });

  assert.equal(result.jobs.length, JOB_KEYS.length);
  assert.deepEqual(
    result.jobs.map((job) => job.schedule?.kind ?? null),
    ["daily", "startup_daily", "interval", null, null]
  );
  assert.equal(result.jobs[0].current?.status, "running");
  // Una corrida en curso no publica fin ni duración.
  assert.equal(result.jobs[0].current?.finishedAtUtc, null);
  assert.equal(result.jobs[0].current?.durationMs, null);

  for (const status of statuses) {
    assert.ok(result.jobs[0].counts[status] >= 0);
  }
  assert.equal(result.jobs[0].counts.total, statuses.reduce((sum, status, position) => sum + position, 0));
});

test("normalizeJobOverview acepta su propia salida (idempotencia del BFF al cliente)", () => {
  const once = normalizeJobOverview(catalogPayload);
  const twice = normalizeJobOverview(once);

  assert.deepEqual(twice, once);
});

test("hasJobOverviewShape exige el sobre con la lista de jobs", () => {
  assert.equal(hasJobOverviewShape(catalogPayload), true);
  assert.equal(hasJobOverviewShape(catalogPayload.Jobs), false);
  assert.equal(hasJobOverviewShape(null), false);
  assert.equal(hasJobOverviewShape({ Total: 1 }), false);
});
