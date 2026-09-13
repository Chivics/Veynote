import test from "node:test";
import assert from "node:assert/strict";
import { isApiUrl } from "../src/utils/apiOrigin.js";

test("image credentials are restricted to the exact configured API origin", () => {
  const base = "https://api.veynote.app/api";
  const page = "https://veynote.app/trading";
  assert.equal(isApiUrl(`${base}/trading/images/1/file`, base, page), true);
  for (const url of ["https://attacker.example/image", "https://api.veynote.app.attacker.example", "http://api.veynote.app/image", "https://api.veynote.app:444/image", "https://api.veynote.app@attacker.example/image", "https://user:password@api.veynote.app/image", "data:image/png;base64,abc", "blob:https://api.veynote.app/id"]) {
    assert.equal(isApiUrl(url, base, page), false, url);
  }
  assert.equal(isApiUrl("/uploads/test.png", "/api", "http://localhost:5173/notes"), true);
});
