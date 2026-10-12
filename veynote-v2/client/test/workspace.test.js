import test from "node:test";
import assert from "node:assert/strict";
import { startingWorkspace, workspaceHome } from "../src/utils/workspace.js";
import { currentWorkspace } from "../src/components/layout/navigationConfig.js";

test("starting workspace retains legacy preferences and ignores unknown destinations", () => {
  assert.equal(startingWorkspace({ defaultMode: "TRADING" }), "Trading");
  assert.equal(workspaceHome({ defaultMode: "TRADING" }), "/trading");
  assert.equal(workspaceHome({ defaultWorkspace: "https://attacker.example" }), "/notes");
  assert.equal(workspaceHome(null), "/notes");
});

test("every starting workspace resolves to its actual application route", () => {
  for (const [defaultWorkspace, expected] of Object.entries({ Notes: "/notes", Trading: "/trading", Business: "/business", Library: "/notes/library", Journal: "/journal", Vault: "/vault" })) {
    assert.equal(workspaceHome({ defaultWorkspace, defaultMode: "NOTES" }), expected);
  }
});

test("protected document URLs retain Vault navigation context", () => {
  assert.equal(startingWorkspace({ defaultWorkspace: "Vault" }), "Vault");
  assert.equal(currentWorkspace("/notes/private?workspace=vault", "NOTES"), "Vault");
});
