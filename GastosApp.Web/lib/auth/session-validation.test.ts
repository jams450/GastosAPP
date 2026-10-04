import { test } from "node:test";
import assert from "node:assert/strict";
import { autoRefresh, validateSession } from "./session-validation.ts";
import { createSessionBootstrap, observeBootstrap } from "./session-bootstrap.ts";

const session = { accessToken: "old", refreshToken: "renew" };
const rotated = { accessToken: "new", refreshToken: "next" };
const response = (status: number) => new Response(null, { status });

for (const status of [200, 401, 503, 429, 403]) {
  test(`validation maps upstream ${status}`, async () => {
    const result = await validateSession(session, async () => ({ response: response(status), session }));
    assert.equal(result.status, status === 200 ? 200 : status === 401 ? 401 : 503);
  });
}
test("missing session never calls upstream", async () => {
  assert.equal((await validateSession(null, async () => { throw Error("unexpected"); })).status, 401);
});
test("network failure is retryable", async () => {
  assert.equal((await validateSession(session, async () => { throw Error("offline"); })).status, 503);
});
test("expired access renews, revalidates and returns rotated session", async () => {
  const tokens: string[] = [];
  const result = await validateSession(session, (s) => autoRefresh(s, async (token) => {
    tokens.push(token);
    return response(token === "old" ? 401 : 200);
  }, async () => rotated));
  assert.deepEqual(tokens, ["old", "new"]);
  assert.equal(result.status, 200);
  assert.equal(result.session, rotated);
});
test("valid token does not refresh", async () => {
  await autoRefresh(session, async () => response(200), async () => { throw Error("unexpected"); });
});
test("revoked refresh and missing refresh remain terminal", async () => {
  for (const s of [session, { accessToken: "old" }]) {
    assert.equal((await autoRefresh(s, async () => response(401), async () => response(401))).response.status, 401);
  }
});
test("refresh unavailable does not become terminal 401", async () => {
  for (const status of [500, 503, 429]) {
    const result = await validateSession(session, (s) => autoRefresh(s, async () => response(401), async () => {
      return response(status);
    }));
    assert.equal(result.status, 503);
  }
});
test("rotated session survives probe failure for cookie persistence", async () => {
  for (const fail of [false, true]) {
    const result = await validateSession(session, (s) => autoRefresh(s, async (token) => {
      if (token === "old") return response(401);
      if (fail) throw Error("offline after rotation");
      return response(503);
    }, async () => rotated));
    assert.equal(result.status, 503);
    assert.equal(result.session, rotated);
  }
});
test("refresh network failure remains retryable", async () => {
  const result = await validateSession(session, (s) => autoRefresh(s, async () => response(401), async () => {
    throw Error("offline refresh");
  }));
  assert.equal(result.status, 503);
});
test("rotated token rejected by API remains terminal", async () => {
  assert.equal((await autoRefresh(session, async () => response(401), async () => rotated)).response.status, 401);
});
test("bootstrap deduplicates overlapping mounts but retry starts fresh", async () => {
  let calls = 0;
  let resolve!: (value: Response) => void;
  const bootstrap = createSessionBootstrap(() => {
    calls++;
    return new Promise<Response>((r) => { resolve = r; });
  });
  const first = bootstrap();
  assert.equal(bootstrap(), first);
  resolve(response(503));
  assert.equal(await first, "retry");
  const next = bootstrap();
  assert.equal(calls, 2);
  resolve(response(200));
  assert.equal(await next, "valid");
});
test("bootstrap denies 401, retries failures, ignores stale observer", async () => {
  assert.equal(await createSessionBootstrap(async () => response(401))(), "invalid");
  assert.equal(await createSessionBootstrap(async () => response(403))(), "forbidden");
  assert.equal(await createSessionBootstrap(async () => { throw Error("offline"); })(), "retry");
  const states: string[] = [];
  const dispose = observeBootstrap(Promise.resolve("valid"), (state) => states.push(state));
  dispose();
  await Promise.resolve();
  assert.equal(states.length, 0);
  observeBootstrap(Promise.resolve("retry"), (state) => states.push(state));
  await Promise.resolve();
  assert.deepEqual(states, ["retry"]);
});
