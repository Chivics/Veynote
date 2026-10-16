import test from "node:test";
import assert from "node:assert/strict";

test("protected trade media paths resolve to the same durable stored reference as upload paths", async () => {
  const { storedMediaNameFor } = await import("../src/utils/mediaReference.js");
  const storedMediaName = value => storedMediaNameFor(value, { apiBase:"http://localhost:3000/api", pageHref:"http://localhost:5177/trading/entries/one", pageOrigin:"http://localhost:5177" });
  const storedName = "0123456789abcdef0123456789abcdef.png";
  assert.equal(storedMediaName(`/uploads/${storedName}`), storedName);
  assert.equal(storedMediaName(`/api/media/${storedName}`), storedName);
  assert.equal(storedMediaName(`https://attacker.example/api/media/${storedName}`), null);
  assert.equal(storedMediaName("/api/media/not-a-storage-name.png"), null);
});
