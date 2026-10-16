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

router.get("/dispatch/quotes", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT q.id, q.status, q.customer_phone, q.delivery_address, q.delivery_note,
              q.cart_items, q.quoted_fee, q.created_at, u.full_name AS student_name,
              u.email AS student_email, v.business_name, v.location AS vendor_location,
              (SELECT json_agg(jsonb_build_object('productName', p.product_name,
                                                  'quantity', (item->>'quantity')::integer))
               FROM jsonb_array_elements(q.cart_items) item
               JOIN vendor_products p ON p.id = (item->>'productId')::integer) AS items
       FROM marketplace_dispatch_quotes q
       JOIN users u ON u.id = q.student_id
       JOIN vendors v ON v.id = q.vendor_id
       WHERE q.status IN ('pending_quote', 'quoted') AND q.marketplace_payment_id IS NULL
       ORDER BY q.created_at ASC LIMIT 100`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Could not load dispatch quote requests:", error.message);
    return res.status(500).json({ message: "Could not load dispatch quote requests." });
  }
});

router.patch("/dispatch/quotes/:quoteId/fee", async (req, res) => {
  const quoteId = Number(req.params.quoteId);
  const fee = Number(req.body?.fee);
  if (!Number.isSafeInteger(quoteId) || quoteId < 1 || !Number.isFinite(fee) || fee < 0 || fee > 100000) {
    return res.status(400).json({ message: "Enter a valid dispatch fee from ₦0 to ₦100,000." });
  }
  try {
    const result = await pool.query(
      `UPDATE marketplace_dispatch_quotes
       SET quoted_fee = $1, status = 'quoted', quoted_by = $2, updated_at = NOW()
       WHERE id = $3 AND status IN ('pending_quote', 'quoted') AND marketplace_payment_id IS NULL
       RETURNING id, status, quoted_fee`,
      [fee, req.user.id, quoteId]
    );
    if (!result.rowCount) return res.status(409).json({ message: "This quote request has already been paid or closed." });
    return res.json({ message: "Dispatch fee sent to the student.", quote: result.rows[0] });
  } catch (error) {
    console.error("Could not set dispatch fee:", error.message);
    return res.status(500).json({ message: "Could not save the dispatch fee." });
  }
});

router.get("/dispatch/active", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT q.id AS quote_id, q.status AS dispatch_status, q.quoted_fee,
              q.delivery_address, q.customer_phone, q.rider_name, q.rider_phone,
              q.updated_at, u.full_name AS student_name, v.business_name,
              o.id AS order_id, o.status AS order_status, o.total_amount,
              COALESCE(json_agg(json_build_object(
                'productName', oi.product_name, 'quantity', oi.quantity
              )) FILTER (WHERE oi.id IS NOT NULL), '[]'::json) AS items
       FROM marketplace_dispatch_quotes q
       JOIN marketplace_payments p ON p.id = q.marketplace_payment_id AND p.status = 'paid'
       JOIN users u ON u.id = q.student_id
       JOIN vendors v ON v.id = q.vendor_id
       JOIN vendor_orders o ON o.marketplace_payment_id = p.id
       LEFT JOIN vendor_order_items oi ON oi.order_id = o.id
       WHERE q.status IN ('paid', 'assigned', 'picked_up')
         AND (o.status = 'ready' OR q.status IN ('assigned', 'picked_up'))
       GROUP BY q.id, u.full_name, v.business_name, o.id
       ORDER BY q.updated_at ASC LIMIT 100`
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Could not load active dispatch jobs:", error.message);
    return res.status(500).json({ message: "Could not load active dispatch jobs." });
  }
});

router.patch("/dispatch/:quoteId/status", async (req, res) => {
  const quoteId = Number(req.params.quoteId);
  const status = typeof req.body?.status === "string" ? req.body.status : "";
  const riderName = typeof req.body?.riderName === "string" ? req.body.riderName.trim() : "";
  const riderPhone = typeof req.body?.riderPhone === "string" ? req.body.riderPhone.trim() : "";
  if (!Number.isSafeInteger(quoteId) || quoteId < 1 || !["assigned", "picked_up", "delivered"].includes(status)) {
    return res.status(400).json({ message: "Choose a valid dispatch job and status." });
  }
  if (status === "assigned" && (!riderName || riderName.length > 160 || !riderPhone || riderPhone.length > 30)) {
    return res.status(400).json({ message: "Enter the rider’s name and phone number before assigning this delivery." });
  }
  const allowedFrom = { assigned: ["paid"], picked_up: ["assigned"], delivered: ["picked_up"] };
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE marketplace_dispatch_quotes
         SET status = $1::varchar, rider_name = CASE WHEN $1::varchar = 'assigned' THEN $2 ELSE rider_name END,
             rider_phone = CASE WHEN $1::varchar = 'assigned' THEN $3 ELSE rider_phone END,
             updated_at = NOW()
         WHERE id = $4 AND status = ANY($5::text[]) AND marketplace_payment_id IS NOT NULL
           AND ($1::varchar <> 'assigned' OR EXISTS (
             SELECT 1 FROM vendor_orders ready_order
             WHERE ready_order.marketplace_payment_id = marketplace_dispatch_quotes.marketplace_payment_id
               AND ready_order.status = 'ready' AND ready_order.payment_status = 'paid'
           ))
         RETURNING id, status, marketplace_payment_id`,
        [status, riderName, riderPhone, quoteId, allowedFrom[status]]
      );
      if (!updated.rowCount) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "This dispatch job has changed. Refresh the queue and try again." });
      }
      if (status === "delivered") {
        await client.query(
          `UPDATE vendor_orders SET dispatch_status = 'delivered', status = 'completed', updated_at = NOW()
           WHERE marketplace_payment_id = $1 AND payment_status = 'paid' AND status = 'ready'`,
          [updated.rows[0].marketplace_payment_id]
        );
      } else {
        await client.query(
          `UPDATE vendor_orders SET dispatch_status = $1, updated_at = NOW()
           WHERE marketplace_payment_id = $2 AND payment_status = 'paid'`,
          [status, updated.rows[0].marketplace_payment_id]
        );
      }
      await client.query("COMMIT");
      return res.json({ message: "Dispatch status updated.", dispatch: updated.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Could not update dispatch status:", error.message);
    return res.status(500).json({ message: "Could not update dispatch status." });
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
