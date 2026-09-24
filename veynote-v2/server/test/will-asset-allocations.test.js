const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeAssetAllocations } = require("../src/utils/willAssetAllocations");

test("estate allocations support reusable beneficiaries and mixed allocation types", () => {
  const result = normalizeAssetAllocations([
    { beneficiaryId: "child-a", allocationType: "PERCENTAGE", percentage: 40, conditions: "At age 25" },
    { beneficiaryId: "child-b", allocationType: "PERCENTAGE", percentage: "40" },
    { beneficiaryId: "spouse", allocationType: "AMOUNT", specificAmount: "₦20,000,000" },
  ], { userId: "owner", willId: "estate" });
  assert.equal(result.error, undefined);
  assert.equal(result.percentageTotal, 80);
  assert.equal(result.allocations.length, 3);
  assert.equal(result.allocations[0].conditions, "At age 25");
  assert.equal(result.allocations[2].specificAmount, "₦20,000,000");
  assert.deepEqual(result.beneficiaryIds, ["child-a", "child-b", "spouse"]);
});

test("estate allocations reject duplicates and percentages above the asset total", () => {
  assert.match(normalizeAssetAllocations([
    { beneficiaryId: "same", percentage: 50 }, { beneficiaryId: "same", percentage: 50 },
  ]).error, /only once/);
  assert.match(normalizeAssetAllocations([
    { beneficiaryId: "a", percentage: 60 }, { beneficiaryId: "b", percentage: 50 },
  ]).error, /exceed 100/);
});
