import test from "node:test";
import assert from "node:assert/strict";
import { createModuleLoader } from "../src/utils/moduleLoader.js";

test("session warmup and workspace arrival share one module download", async () => {
  let complete;
  let downloads = 0;
  const load = createModuleLoader(() => { downloads++; return new Promise(resolve => { complete = resolve; }); });
  const warmup = load(), arrival = load();
  assert.equal(warmup, arrival);
  await Promise.resolve();
  const module = { default: () => {} };
  complete(module);
  assert.equal(await arrival, module);
  assert.equal(await load(), module);
  assert.equal(downloads, 1);
});

test("a failed warmup allows a later download attempt instead of reusing its rejection", async () => {
  let attempts = 0;
  const module = { default: () => {} };
  const load = createModuleLoader(() => { if (++attempts === 1) throw new Error("connection interrupted"); return module; });
  await assert.rejects(load(), /connection interrupted/);
  assert.equal(await load(), module);
  assert.equal(attempts, 2);
});
