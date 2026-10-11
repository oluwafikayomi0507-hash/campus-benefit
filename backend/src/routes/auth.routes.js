const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const requireAuth = require("../middlewares/auth.middleware");

const router = express.Router();
const allowedLevels = new Set(["100", "200", "300", "400", "500", "600"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const resetRequestTimes = new Map();

function allowResetRequest(ip) {
  const now = Date.now();
  const recent = (resetRequestTimes.get(ip) || []).filter((time) => now - time < 15 * 60 * 1000);
  if (recent.length >= 5) return false;
  recent.push(now);
  resetRequestTimes.set(ip, recent);
  if (resetRequestTimes.size > 5000) {
    for (const [address, times] of resetRequestTimes) {
      if (!times.some((time) => now - time < 15 * 60 * 1000)) resetRequestTimes.delete(address);
    }
  }
  return true;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    { sub: String(user.id), role: "student" },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: "1h" }
  );
}

router.post("/signup", async (req, res) => {
  const body = req.body ?? {};
  const fullName = cleanText(body.fullName);
  const email = cleanText(body.email).toLowerCase();
  const university = cleanText(body.university);
  const level = cleanText(body.level);
  const password = typeof body.password === "string" ? body.password : "";

  if (!fullName || !email || !university || !level || !password) {
    return res.status(400).json({ message: "Please complete all required fields." });
  }

  if (!emailPattern.test(email)) {
    return res.status(400).json({ message: "Enter a valid email address." });
  }

  if (!allowedLevels.has(level)) {
    return res.status(400).json({ message: "Select a valid study level." });
  }

  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({
      message: "Password must be at least 8 characters and no more than 72 bytes.",
    });
  }

  try {
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rowCount > 0) {
      return res.status(409).json({ message: "An account with that email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, university, level, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, full_name, email, university, level`,
      [fullName, email, passwordHash, university, level]
    );

    const user = result.rows[0];
    const token = createToken(user);

    res.status(201).json({
      message: "Account created successfully.",
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        university: user.university,
        level: user.level,
      },
    });
  } catch (error) {
    console.error("Sign-up failed:", error.message);
    res.status(500).json({ message: "Could not create the account." });
  }
});

router.post("/login", async (req, res) => {
  const body = req.body ?? {};
  const email = cleanText(body.email).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return res.status(400).json({ message: "Enter your email and password." });
  }

  try {
    const result = await pool.query(
      `SELECT id, full_name, email, password_hash, university, level
       FROM users
       WHERE email = $1`,
      [email]
    );

    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: "Email or password is incorrect." });
    }

    const token = createToken(user);

    res.json({
      message: "Login successful.",
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        university: user.university,
        level: user.level,
      },
    });
  } catch (error) {
    console.error("Login failed:", error.message);
    res.status(500).json({ message: "Could not log in." });
  }
});

router.post("/forgot-password", async (req, res) => {
  const email = cleanText(req.body?.email).toLowerCase();
  if (!emailPattern.test(email)) return res.status(400).json({ message: "Enter a valid email address." });
  if (!allowResetRequest(req.ip || "unknown")) return res.status(429).json({ message: "Too many reset requests. Please wait 15 minutes and try again." });
  const genericMessage = "If an account uses that email and password reset is enabled, a reset link will be sent shortly.";

  try {
    const userResult = await pool.query("SELECT id, email FROM users WHERE email = $1", [email]);
    const user = userResult.rows[0];
    if (!user) return res.json({ message: genericMessage });
    const consoleResetMode = process.env.PASSWORD_RESET_MODE === "console" && process.env.NODE_ENV !== "production";
    if (!consoleResetMode && (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)) {
      console.error("Password reset email is not configured. Set RESEND_API_KEY and EMAIL_FROM in backend .env.");
      return res.json({ message: genericMessage });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await pool.query(
      `UPDATE password_reset_tokens SET used_at = NOW()
       WHERE user_id = $1 AND used_at IS NULL`,
      [user.id]
    );
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '20 minutes')`,
      [user.id, tokenHash]
    );

    const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
    const resetUrl = `${baseUrl}/login.html?reset=${token}`;
    if (consoleResetMode) {
      console.log(`Local-only password reset link for ${user.email} (expires in 20 minutes): ${resetUrl}`);
      return res.json({ message: "Your local reset link is ready. Copy it from the backend PowerShell window." });
    }
    let emailResponse;
    try {
      emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM,
          to: [user.email],
          subject: "Reset your Campus Benefit password",
          html: `<p>We received a request to reset your Campus Benefit password.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 20 minutes. If you did not request this, you can ignore this email.</p>`,
          text: `Reset your Campus Benefit password using this link: ${resetUrl}\nThis link expires in 20 minutes. If you did not request this, ignore this email.`,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!emailResponse.ok) throw new Error(`Resend returned ${emailResponse.status}: ${await emailResponse.text()}`);
    } catch (error) {
      await pool.query(
        "UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1",
        [tokenHash]
      );
      console.error("Could not send password reset email:", error.message);
    }
    return res.json({ message: genericMessage });
  } catch (error) {
    console.error("Could not request password reset:", error.message);
    return res.status(500).json({ message: "Could not process that request. Please try again." });
  }
});

router.post("/reset-password", async (req, res) => {
  const token = cleanText(req.body?.token);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!/^[a-f\d]{64}$/i.test(token)) return res.status(400).json({ message: "This reset link is invalid or expired. Request a new one." });
  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({ message: "Password must be at least 8 characters and no more than 72 bytes." });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tokenResult = await client.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       FOR UPDATE`,
      [tokenHash]
    );
    const reset = tokenResult.rows[0];
    if (!reset) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "This reset link is invalid or expired. Request a new one." });
    }
    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, reset.user_id]);
    await client.query(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
      [reset.user_id]
    );
    await client.query("COMMIT");
    return res.json({ message: "Password changed. You can now log in with your new password." });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("Could not reset password:", error.message);
    return res.status(500).json({ message: "Could not reset the password. Request a new link and try again." });
  } finally {
    client.release();
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, university, level
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ message: "Student account not found." });
    }

    res.json({
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        university: user.university,
        level: user.level,
      },
    });
  } catch (error) {
    console.error("Could not load student profile:", error.message);
    res.status(500).json({ message: "Could not load student profile." });
  }
});

module.exports = router;
