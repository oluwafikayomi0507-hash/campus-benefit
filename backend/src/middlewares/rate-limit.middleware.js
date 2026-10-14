const pool = require("../config/db");

function createRateLimiter({ name, windowMs, limit, message, keyGenerator = (req) => req.ip || req.socket?.remoteAddress || "unknown" }) {
  let nextCleanupAt = 0;

  return async function rateLimit(req, res, next) {
    const now = Date.now();
    const key = `${name}:${String(keyGenerator(req) || "unknown")}`;
    const windowSeconds = windowMs / 1000;
    try {
      const result = await pool.query(
        `INSERT INTO api_rate_limits (rate_key, window_started_at, hit_count)
         VALUES ($1, to_timestamp(floor(extract(epoch FROM clock_timestamp()) / $2) * $2), 1)
         ON CONFLICT (rate_key, window_started_at)
         DO UPDATE SET hit_count = api_rate_limits.hit_count + 1
         RETURNING hit_count, window_started_at`,
        [key, windowSeconds]
      );
      const bucket = result.rows[0];
      if (Number(bucket.hit_count) > limit) {
        const remaining = windowMs - (now - new Date(bucket.window_started_at).getTime());
        res.set("Retry-After", String(Math.max(1, Math.ceil(remaining / 1000))));
        return res.status(429).json({ message });
      }

      if (now >= nextCleanupAt) {
        nextCleanupAt = now + 60 * 60 * 1000;
        void pool.query("DELETE FROM api_rate_limits WHERE window_started_at < NOW() - INTERVAL '2 days'")
          .catch((error) => console.error("Could not prune API rate limits:", error.message));
      }
      return next();
    } catch (error) {
      console.error("Could not check API rate limit:", error.message);
      return res.status(503).json({ message: "This service is temporarily unavailable. Please try again shortly." });
    }
  };
}

module.exports = createRateLimiter;
