// A replaced/cancelled navigation must never be completed by an older save.
export async function settleNavigationSave(save, isCurrent, proceed, fail) {
  try {
    const result = await save?.();
    if (!isCurrent()) return;
    if (result === false) fail();
    else proceed();
  } catch {
    if (isCurrent()) fail();
  }
}
