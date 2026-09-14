import test from "node:test";
import assert from "node:assert/strict";
import { settleNavigationSave } from "../src/utils/navigationSave.js";

test("navigation waits for persistence before continuing", async () => {
  let finish, continued = false;
  const save = new Promise(resolve => { finish = resolve; });
  const task = settleNavigationSave(() => save, () => true, () => { continued = true; }, () => assert.fail("unexpected failure"));
  assert.equal(continued, false);
  finish(true); await task;
  assert.equal(continued, true);
});

test("failed saves keep navigation blocked and can be retried", async () => {
  const results = [], attempt = result => settleNavigationSave(result, () => true, () => results.push("proceed"), () => results.push("failed"));
  await attempt(() => false);
  await attempt(() => { throw new Error("connection interrupted"); });
  await attempt(() => true);
  assert.deepEqual(results, ["failed", "failed", "proceed"]);
});

test("late completion cannot navigate after the user cancels or chooses another destination", async () => {
  for (const result of [true, false]) {
    let finish, current = true;
    const task = settleNavigationSave(() => new Promise(resolve => { finish = resolve; }), () => current,
      () => assert.fail("stale navigation proceeded"), () => assert.fail("stale failure reopened dialog"));
    current = false; finish(result); await task;
  }
});

test("late rejection cannot reopen a dismissed navigation dialog", async () => {
  let reject, current = true;
  const task = settleNavigationSave(() => new Promise((_, fail) => { reject = fail; }), () => current,
    () => assert.fail("stale navigation proceeded"), () => assert.fail("stale failure reopened dialog"));
  current = false; reject(new Error("offline")); await task;
});
