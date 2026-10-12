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
  for (const [path, parent] of [["/notes/library/reading/book", "/notes/library/reading"], ["/notes/files/trash", "/notes/files"], ["/notes/tasks/task", "/notes/tasks"], ["/will/assets/item", "/will/assets"], ["/trading/entries/trade/edit", "/trading/entries/trade"]]) {
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

test("journal practices and estate record types keep their purpose-built context", () => {
  assert.deepEqual(backDestination(route("monthly", "/journal/reviews/monthly"), []), { label: "Retrospectives", to: "/journal/reviews", delta: null });
  assert.deepEqual(backDestination(route("quarterly", "/journal/reviews/quarterly"), []), { label: "Retrospectives", to: "/journal/reviews", delta: null });
  assert.deepEqual(backDestination(route("decision", "/journal/decisions"), []), { label: "Today", to: "/journal", delta: null });
  assert.deepEqual(backDestination(route("mood", "/journal/mood"), []), { label: "Today", to: "/journal", delta: null });
  assert.equal(describeRoute("/journal/related").label, "Related records");
  assert.deepEqual(backDestination(route("liability", "/will/liabilities/liability-1"), []), { label: "Liabilities", to: "/will/liabilities", delta: null });
});

test("estate directories and records keep their own protected hierarchy", () => {
  assert.deepEqual(describeRoute("/will/assets"), { label: "Assets", parent: "/will", workspace: "/vault" });
  assert.deepEqual(describeRoute("/will/assets/asset-1"), { label: "Asset", parent: "/will/assets", workspace: "/vault" });
  assert.deepEqual(describeRoute("/will/executors/person-1"), { label: "Executor", parent: "/will/people", workspace: "/vault" });
  assert.deepEqual(describeRoute("/will/documents"), { label: "Estate documents", parent: "/will", workspace: "/vault" });
});
test("business customer details return to their filtered directory", () => {
  const source = route("customers", "/business/customers", "?stage=LEAD");
  const detail = route("customer", "/business/customers/customer-1");
  assert.deepEqual(backDestination(detail, [source, detail]), { label: "Customers", to: "/business/customers?stage=LEAD", delta: -1 });
  assert.deepEqual(backDestination(detail, []), { label: "Customers", to: "/business/customers", delta: null });
  assert.equal(backDestination(route("home", "/business"), []), null);
});
test("business opportunity details return to the pipeline", () => {
  assert.deepEqual(backDestination(route("deal", "/business/opportunities/deal-1"), []), { label: "Pipeline", to: "/business/pipeline", delta: null });
});
test("Today preserves the relevant filtered writing context", () => {
  const notes = route("all", "/notes/all", "?view=grid&tag=Research");
  const today = route("today", "/notes/today");
  assert.deepEqual(backDestination(today, [notes, today]), { label: "All notes", to: "/notes/all?view=grid&tag=Research", delta: -1 });
  assert.equal(describeRoute("/notes/today").label, "Today");
});
test("Templates is a Notes destination with a useful contextual Back target", () => {
  assert.deepEqual(backDestination(route("templates", "/notes/templates"), []), { label: "Overview", to: "/notes", delta: null });
  assert.equal(describeRoute("/notes/templates").label, "Templates");
});
test("protected notes remain inside Vault context and return to their private collection", () => {
  const protectedNote = route("private", "/notes/secret", "?workspace=vault");
  assert.deepEqual(describeRoute(protectedNote.pathname, protectedNote.search), { label: "Protected note", parent: "/vault/documents", workspace: "/vault" });
  assert.deepEqual(backDestination(protectedNote, []), { label: "Documents", to: "/vault/documents", delta: null });
  assert.deepEqual(describeRoute("/notes/locked"), { label: "Locked notes", parent: "/vault", workspace: "/vault" });
  assert.deepEqual(describeRoute("/vault/documents"), { label: "Documents", parent: "/vault", workspace: "/vault" });
});

test("Vault security remains inside Vault and returns to its overview", () => {
  assert.deepEqual(describeRoute("/vault/security"), {
    label: "Vault security",
    parent: "/vault",
    workspace: "/vault",
  });
  assert.deepEqual(backDestination(
    { pathname: "/vault/security", search: "" },
    [{ key: "vault", pathname: "/vault", search: "" }, { key: "security", pathname: "/vault/security", search: "" }],
  ), { label: "Vault overview", to: "/vault", delta: -1 });
});
test("Vault activity remains inside Vault and returns to its overview", () => {
  assert.deepEqual(describeRoute("/vault/activity"), {
    label: "Vault activity",
    parent: "/vault",
    workspace: "/vault",
  });
  assert.deepEqual(backDestination(
    { pathname: "/vault/activity", search: "" },
    [{ key: "vault", pathname: "/vault", search: "" }, { key: "activity", pathname: "/vault/activity", search: "" }],
  ), { label: "Vault overview", to: "/vault", delta: -1 });
});
test("the design reference has a meaningful fallback without an invented history delta", () => {
  assert.deepEqual(backDestination(route("preview", "/product-preview"), []), { label: "Overview", to: "/notes", delta: null });
});
test("the design reference returns to whichever workspace opened it", () => {
  const trading = route("account", "/trading/accounts/a", "?range=month");
  const preview = route("preview", "/product-preview");
  assert.deepEqual(backDestination(preview, [trading, preview]), { label: "Trading account", to: "/trading/accounts/a?range=month", delta: -1 });
});
