import assert from "node:assert/strict";
import { test } from "node:test";
import { JOB_KEYS, JOB_STATUSES, JOB_TRIGGERS, isJobKey, isJobStatus, isJobTrigger } from "./jobs-vocabulary.ts";

test("los guardas de vocabulario aceptan solo claves, estados y orígenes del contrato", () => {
  for (const key of JOB_KEYS) assert.equal(isJobKey(key), true);
  assert.equal(isJobKey("drop_everything"), false);
  assert.equal(isJobKey("EMAIL_INGEST"), false);

  for (const status of JOB_STATUSES) assert.equal(isJobStatus(status), true);
  assert.equal(isJobStatus("queued"), false);

  for (const trigger of JOB_TRIGGERS) assert.equal(isJobTrigger(trigger), true);
  assert.equal(isJobTrigger("cron"), false);
});
