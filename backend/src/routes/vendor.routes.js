const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const requireAuth = require("../middlewares/auth.middleware");
const createRateLimiter = require("../middlewares/rate-limit.middleware");

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const limitVendorSignup = createRateLimiter({ windowMs: 60 * 60 * 1000, limit: 5, message: "Too many business application attempts. Please try again later." });
const limitVendorLogin = createRateLimiter({ windowMs: 15 * 60 * 1000, limit: 10, message: "Too many login attempts. Please wait 15 minutes and try again." });
const clean = (value) => typeof value === "string" ? value.trim() : "";

function requireVendor(req, res, next) {
  if (req.user?.role !== "vendor") {
    return res.status(403).json({ message: "Vendor account required." });
  }
  return next();
}

async function getApprovedVendor(vendorId) {
  const result = await pool.query(
    `SELECT id, business_name, email, location, delivery_fee
     FROM vendors WHERE id = $1 AND is_approved = TRUE AND approval_status = 'approved'`,
    [vendorId]
  );
  return result.rows[0] || null;
}

async function notifyAdminsOfVendorApplication({ businessName, businessType, university }) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    console.error("Vendor application notification is not configured. Set RESEND_API_KEY and EMAIL_FROM.");
    return;
  }

  try {
    const admins = await pool.query(
      "SELECT email FROM users WHERE is_admin = TRUE AND email IS NOT NULL"
    );
    const recipients = [...new Set(admins.rows.map((admin) => clean(admin.email).toLowerCase()).filter(Boolean))];
    if (!recipients.length) {
      console.error("Could not send vendor application notification: no admin email addresses found.");
      return;
    }

    const appBaseUrl = (process.env.APP_BASE_URL || "https://campusbenefit.com.ng").replace(/\/$/, "");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: recipients,
        subject: "New Campus Benefit vendor application",
        text: `A new vendor application for ${businessName} is waiting for review.\nBusiness type: ${businessType}\nUniversity: ${university}\nReview it here: ${appBaseUrl}/admin-vendors.html`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Resend returned ${response.status}: ${await response.text()}`);
  } catch (error) {
    console.error("Could not send vendor application notification:", error.message);
  }
}

function setVendorSession(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `cb_vendor_session=${token}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=3600`);
}

router.post("/auth/signup", limitVendorSignup, async (req, res) => {
  const body = req.body ?? {};
  const businessName = clean(body.businessName);
  const businessType = clean(body.businessType);
  const university = clean(body.university);
  const location = clean(body.location);
  const email = clean(body.email).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const phoneNumber = clean(body.phoneNumber);
  const whatsappNumber = clean(body.whatsappNumber);
  const social = clean(body.social);
  const description = clean(body.description);

  if (!businessName || !businessType || !university || !location || !email || !password) {
    return res.status(400).json({ message: "Complete all required business and account fields." });
  }
  if (!emailPattern.test(email)) {
    return res.status(400).json({ message: "Enter a valid business email address." });
  }
  if (!phoneNumber && !whatsappNumber) {
    return res.status(400).json({ message: "Add a phone or WhatsApp number customers can use." });
  }
  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({ message: "Password must be at least 8 characters." });
  }

  try {
    const existing = await pool.query("SELECT id FROM vendors WHERE email = $1", [email]);
    if (existing.rowCount) {
      return res.status(409).json({ message: "A vendor account already uses that email. Try signing in." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO vendors
        (business_name, email, password_hash, phone_number, whatsapp_number,
         instagram_url, business_type, university, location, description,
         is_approved, approval_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE, 'pending')`,
      [businessName, email, passwordHash, phoneNumber || null, whatsappNumber || null,
        social || null, businessType, university, location, description || null]
    );

    await notifyAdminsOfVendorApplication({ businessName, businessType, university });

    return res.status(201).json({
      message: "Your business application was submitted and is waiting for Campus Benefit review.",
    });
  } catch (error) {
    console.error("Vendor application failed:", error.message);
    return res.status(500).json({ message: "Could not submit the business application." });
  }
});

router.post("/auth/login", limitVendorLogin, async (req, res) => {
  const email = clean(req.body?.email).toLowerCase();
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password) {
    return res.status(400).json({ message: "Enter your email and password." });
  }

  try {
    const result = await pool.query(
      `SELECT id, business_name, email, password_hash, is_approved,
              approval_status, review_note
       FROM vendors WHERE email = $1`,
      [email]
    );
    const vendor = result.rows[0];
    if (!vendor || !(await bcrypt.compare(password, vendor.password_hash))) {
      return res.status(401).json({ message: "Email or password is incorrect." });
    }
    if (!vendor.is_approved || vendor.approval_status !== "approved") {
      const message = vendor.approval_status === "rejected"
        ? `This business application was not approved${vendor.review_note ? `: ${vendor.review_note}` : "."}`
        : "Your business application is waiting for Campus Benefit review.";
      return res.status(403).json({ message });
    }
    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not configured");

    const token = jwt.sign(
      { sub: String(vendor.id), role: "vendor" },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "1h" }
    );
    setVendorSession(res, token);
    return res.json({
      message: "Vendor login successful.",
      vendor: { id: vendor.id, businessName: vendor.business_name, email: vendor.email },
    });
  } catch (error) {
    console.error("Vendor login failed:", error.message);
    return res.status(500).json({ message: "Could not log in." });
  }
});

router.post("/auth/logout", (req, res) => {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `cb_vendor_session=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`);
  return res.json({ message: "Logged out." });
});

router.get("/me", requireAuth, requireVendor, async (req, res) => {
  try {
    const vendor = await getApprovedVendor(req.user.id);
    if (!vendor) return res.status(403).json({ message: "Vendor account is not approved." });
    return res.json({ vendor });
  } catch (error) {
    console.error("Could not load vendor profile:", error.message);
    return res.status(500).json({ message: "Could not load vendor profile." });
  }
});

router.patch("/delivery-fee", requireAuth, requireVendor, async (req, res) => {
  const deliveryFee = Number(req.body?.deliveryFee);
  if (!Number.isFinite(deliveryFee) || deliveryFee < 0 || deliveryFee > 1000000) {
    return res.status(400).json({ message: "Enter a valid delivery fee of ₦0 or more." });
  }
  try {
    const result = await pool.query(
      `UPDATE vendors SET delivery_fee = $1
       WHERE id = $2 AND is_approved = TRUE AND approval_status = 'approved'
       RETURNING delivery_fee`,
      [deliveryFee, req.user.id]
    );
    if (!result.rowCount) return res.status(403).json({ message: "Vendor account is not approved." });
    return res.json({ deliveryFee: result.rows[0].delivery_fee });
  } catch (error) {
    console.error("Could not update delivery fee:", error.message);
    return res.status(500).json({ message: "Could not update delivery fee." });
  }
});

module.exports = { router, requireVendor, getApprovedVendor };
