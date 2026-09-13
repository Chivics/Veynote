import test from "node:test";
import assert from "node:assert/strict";
import { queryPath } from "../src/utils/queryPath.js";
test("GET filters preserve false and zero, encode text and append existing queries", () => {
  assert.equal(queryPath("/notes", { scope: "locked", q: "a & b", empty: "", nil: null }), "/notes?scope=locked&q=a+%26+b");
  assert.equal(queryPath("/notes?scope=all", { offset: 0, enabled: false }), "/notes?scope=all&offset=0&enabled=false");
});
