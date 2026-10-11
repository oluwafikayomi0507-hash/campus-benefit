const path = require("path");
if (!process.env.PAYSTACK_SECRET_KEY?.trim()) delete process.env.PAYSTACK_SECRET_KEY;
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const requireAuth = require("./src/middlewares/auth.middleware");
const pool = require("./src/config/db");
const authRoutes = require("./src/routes/auth.routes");
const vendorRoutes = require("./src/routes/vendor.routes");
const orderRoutes = require("./src/routes/order.routes");
const adminRoutes = require("./src/routes/admin.routes");
const listingRoutes = require("./src/routes/listing.routes");
const paymentRoutes = require("./src/routes/payments.routes");
const supportRoutes = require("./src/routes/support.routes");
const studentToolsRoutes = require("./src/routes/student-tools.routes");
const { getKeyMode } = require("./src/services/paystack.service");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({
  limit: "100kb",
  verify: (req, res, buffer) => {
    req.rawBody = Buffer.from(buffer);
  },
}));
app.use(express.static(path.join(__dirname, "../frontend")));
app.use("/api/auth", authRoutes);
app.use("/api/vendor", vendorRoutes.router);
app.use("/api/vendor", listingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/student-tools", studentToolsRoutes);

app.get("/api/opportunities", requireAuth, async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
  try {
    const result = await pool.query(
      `SELECT id, category, title, organization, description, location,
              deadline, application_url, created_at
       FROM opportunities
       WHERE is_active = TRUE
         AND (deadline IS NULL OR deadline >= CURRENT_DATE)
         AND ($1 = '' OR category = $1)
       ORDER BY deadline ASC NULLS LAST, created_at DESC`,
      [category]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Could not load opportunities:", error.message);
    return res.status(500).json({ message: "Could not load opportunities." });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ message: "Campus Benefit API is running" });
});

app.get("/api/db-check", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT current_database() AS database"
    );

    res.json({
      message: "Database connection successful",
      database: result.rows[0].database,
    });
  } catch (error) {
    console.error("Database check failed:", error.message);
    res.status(500).json({ message: "Database connection failed" });
  }
});

app.get("/api/scholarships", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, description, details, application_url, created_at
       FROM scholarships
       ORDER BY id`
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Could not load scholarships:", error.message);
    res.status(500).json({ message: "Could not load scholarships" });
  }
});

app.get("/api/deals/summary", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT category, COUNT(*)::INTEGER AS count
       FROM deals
       WHERE is_active = TRUE
         AND payment_status IN ('paid', 'not_required')
         AND (is_permanent = TRUE OR expires_at > NOW())
       GROUP BY category`
    );
    const counts = Object.fromEntries(result.rows.map((row) => [row.category, row.count]));
    return res.json(counts);
  } catch (error) {
    console.error("Could not load deal counts:", error.message);
    return res.status(500).json({ message: "Could not load deal counts." });
  }
});

app.get("/api/deals", requireAuth, async (req, res) => {
  const category =
    typeof req.query.category === "string" ? req.query.category.trim() : "";

  try {
    const result = await pool.query(
      `SELECT id, title, category, description, price, discount,
              vendor_name, location, image_url, offer_url, created_at
       FROM deals
       WHERE is_active = TRUE
         AND payment_status IN ('paid', 'not_required')
         AND (is_permanent = TRUE OR expires_at > NOW())
         AND ($1 = '' OR category = $1)
       ORDER BY created_at DESC`,
      [category]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Could not load deals:", error.message);
    res.status(500).json({ message: "Could not load deals." });
  }
});


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Campus Benefit API is running on port ${PORT}`);
  console.log(`Paystack checkout: ${getKeyMode() || "not configured"}`);
});


