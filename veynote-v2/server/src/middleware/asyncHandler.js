// Express 4 does not forward rejected async route promises automatically.
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve().then(() => handler(req, res, next)).catch(next);
}

module.exports = { asyncHandler };
