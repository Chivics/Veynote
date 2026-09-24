function text(value) { return value === undefined || value === null ? "" : String(value).trim(); }
function clean(value) { return text(value) || null; }

function normalizeAssetAllocations(input, { userId, willId } = {}) {
  if (!Array.isArray(input) || input.length > 50) return { error: "Asset allocations must be a list of no more than 50 beneficiaries." };
  const ids = input.map(item => text(item?.beneficiaryId));
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) return { error: "Choose each beneficiary only once for an asset." };
  let percentageTotal = 0;
  const allocations = [];
  for (const item of input) {
    const allocationType = ["PERCENTAGE", "AMOUNT", "REMAINDER"].includes(item?.allocationType) ? item.allocationType : "PERCENTAGE";
    const percentage = allocationType === "PERCENTAGE" ? Number(item?.percentage) : null;
    if (allocationType === "PERCENTAGE" && (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100)) return { error: "Each percentage allocation must be greater than 0 and no more than 100." };
    if (allocationType === "AMOUNT" && !text(item?.specificAmount)) return { error: "Enter the amount assigned to each fixed-amount beneficiary." };
    percentageTotal += percentage || 0;
    allocations.push({
      ...(userId && { userId }), ...(willId && { willId }), beneficiaryId: text(item.beneficiaryId), allocationType,
      percentage, specificAmount: allocationType === "AMOUNT" ? text(item.specificAmount) : null,
      conditions: clean(item.conditions), notes: clean(item.notes),
    });
  }
  if (percentageTotal > 100.0001) return { error: "Percentage allocations exceed 100%. Reduce the allocation before saving." };
  return { allocations, percentageTotal, beneficiaryIds: ids };
}

module.exports = { normalizeAssetAllocations };
