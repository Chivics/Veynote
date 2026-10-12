import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const bundle = fs.readFileSync(new URL("../public/product-preview/blueprint.html", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../public/product-preview/manifest.json", import.meta.url), "utf8"));
const component = fs.readFileSync(new URL("../src/pages/ProductPreview.jsx", import.meta.url), "utf8");

test("the complete approved screen catalog is retained in the saved design reference", () => {
  assert.ok(manifest.screenCount > 80, "The reference must contain the full application, not one showcase page.");
  assert.equal(manifest.screenCount, manifest.screens.length);
  const catalogScript = [...bundle.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  const actualIds = vm.runInNewContext(`${catalogScript}\n;SCREENS.map(screen => screen.id);`, {}, { timeout: 1000 });
  assert.deepEqual(Array.from(actualIds), manifest.screens.map(screen => screen.id));
  assert.equal(new Set(manifest.screens.map(screen => screen.id)).size, manifest.screenCount);
  assert.deepEqual(manifest.variants, ["desktop-dark", "desktop-light", "mobile-dark", "mobile-light"]);
  for (const width of [320, 414, 768, 1440, 1920]) assert.ok(manifest.widths.includes(width));
});

test("design scripts cannot share the real application's origin or network connection", () => {
  assert.match(component, /sandbox="allow-scripts"/);
  assert.doesNotMatch(component, /sandbox="[^"]*allow-same-origin/);
  assert.match(component, /credentials:\s*"omit"/);
  assert.match(bundle, /connect-src 'none'/);
  assert.match(bundle, /form-action 'none'/);
  assert.match(bundle, /object-src 'none'/);
  assert.match(bundle, /previewReplaceState/);
  assert.doesNotMatch(bundle, /<script\s+src=/);
  assert.doesNotMatch(bundle, /<link\b[^>]*href="https?:/);
});
