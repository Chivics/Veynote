const test = require("node:test");
const assert = require("node:assert/strict");
const { LIBRARY_DATABASES, pickProperties, parseLibraryInput } = require("../src/data/libraryConfig");

test("Library databases keep media records separate and allow only category fields", () => {
  assert.ok(LIBRARY_DATABASES.READING);
  assert.ok(LIBRARY_DATABASES.FILMS);

  assert.deepEqual(pickProperties("FILMS", {
    director: "Ava DuVernay", score: 9, favorite: true,
    coverStoredName: "forged.png", userId: "another-user", estimatedValue: 500,
  }), { director: "Ava DuVernay", score: 9 });

  assert.deepEqual(pickProperties("BUCKET_LIST", {
    targetDate: "2027-06-01", location: "Lagos", motivation: "A meaningful milestone", completed: "",
    database: "READING",
  }), { targetDate: "2027-06-01", location: "Lagos", completed: "", motivation: "A meaningful milestone" });
});

test("Library input validates category dates and numeric progress without discarding legitimate fields", () => {
  assert.deepEqual(parseLibraryInput("READING", { title:"  A useful book  ", category:"Book", author:"A. Writer", totalPages:"320", pagesRead:"24", score:"9", started:"2026-10-04" }, { create:true }), {
    data:{title:"A useful book",category:"Book"},
    properties:{score:"9",author:"A. Writer",totalPages:"320",pagesRead:"24",started:"2026-10-04"},
  });
  assert.throws(() => parseLibraryInput("READING", { title:42 }, { create:true }), /Title is required/);
  assert.throws(() => parseLibraryInput("READING", { score:11 }), /score/);
  assert.throws(() => parseLibraryInput("READING", { totalPages:-5 }), /totalPages/);
  assert.throws(() => parseLibraryInput("BUCKET_LIST", { targetDate:"2026-02-30" }), /targetDate/);
  assert.throws(() => parseLibraryInput("FILMS", { review:{unexpected:true} }), /review/);
  assert.throws(() => parseLibraryInput("READING", { title:"x".repeat(192) }, { create:true }), /191 characters/);
  assert.deepEqual(parseLibraryInput("READING", { highlights:"A passage worth retaining." }), { data:{}, properties:{ highlights:"A passage worth retaining." } });
  assert.throws(() => parseLibraryInput("READING", { highlights:"x".repeat(15001) }), /highlights/);
});
