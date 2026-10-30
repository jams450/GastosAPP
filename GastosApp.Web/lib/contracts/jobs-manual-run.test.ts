import assert from "node:assert/strict";
import { test } from "node:test";
import { buildManualRunRequest, normalizeManualRunAccepted, validateManualRunReason } from "./jobs-manual-run.ts";

test("normalizeManualRunAccepted solo acepta una corrida manual ya abierta", () => {
  const accepted = normalizeManualRunAccepted({
    JobRunId: 91,
    JobKey: "alert_dispatch",
    Trigger: "manual",
    Status: "running",
    StartedAtUtc: "2026-11-01T11:00:00+00:00"
  });

  assert.deepEqual(accepted, {
    jobRunId: 91,
    jobKey: "alert_dispatch",
    trigger: "manual",
    status: "running",
    startedAtUtc: "2026-11-01T11:00:00.000Z"
  });

  assert.equal(normalizeManualRunAccepted({ ...accepted, jobRunId: 0 }), null);
  assert.equal(normalizeManualRunAccepted({ ...accepted, status: "queued" }), null);
  assert.equal(normalizeManualRunAccepted({ ...accepted, trigger: "automatic" }), null);
  assert.equal(normalizeManualRunAccepted(null), null);
});

test("buildManualRunRequest exige confirmación y acota el motivo a 200 caracteres", () => {
  assert.deepEqual(buildManualRunRequest("   "), { ok: true, body: { Confirm: true } });
  assert.deepEqual(buildManualRunRequest(null), { ok: true, body: { Confirm: true } });
  assert.deepEqual(buildManualRunRequest("  revisión manual  "), {
    ok: true,
    body: { Confirm: true, Reason: "revisión manual" }
  });

  assert.deepEqual(buildManualRunRequest("a".repeat(200)), {
    ok: true,
    body: { Confirm: true, Reason: "a".repeat(200) }
  });

  const tooLong = buildManualRunRequest("a".repeat(201));
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.ok === false ? tooLong.message : "", /200/);

  assert.deepEqual(validateManualRunReason("  "), { ok: true, reason: null });
  assert.deepEqual(validateManualRunReason(" motivo "), { ok: true, reason: "motivo" });
  assert.equal(validateManualRunReason("a".repeat(201)).ok, false);
});
