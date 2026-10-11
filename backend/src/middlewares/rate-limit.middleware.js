function createRateLimiter({ windowMs, limit, message }) {
  const requestsByIp = new Map();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || "unknown";
    const recent = (requestsByIp.get(key) || []).filter((time) => now - time < windowMs);

    if (recent.length >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
      res.set("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({ message });
    }

    recent.push(now);
    requestsByIp.set(key, recent);

    // Keep the in-memory store bounded and remove expired entries opportunistically.
    if (requestsByIp.size > 5000) {
      for (const [address, timestamps] of requestsByIp) {
        const active = timestamps.filter((time) => now - time < windowMs);
        if (active.length) requestsByIp.set(address, active);
        else requestsByIp.delete(address);
      }
    }

    return next();
  };
}

module.exports = createRateLimiter;
