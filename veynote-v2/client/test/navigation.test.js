import test from "node:test";
import assert from "node:assert/strict";
import { advanceTrail, backDestination, describeRoute } from "../src/utils/navigation.js";
const route = (key, pathname, search = "") => ({ key, pathname, search });
test("contextual back returns to the actual filtered source", () => {
  const source = route("a", "/notes/library/reading", "?view=Books");
  const detail = route("b", "/notes/library/reading/book");
  const trail = advanceTrail([source], detail, "PUSH");
  assert.deepEqual(backDestination(detail, trail), { label: "Reading & watching", to: source.pathname + source.search, delta: -1 });
});
test("direct links have safe section parents and dashboards omit Back", () => {
  for (const [path, parent] of [["/notes/library/reading/book", "/notes/library/reading"], ["/notes/tasks/task", "/notes/tasks"], ["/will/assets/item", "/will"], ["/trading/entries/trade/edit", "/trading/entries/trade"]]) {
    assert.equal(backDestination(route("x", path), []).to, parent);
  }
  assert.equal(backDestination(route("x", "/notes"), []), null);
  assert.equal(backDestination(route("x", "/trading"), []), null);
});
test("creation replacements do not take Back to a blank editor", () => {
  const list = route("list", "/notes/all");
  const created = route("saved", "/notes/abc");
  const trail = advanceTrail([list, route("new", "/notes/new")], created, "REPLACE");
  assert.equal(trail.length, 2); assert.equal(backDestination(created, trail).to, "/notes/all");
});
test("unknown browser history never uses an invented back delta", () => {
  const location = route("unknown", "/notes/library/ideas/idea");
  const trail = advanceTrail([route("a", "/notes/all")], location, "POP");
  assert.equal(backDestination(location, trail).delta, null);
  assert.equal(describeRoute("/notes/secret-id").label, "Note");
});
test("journal entries return to journal context on desktop and mobile", () => {
  const direct = route("entry", "/journal/entries/record-1");
  assert.deepEqual(backDestination(direct, []), { label: "Timeline", to: "/journal/timeline", delta: null });
  const timeline = route("timeline", "/journal/timeline", "?mood=focused");
  assert.deepEqual(backDestination(direct, [timeline, direct]), { label: "Timeline", to: "/journal/timeline?mood=focused", delta: -1 });
  assert.equal(backDestination(route("home", "/journal"), []), null);
});
test("business customer details return to their filtered directory", () => {
  const source = route("customers", "/business/customers", "?stage=LEAD");
  const detail = route("customer", "/business/customers/customer-1");
  assert.deepEqual(backDestination(detail, [source, detail]), { label: "Customers", to: "/business/customers?stage=LEAD", delta: -1 });
  assert.deepEqual(backDestination(detail, []), { label: "Customers", to: "/business/customers", delta: null });
  assert.equal(backDestination(route("home", "/business"), []), null);
});
