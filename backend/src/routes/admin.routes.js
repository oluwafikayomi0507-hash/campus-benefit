const express = require("express");
const pool = require("../config/db");
const adminMiddleware = require("../middlewares/admin.middleware");

const router = express.Router();
router.use(adminMiddleware);

router.get("/me", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, full_name, email FROM users WHERE id = $1 AND is_admin = TRUE",
      [req.user.id]
    );
    if (!result.rowCount) return res.status(403).json({ message: "Admin access required." });
    return res.json({ admin: result.rows[0] });
  } catch (error) {
    console.error("Could not load admin profile:", error.message);
    return res.status(500).json({ message: "Could not load admin profile." });
  }
});

router.get("/vendors", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, business_name, business_type, university, location, email,
              phone_number, whatsapp_number, instagram_url, description,
              approval_status, review_note, created_at
       FROM vendors
       WHERE approval_status = 'pending'
       ORDER BY created_at ASC, id ASC`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Could not load vendor applications:", error.message);
    return res.status(500).json({ message: "Could not load vendor applications." });
  }
});

router.patch("/vendors/:vendorId/review", async (req, res) => {
  const vendorId = Number(req.params.vendorId);
  const decision = req.body?.decision;
  const reviewNote = typeof req.body?.reviewNote === "string" ? req.body.reviewNote.trim().slice(0, 500) : "";
  if (!Number.isSafeInteger(vendorId) || vendorId < 1 || !["approved", "rejected"].includes(decision)) {
    return res.status(400).json({ message: "Choose approve or reject for a valid application." });
  }
  if (decision === "rejected" && !reviewNote) {
    return res.status(400).json({ message: "Add a short reason so the business knows what to fix." });
  }

  try {
    const result = await pool.query(
      `UPDATE vendors
       SET approval_status = $1,
           is_approved = $2,
           review_note = $3
       WHERE id = $4 AND approval_status = 'pending'
       RETURNING id, business_name, approval_status`,
      [decision, decision === "approved", reviewNote || null, vendorId]
    );
    if (!result.rowCount) return res.status(404).json({ message: "Pending vendor application not found." });
    return res.json({ message: `Business application ${decision}.`, vendor: result.rows[0] });
  } catch (error) {
    console.error("Could not review vendor application:", {
      message: error.message,
      code: error.code,
      constraint: error.constraint,
      column: error.column,
    });
    return res.status(500).json({ message: "Could not review vendor application." });
  }
});

router.get("/support", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.message_type, s.message, s.status, s.created_at,
              u.full_name, u.email
       FROM support_messages s
       LEFT JOIN users u ON u.id = s.student_id
       ORDER BY CASE s.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                s.created_at DESC
       LIMIT 100`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Could not load support messages:", error.message);
    return res.status(500).json({ message: "Could not load support messages." });
  }
});

router.patch("/support/:messageId", async (req, res) => {
  const messageId = Number(req.params.messageId);
  const status = req.body?.status;
  if (!Number.isSafeInteger(messageId) || messageId < 1 || !["in_progress", "resolved"].includes(status)) {
    return res.status(400).json({ message: "Choose a valid support status." });
  }
  try {
    const result = await pool.query(
      `UPDATE support_messages
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, status`,
      [status, messageId]
    );
    if (!result.rowCount) return res.status(404).json({ message: "Support message not found." });
    return res.json({ message: "Support message updated.", supportMessage: result.rows[0] });
  } catch (error) {
    console.error("Could not update support message:", error.message);
    return res.status(500).json({ message: "Could not update support message." });
  }
});

const opportunityCategories = ["internship", "competition", "gig", "career"];

