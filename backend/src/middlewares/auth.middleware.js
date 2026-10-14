const jwt = require("jsonwebtoken");
const pool = require("../config/db");

async function requireAuth(req, res, next) {
  const cookieName = req.originalUrl.startsWith("/api/vendor/")
    ? "cb_vendor_session"
    : "cb_student_session";
  const cookies = Object.fromEntries((req.get("cookie") || "").split(";").map((part) => {
    const separator = part.indexOf("=");
    return separator < 0 ? ["", ""] : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  }));
  const token = cookies[cookieName];

  if (!token) {
    return res.status(401).json({ message: "Please log in to continue." });
  }

  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not configured.");
    return res.status(500).json({ message: "Authentication is not configured." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    const expectedRole = cookieName === "cb_vendor_session" ? "vendor" : "student";
    if (!payload.sub || payload.role !== expectedRole) {
      return res.status(401).json({ message: "Please log in again." });
    }

    const table = expectedRole === "vendor" ? "vendors" : "users";
    const sessionResult = await pool.query(
      `SELECT auth_version FROM ${table} WHERE id = $1`,
      [payload.sub]
    );
    if (!sessionResult.rowCount || Number(sessionResult.rows[0].auth_version) !== Number(payload.av ?? 0)) {
      return res.status(401).json({ message: "Your session is no longer valid. Please log in again." });
    }
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch (error) {
    if (error.name !== "JsonWebTokenError" && error.name !== "TokenExpiredError" && error.name !== "NotBeforeError") {
      console.error("Could not validate account session:", error.message);
      return res.status(503).json({ message: "Authentication is temporarily unavailable. Please try again." });
    }
    return res.status(401).json({
      message: "Your session is invalid or expired. Please log in again.",
    });
  }
}

module.exports = requireAuth;
