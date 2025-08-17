// src/middleware/noCache.js
export function noCache(req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  next();
}
