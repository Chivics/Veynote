import test from "node:test";
import assert from "node:assert/strict";
import { createQueryCache, cacheablePath } from "../src/utils/queryCache.js";

test("navigation reuses fresh results and shares concurrent requests", async () => {
  const cache = createQueryCache(); let calls = 0;
  const fetcher = async () => { calls++; return { notes: ["saved"] }; };
  const [a, b] = await Promise.all([cache.get("/notes", fetcher), cache.get("/notes", fetcher)]);
  assert.equal(a, b); assert.equal(calls, 1);
  assert.equal(await cache.get("/notes", fetcher), a);
  assert.equal(calls, 1);
  await cache.get("/notes", fetcher, true); assert.equal(calls, 2);
});

test("invalidated in-flight data cannot repopulate an account cache", async () => {
  const cache = createQueryCache(); let finish;
  const request = cache.get("/notes", () => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve(); cache.clear(); finish({ notes: ["old account"] });
  await request; assert.equal(cache.peek("/notes"), undefined);
});

test("cache is bounded and failed requests can recover", async () => {
  const cache = createQueryCache({ maxEntries: 2 });
  await assert.rejects(cache.get("a", async () => { throw Error("offline"); }));
  for (const key of ["a", "b", "c"]) await cache.get(key, async () => key);
  assert.equal(cache.peek("a"), undefined); assert.equal(cache.peek("c"), "c");
});

test("sensitive content and authorization endpoints bypass navigation cache", () => {
  for (const path of ["/notes?scope=locked", "/notes/secret", "/notes/secret/versions", "/will", "/security", "/sessions", "/auth/me", "/media/file", "/shares/token"]) assert.equal(cacheablePath(path), false, path);
  for (const path of ["/notes?scope=all", "/files/root", "/files/folder-id", "/library/reading", "/trading/entries?q=EUR"]) assert.equal(cacheablePath(path), true, path);
});
