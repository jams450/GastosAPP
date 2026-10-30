import assert from "node:assert/strict";
import { test } from "node:test";
import { describeJobSchedule, isRunInProgress, normalizeJobRunDetail } from "./jobs-runs.ts";
import { partialRun } from "./jobs-test-payloads.ts";

test("normalizeJobRunDetail usa la clave como nombre cuando falta el nombre legible", () => {
  const detail = normalizeJobRunDetail({ ...partialRun, JobDisplayName: "Ingesta diaria de correo" });
  assert.equal(detail?.jobDisplayName, "Ingesta diaria de correo");
  assert.equal(detail?.jobRunId, 42);

  const withoutName = normalizeJobRunDetail(partialRun);
  assert.equal(withoutName?.jobDisplayName, "email_ingest");

  assert.equal(normalizeJobRunDetail({ JobRunId: 1 }), null);
  assert.equal(normalizeJobRunDetail(null), null);
});

test("describeJobSchedule describe los tres horarios y el horario desconocido", () => {
  assert.equal(describeJobSchedule(null), "Horario no disponible");
  assert.equal(
    describeJobSchedule({ kind: "daily", hourUtc: 6, intervalSeconds: null, runsAtStartup: false }),
    "Diario a las 06:00 UTC"
  );
  assert.equal(
    describeJobSchedule({ kind: "startup_daily", hourUtc: 3, intervalSeconds: null, runsAtStartup: true }),
    "Al arrancar y diario a las 03:00 UTC"
  );
  assert.equal(
    describeJobSchedule({ kind: "interval", hourUtc: null, intervalSeconds: 3600, runsAtStartup: true }),
    "Al arrancar y cada 1 h"
  );
  assert.equal(
    describeJobSchedule({ kind: "interval", hourUtc: null, intervalSeconds: 300, runsAtStartup: true }),
    "Al arrancar y cada 5 min"
  );
  assert.equal(
    describeJobSchedule({ kind: "interval", hourUtc: null, intervalSeconds: 45, runsAtStartup: false }),
    "Cada 45 s"
  );
});

test("isRunInProgress solo marca la corrida abierta", () => {
  assert.equal(isRunInProgress({ status: "running" }), true);
  assert.equal(isRunInProgress({ status: "succeeded" }), false);
  assert.equal(isRunInProgress(null), false);
  assert.equal(isRunInProgress(undefined), false);
});
