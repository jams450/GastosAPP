import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeJobError } from "./jobs-errors.ts";

test("normalizeJobError conserva los códigos del contrato de la API", () => {
  const cases: [unknown, number, string, string][] = [
    [{ code: "confirmation_required", message: "Falta confirmar" }, 400, "CONFIRMATION_REQUIRED", "Falta confirmar"],
    [{ code: "unknown_job", message: "No existe" }, 400, "UNKNOWN_JOB", "No existe"],
    [{ code: "already_running", message: "Ya corre", currentRunId: 71 }, 409, "ALREADY_RUNNING", "Ya corre"],
    [{ code: "shutting_down", message: "Apagando" }, 503, "SHUTTING_DOWN", "Apagando"],
    [{ code: "history_unavailable", message: "Sin historial" }, 500, "HISTORY_UNAVAILABLE", "Sin historial"]
  ];

  for (const [payload, status, code, message] of cases) {
    const error = normalizeJobError(payload, status);
    assert.equal(error.code, code);
    assert.equal(error.message, message);
  }

  assert.equal(normalizeJobError(cases[2][0], 409).currentRunId, 71);
});

test("normalizeJobError lee PascalCase, ignora un currentRunId inválido y cae al estado HTTP", () => {
  const pascal = normalizeJobError(
    { Code: "already_running", Message: "El job ya está en ejecución.", CurrentRunId: 12 },
    409
  );
  assert.equal(pascal.code, "ALREADY_RUNNING");
  assert.equal(pascal.currentRunId, 12);

  const invalidRun = normalizeJobError({ Code: "already_running", CurrentRunId: "abc" }, 409);
  assert.equal(invalidRun.currentRunId, null);

  const uppercase = normalizeJobError({ code: "BAD_REQUEST", message: "Inválido", traceId: "t-1" }, 400);
  assert.equal(uppercase.code, "BAD_REQUEST");
  assert.equal(uppercase.traceId, "t-1");

  const fromStatus = normalizeJobError({ message: "Sin código" }, 500);
  assert.equal(fromStatus.code, "UPSTREAM_ERROR");

  assert.equal(normalizeJobError(null, 401).code, "SESSION_EXPIRED");
  assert.equal(normalizeJobError(undefined, 403).code, "FORBIDDEN");
  assert.equal(normalizeJobError("nope", 400).code, "BAD_REQUEST");
  assert.equal(normalizeJobError({}, 418).code, "UPSTREAM_ERROR");
});
