import test from "node:test";
import assert from "node:assert/strict";
import { activeNavigationIndex } from "../src/utils/activeNavigation.js";
import { WORKSPACES, QUICK_NAV } from "../src/components/layout/navigationConfig.js";

test("logging a trade highlights one destination rather than both journal and create", () => {
  assert.equal(activeNavigationIndex("/trading/entries/new", "", QUICK_NAV.Trading), 2);
  assert.equal(WORKSPACES.Trading.pages[activeNavigationIndex("/trading/entries/new", "", WORKSPACES.Trading.pages)][0], "Log Trade");
  assert.equal(activeNavigationIndex("/trading/entries/trade-1/edit", "", QUICK_NAV.Trading), 1);
});
test("customer creation uses its query action without marking ordinary browsing as create", () => {
  assert.equal(activeNavigationIndex("/business/customers", "", QUICK_NAV.Business), 1);
  assert.equal(activeNavigationIndex("/business/customers", "?new=1", QUICK_NAV.Business), 2);
  assert.equal(activeNavigationIndex("/business/customers/customer-1", "", QUICK_NAV.Business), 1);
});
test("all quick navigation stays at five real destinations and nested records retain their category", () => {
  for (const destinations of Object.values(QUICK_NAV)) assert.equal(destinations.length, 5);
  assert.equal(activeNavigationIndex("/notes/library/reading/book-1", "", QUICK_NAV.Library), 1);
  assert.equal(activeNavigationIndex("/notes/folders/folder-1", "", WORKSPACES.Notes.pages), 3);
  assert.equal(activeNavigationIndex("/notes/folders-other", "", WORKSPACES.Notes.pages), -1);
  assert.equal(activeNavigationIndex("/settings", "", QUICK_NAV.Journal), -1);
});
