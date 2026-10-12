import test from "node:test";
import assert from "node:assert/strict";
import { safeLinkDestination } from "../src/utils/linkify.js";

test("editor links accept web and mail destinations while rejecting active or relative URLs", () => {
  assert.equal(safeLinkDestination("example.com/research"), "https://example.com/research");
  assert.equal(safeLinkDestination("https://example.com/brief"), "https://example.com/brief");
  assert.equal(safeLinkDestination("mailto:editor@example.com"), "mailto:editor@example.com");
  for (const input of ["javascript:alert(1)", "data:text/html,hello", "file:///secrets", "/private", "https://example.com\njavascript:alert(1)"]) {
    assert.equal(safeLinkDestination(input), null, input);
  }
});
