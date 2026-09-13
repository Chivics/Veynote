// Validate optional foreign keys before any write. Return the same response
// for a missing record and another tenant's record to avoid ID enumeration.
function ownedReference(model, field, extraWhere = {}) {
  return async (req, res, next) => {
    const id = req.body?.[field];
    if (id === undefined || id === null || id === "") return next();
    if (typeof id !== "string" || id.length > 191) {
      return res.status(400).json({ error: `Invalid ${field}.` });
    }
    try {
      const record = await model.findFirst({
        where: { ...extraWhere, id, userId: req.userId }, select: { id: true },
      });
      if (!record) return res.status(404).json({ error: "Linked record not found." });
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { ownedReference };
