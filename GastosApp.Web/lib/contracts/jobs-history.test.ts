import assert from "node:assert/strict";
import { test } from "node:test";
import { buildJobHistoryQuery, hasJobHistoryShape, normalizeJobHistory } from "./jobs-history.ts";
import { JOB_TRIGGERS } from "./jobs-vocabulary.ts";
import { partialRun, runningRun } from "./jobs-test-payloads.ts";

test("normalizeJobHistory lee la página y filtra filas inservibles", () => {
  const result = normalizeJobHistory(
    {
      Items: [partialRun, runningRun, { ...partialRun, JobRunId: 0 }, { ...partialRun, Status: "teleported" }, { ...partialRun, Trigger: "cron" }, { ...partialRun, StartedAtUtc: "ayer" }],
      Page: 2,
      PageSize: 25,
      TotalCount: 61,
      TotalPages: 3
    },
    { page: 1, pageSize: 10 }
  );

  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 25);
  assert.equal(result.totalCount, 61);
  assert.equal(result.totalPages, 3);
  assert.deepEqual(
    result.items.map((item) => item.jobRunId),
    [42, 43]
  );
});

test("normalizeJobHistory corrige página y tamaño fuera de rango y deriva totalPages", () => {
  const result = normalizeJobHistory(
    { Items: [partialRun], Page: 0, PageSize: 10_000, TotalCount: 21 },
    { page: 3, pageSize: 25 }
  );

  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 100);
  assert.equal(result.totalCount, 21);
  assert.equal(result.totalPages, 1);

  const fallback = normalizeJobHistory({}, { page: 0, pageSize: 0 });
  assert.equal(fallback.page, 1);
  assert.equal(fallback.pageSize, 25);
  assert.deepEqual(fallback.items, []);
  assert.equal(fallback.totalPages, 0);
});

test("hasJobHistoryShape exige el sobre con la lista de corridas", () => {
  assert.equal(hasJobHistoryShape({ Items: [] }), true);
  assert.equal(hasJobHistoryShape({ items: [] }), true);
  assert.equal(hasJobHistoryShape([]), false);
  assert.equal(hasJobHistoryShape({ Page: 1 }), false);
  assert.equal(hasJobHistoryShape(undefined), false);
});

test("buildJobHistoryQuery arma la query con filtros válidos y página acotada", () => {
  assert.equal(
    buildJobHistoryQuery({ jobKey: "all", status: "all", trigger: "all", page: 1, pageSize: 10 }),
    "page=1&pageSize=10"
  );

  assert.equal(
    buildJobHistoryQuery({ jobKey: "email_ingest", status: "failed", trigger: "manual", page: 2, pageSize: 25 }),
    "jobKey=email_ingest&status=failed&trigger=manual&page=2&pageSize=25"
  );

  assert.equal(
    buildJobHistoryQuery({ jobKey: "all", status: "all", trigger: "all", page: 0, pageSize: 1000 }),
    "page=1&pageSize=100"
  );

  assert.equal(JOB_TRIGGERS.length, 2);
});