router.get("/opportunities", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, category, title, organization, description, location,
              deadline, application_url, is_active, created_at
       FROM opportunities ORDER BY created_at DESC, id DESC`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Could not load admin opportunities:", error.message);
    return res.status(500).json({ message: "Could not load opportunities." });
  }
});

router.post("/opportunities", async (req, res) => {
  const body = req.body || {};
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 180) : "";
  const organization = typeof body.organization === "string" ? body.organization.trim().slice(0, 180) : "";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 3000) : "";
  const location = typeof body.location === "string" ? body.location.trim().slice(0, 180) : "";
  const deadline = typeof body.deadline === "string" && body.deadline ? body.deadline : null;
  const applicationUrl = typeof body.applicationUrl === "string" ? body.applicationUrl.trim() : "";
  let parsedUrl;
  try { parsedUrl = new URL(applicationUrl); } catch {}
  if (!opportunityCategories.includes(category) || !title || !organization || !description || !parsedUrl || !["https:", "http:"].includes(parsedUrl.protocol)) {
    return res.status(400).json({ message: "Add a valid category, title, organization, description and application link." });
  }
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    return res.status(400).json({ message: "Enter the deadline as a valid date." });
  }
  try {
    const result = await pool.query(
      `INSERT INTO opportunities
         (category, title, organization, description, location, deadline, application_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, category, title, organization, description, location,
                 deadline, application_url, is_active, created_at`,
      [category, title, organization, description, location || null, deadline, parsedUrl.href]
    );
    return res.status(201).json({ message: "Opportunity published.", opportunity: result.rows[0] });
  } catch (error) {
    console.error("Could not publish opportunity:", error.message);
    return res.status(500).json({ message: "Could not publish opportunity." });
  }
});

router.patch("/opportunities/:opportunityId", async (req, res) => {
  const id = Number(req.params.opportunityId);
  if (!Number.isSafeInteger(id) || id < 1 || typeof req.body?.isActive !== "boolean") {
    return res.status(400).json({ message: "Choose whether this listing should be active." });
  }
  try {
    const result = await pool.query(
      `UPDATE opportunities SET is_active = $1, updated_at = NOW()
       WHERE id = $2 RETURNING id, is_active`,
      [req.body.isActive, id]
    );
    if (!result.rowCount) return res.status(404).json({ message: "Opportunity not found." });
    return res.json({ message: "Opportunity updated.", opportunity: result.rows[0] });
  } catch (error) {
    console.error("Could not update opportunity:", error.message);
    return res.status(500).json({ message: "Could not update opportunity." });
  }
});

router.delete("/opportunities/:opportunityId", async (req, res) => {
  const id = Number(req.params.opportunityId);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: "Invalid opportunity." });
  try {
    const result = await pool.query("DELETE FROM opportunities WHERE id = $1 RETURNING id", [id]);
    if (!result.rowCount) return res.status(404).json({ message: "Opportunity not found." });
    return res.json({ message: "Opportunity deleted." });
  } catch (error) {
    console.error("Could not delete opportunity:", error.message);
    return res.status(500).json({ message: "Could not delete opportunity." });
  }
});

router.get("/deals", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.id, d.title, d.category, d.vendor_name, d.description,
              d.payment_status, d.is_active,
              (d.is_permanent OR d.expires_at > NOW()) AS within_dates,
              d.expires_at, d.package_code, lp.name AS package_name,
              v.business_name AS registered_business,
              latest.status AS latest_payment_status
       FROM deals d
       LEFT JOIN listing_packages lp ON lp.package_code = d.package_code
       LEFT JOIN vendors v ON v.id = d.vendor_id
       LEFT JOIN LATERAL (
         SELECT status FROM deal_listing_payments
         WHERE deal_id = d.id
         ORDER BY created_at DESC, id DESC LIMIT 1
       ) latest ON TRUE
       ORDER BY d.created_at DESC, d.id DESC
       LIMIT 200`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Could not load admin deals:", error.message);
    return res.status(500).json({ message: "Could not load vendor promotions." });
  }
});

router.patch("/deals/:dealId/visibility", async (req, res) => {
  const dealId = Number(req.params.dealId);
  const isActive = req.body?.isActive;
  if (!Number.isSafeInteger(dealId) || dealId < 1 || typeof isActive !== "boolean") {
    return res.status(400).json({ message: "Choose whether this promotion should be visible." });
  }
  try {
    const result = await pool.query(
      `UPDATE deals
       SET is_active = $1
       WHERE id = $2
         AND ($1 = FALSE OR (payment_status IN ('paid', 'not_required')
           AND (is_permanent = TRUE OR expires_at > NOW())))
       RETURNING id, title, is_active`,
      [isActive, dealId]
    );
    if (!result.rowCount) {
      const exists = await pool.query("SELECT id FROM deals WHERE id = $1", [dealId]);
      if (!exists.rowCount) return res.status(404).json({ message: "Promotion not found." });
      return res.status(409).json({ message: "Only paid, unexpired promotions can be shown." });
    }
    return res.json({ message: isActive ? "Promotion is visible." : "Promotion is hidden.", deal: result.rows[0] });
  } catch (error) {
    console.error("Could not update promotion visibility:", error.message);
    return res.status(500).json({ message: "Could not update promotion visibility." });
  }
});

module.exports = router;
