const pool = require("../config/db");
const requireAuth = require("./auth.middleware");

async function requireAdmin(req, res, next) {
  if (req.user?.role === "vendor") {
    return res.status(403).json({ message: "Campus Benefit admin access required." });
  }
  try {
    const result = await pool.query(
      "SELECT is_admin FROM users WHERE id = $1",
      [req.user.id]
    );
    if (!result.rows[0]?.is_admin) {
      return res.status(403).json({ message: "This account does not have Campus Benefit admin access." });
    }
    return next();
  } catch (error) {
    console.error("Could not verify admin access:", error.message);
    return res.status(500).json({ message: "Could not verify admin access." });
  }
}

module.exports = [requireAuth, requireAdmin];
