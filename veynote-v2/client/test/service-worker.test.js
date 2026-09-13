import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
function worker() {
  const handlers = {};
  const fallback = { body: "offline" };
  vm.runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
    URL, self: { location: { origin: "https://veynote.app" }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    caches: { match: async () => fallback }, fetch: async () => { throw new Error("offline"); },
  });
  return { handlers, fallback };
}
test("the service worker leaves private API, uploads and external requests untouched", () => {
  const { handlers } = worker();
  for (const url of ["https://veynote.app/api/notes", "https://veynote.app/uploads/private.png", "https://api.veynote.app/api/auth/me"]) {
    handlers.fetch({ request: { url, method: "GET", mode: "navigate" }, respondWith: () => assert.fail("private request intercepted") });
  }
});
test("offline navigations display the public fallback without caching record HTML", async () => {
  const { handlers, fallback } = worker();
  let response;
  handlers.fetch({ request: { url: "https://veynote.app/notes/private", method: "GET", mode: "navigate" }, respondWith: value => { response = value; } });
  assert.equal(await response, fallback);
});
