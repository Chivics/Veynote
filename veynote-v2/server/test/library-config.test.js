const test = require("node:test");
const assert = require("node:assert/strict");
const { LIBRARY_DATABASES, pickProperties } = require("../src/data/libraryConfig");

test("Library databases keep media records separate and allow only category fields", () => {
  assert.ok(LIBRARY_DATABASES.READING);
  assert.ok(LIBRARY_DATABASES.FILMS);

  assert.deepEqual(pickProperties("FILMS", {
    director: "Ava DuVernay", score: 9, favorite: true,
    coverStoredName: "forged.png", userId: "another-user", estimatedValue: 500,
  }), { director: "Ava DuVernay", score: 9, favorite: true });

  assert.deepEqual(pickProperties("BUCKET_LIST", {
    targetDate: "2027-06-01", location: "Lagos", motivation: "A meaningful milestone", completed: "",
    database: "READING",
  }), { targetDate: "2027-06-01", location: "Lagos", completed: "", motivation: "A meaningful milestone" });
});
