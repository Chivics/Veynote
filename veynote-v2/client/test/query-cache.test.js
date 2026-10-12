import test from "node:test";
import assert from "node:assert/strict";
import { createQueryCache, cacheablePath, isNotesCollectionKey, preservesNotesOnWrite } from "../src/utils/queryCache.js";

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

test("unrelated writes keep a cached Notes collection without retaining stale in-flight data", async () => {
  const cache = createQueryCache();
  let noteFetches = 0;
  const notes = () => { noteFetches++; return { notes: ["saved"] }; };
  await cache.get("/notes?scope=all", notes);
  await cache.get("/tasks", async () => ({ tasks: ["old"] }));
  let finishTask;
  const pendingTask = cache.get("/tasks?status=open", () => new Promise(resolve => { finishTask = resolve; }));
  await Promise.resolve();
  cache.clearExcept(isNotesCollectionKey);
  finishTask({ tasks: ["stale"] });
  await pendingTask;
  assert.equal(cache.peek("/tasks"), undefined);
  assert.equal(cache.peek("/tasks?status=open"), undefined);
  assert.deepEqual(await cache.get("/notes?scope=all", notes), { notes: ["saved"] });
  assert.equal(noteFetches, 1);
});

test("only independent writes preserve Notes collection results", () => {
  for (const path of ["/tasks/one", "/trading/entries", "/trading-rules/rule-id", "/business/workspace-id/customers"]) assert.equal(preservesNotesOnWrite(path), true, path);
  for (const path of ["/notes/note-id", "/folders/folder-id", "/library/favorites", "/calendar", "/auth/me"]) assert.equal(preservesNotesOnWrite(path), false, path);
  for (const scope of ["all", "favorites", "archive", "trash"]) assert.equal(isNotesCollectionKey(`/notes?scope=${scope}`), true, scope);
  assert.equal(isNotesCollectionKey("/notes/meta/tags"), false);
});

test("cache is bounded and failed requests can recover", async () => {
  const cache = createQueryCache({ maxEntries: 2 });
  await assert.rejects(cache.get("a", async () => { throw Error("offline"); }));
  for (const key of ["a", "b", "c"]) await cache.get(key, async () => key);
  assert.equal(cache.peek("a"), undefined); assert.equal(cache.peek("c"), "c");
});

test("sensitive content and authorization endpoints bypass navigation cache", () => {
  for (const path of ["/notes?scope=locked", "/notes?scope=locked-trash", "/notes/secret", "/notes/secret/versions", "/will", "/security", "/sessions", "/auth/me", "/media/file", "/shares/token"]) assert.equal(cacheablePath(path), false, path);
  for (const path of ["/notes?scope=all", "/files/root", "/files/folder-id", "/library/reading", "/trading/entries?q=EUR", "/business/workspace-1/customers/customer-1/interactions?page=2", "/business/workspace-1/customers/customer-1/opportunities?page=2"]) assert.equal(cacheablePath(path), true, path);
});
