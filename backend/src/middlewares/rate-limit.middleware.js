function createRateLimiter({ windowMs, limit, message, keyGenerator = (req) => req.ip || req.socket?.remoteAddress || "unknown" }) {
  const requestsByKey = new Map();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = String(keyGenerator(req) || "unknown");
    const recent = (requestsByKey.get(key) || []).filter((time) => now - time < windowMs);

    if (recent.length >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
      res.set("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({ message });
    }

    recent.push(now);
    requestsByKey.set(key, recent);

    // Keep the in-memory store bounded and remove expired entries opportunistically.
    if (requestsByKey.size > 5000) {
      for (const [address, timestamps] of requestsByKey) {
        const active = timestamps.filter((time) => now - time < windowMs);
        if (active.length) requestsByKey.set(address, active);
        else requestsByKey.delete(address);
      }
    }

    return next();
  };
}

module.exports = createRateLimiter;
