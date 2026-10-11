const express = require("express");
const crypto = require("crypto");
const pool = require("../config/db");
const requireAuth = require("../middlewares/auth.middleware");
const { requireVendor, getApprovedVendor } = require("./vendor.routes");
const { getSecretKey, getKeyMode, paystackRequest, finalizeListingPayment } = require("../services/paystack.service");

const router = express.Router();
const allowedCategories = new Set(["food", "beauty", "fashion", "tech", "printing", "creative", "services"]);
const clean = (value) => typeof value === "string" ? value.trim() : "";

async function requireApprovedVendor(req, res, next) {
  try {
    const vendor = await getApprovedVendor(req.user.id);
    if (!vendor) return res.status(403).json({ message: "Vendor account is not approved." });
    req.vendor = vendor;
    return next();
  } catch (error) {
    console.error("Could not verify vendor account:", error.message);
    return res.status(500).json({ message: "Could not verify vendor account." });
  }
}

router.use(requireAuth, requireVendor, requireApprovedVendor);

router.get("/listing-packages", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT package_code, name, price_naira, duration_days
       FROM listing_packages
       WHERE is_active = TRUE
       ORDER BY duration_days ASC`
    );
    return res.json({ packages: result.rows });
  } catch (error) {
    console.error("Could not load listing packages:", error.message);
    return res.status(500).json({ message: "Could not load listing packages." });
  }
});

router.get("/listings", async (req, res) => {
  try {
    const result = await pool.query(
       `SELECT d.id, d.title, d.category, d.description, d.price, d.discount,
              d.image_url, d.offer_url, d.payment_status,
              (d.is_active AND (d.is_permanent OR d.expires_at > NOW())) AS is_active,
              d.expires_at, d.package_code, lp.name AS package_name,
              latest.status AS latest_payment_status, latest.created_at AS payment_started_at
       FROM deals d
       LEFT JOIN listing_packages lp ON lp.package_code = d.package_code
       LEFT JOIN LATERAL (
         SELECT status, created_at FROM deal_listing_payments
         WHERE deal_id = d.id AND vendor_id = $1
         ORDER BY created_at DESC, id DESC LIMIT 1
       ) latest ON TRUE
       WHERE d.vendor_id = $1
       ORDER BY d.created_at DESC, d.id DESC`,
      [req.vendor.id]
    );
    return res.json({ listings: result.rows });
  } catch (error) {
    console.error("Could not load vendor listings:", error.message);
    return res.status(500).json({ message: "Could not load vendor listings." });
  }
});

async function startCheckout(vendor, listingId) {
  if (!getSecretKey()) {
    const error = new Error("Paystack is not connected yet. The listing is saved but stays hidden until payment is set up.");
    error.status = 503;
    throw error;
  }
  const paymentMode = getKeyMode();
  if (!paymentMode) {
    const error = new Error("Add a valid Paystack secret key beginning with sk_test_ or sk_live_ in the backend .env file.");
    error.status = 503;
    throw error;
  }
  const listingResult = await pool.query(
    `SELECT d.id, d.payment_status, d.is_active, d.expires_at,
            lp.package_code, lp.price_naira, lp.duration_days
     FROM deals d
     JOIN listing_packages lp ON lp.package_code = d.package_code AND lp.is_active = TRUE
     WHERE d.id = $1 AND d.vendor_id = $2`,
    [listingId, vendor.id]
  );
  const listing = listingResult.rows[0];
  if (!listing) {
    const error = new Error("Listing not found or its package is no longer available.");
    error.status = 404;
    throw error;
  }
  if (listing.payment_status === "paid" && listing.is_active && listing.expires_at && new Date(listing.expires_at) > new Date()) {
    const error = new Error("This listing is already active.");
    error.status = 409;
    throw error;
  }

  const amountKobo = Math.round(Number(listing.price_naira) * 100);
  if (!Number.isSafeInteger(amountKobo) || amountKobo < 1) {
    const error = new Error("This listing package has an invalid price.");
    error.status = 500;
    throw error;
  }
  const reference = `CBL-${vendor.id}-${crypto.randomBytes(12).toString("hex")}`;
  const paymentResult = await pool.query(
    `INSERT INTO deal_listing_payments
       (vendor_id, deal_id, package_code, amount_kobo, reference, payment_mode, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING id`,
    [vendor.id, listing.id, listing.package_code, amountKobo, reference, paymentMode]
  );

  try {
    const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
    const data = await paystackRequest("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: vendor.email,
        amount: String(amountKobo),
        currency: "NGN",
        reference,
        callback_url: `${baseUrl}/vendor-dashboard.html?listing_payment=1`,
        metadata: { vendor_id: String(vendor.id), listing_id: String(listing.id), package_code: listing.package_code },
      }),
    });
    if (data.reference !== reference || !data.authorization_url) {
      throw new Error("Paystack returned an invalid checkout response.");
    }
    return { authorizationUrl: data.authorization_url, reference, paymentId: paymentResult.rows[0].id };
  } catch (error) {
    if (error.status !== 503) {
      await pool.query("UPDATE deal_listing_payments SET status = 'failed' WHERE id = $1", [paymentResult.rows[0].id]);
    }
    throw error;
  }
}

router.post("/listings", async (req, res) => {
  const body = req.body ?? {};
  const title = clean(body.title);
  const category = clean(body.category).toLowerCase();
  const description = clean(body.description);
  const discount = clean(body.discount);
  const imageUrl = clean(body.imageUrl);
  const offerUrl = clean(body.offerUrl);
  const packageCode = clean(body.packageCode);
  const priceText = body.price === "" || body.price == null ? "" : String(body.price).trim();
  const price = priceText ? Number(priceText) : null;

  if (!title || title.length > 160 || !allowedCategories.has(category)) {
    return res.status(400).json({ message: "Enter a listing title and choose a valid category." });
  }
  if (description.length > 2000 || discount.length > 100) {
    return res.status(400).json({ message: "The description or discount text is too long." });
  }
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > 99999999)) {
    return res.status(400).json({ message: "Enter a valid price or leave it blank." });
  }
  for (const [label, value] of [["Image link", imageUrl], ["Offer link", offerUrl]]) {
    if (value) {
      try {
        const parsed = new URL(value);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch {
        return res.status(400).json({ message: `${label} must be a valid http or https link.` });
      }
    }
  }

  try {
    const packageResult = await pool.query(
      "SELECT package_code FROM listing_packages WHERE package_code = $1 AND is_active = TRUE",
      [packageCode]
    );
    if (!packageResult.rowCount) return res.status(400).json({ message: "Choose an available listing package." });

    const result = await pool.query(
      `INSERT INTO deals
         (title, category, description, price, discount, vendor_name, location,
          image_url, offer_url, is_active, is_permanent, payment_status, expires_at,
          vendor_id, package_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE, FALSE, 'pending', NULL, $10, $11)
       RETURNING id, title, payment_status, package_code`,
      [title, category, description || null, price, discount || null, req.vendor.business_name,
        req.vendor.location || null, imageUrl || null, offerUrl || null, req.vendor.id, packageCode]
    );
    const listing = result.rows[0];

    if (!getSecretKey()) {
      return res.status(201).json({
        message: "Your listing draft is saved. Paystack is not connected yet, so it will stay hidden until payment is set up.",
        listing,
        paymentReady: false,
      });
    }

    const checkout = await startCheckout(req.vendor, listing.id);
    return res.status(201).json({ message: "Listing saved. Complete payment to publish it.", listing, ...checkout });
  } catch (error) {
    console.error("Could not create featured listing:", error.message);
    return res.status(error.status || 500).json({ message: error.message || "Could not create the listing." });
  }
});

router.post("/listings/:listingId/checkout", async (req, res) => {
  const listingId = Number(req.params.listingId);
  if (!Number.isSafeInteger(listingId) || listingId < 1) {
    return res.status(400).json({ message: "Choose a valid listing." });
  }
  try {
    const checkout = await startCheckout(req.vendor, listingId);
    return res.json({ message: "Complete payment to publish your listing.", ...checkout });
  } catch (error) {
    console.error("Could not start listing checkout:", error.message);
    return res.status(error.status || 500).json({ message: error.message || "Could not start checkout." });
  }
});

router.post("/listings/payments/verify", async (req, res) => {
  const reference = clean(req.body?.reference);
  if (!/^[A-Za-z0-9.=-]{1,100}$/.test(reference)) {
    return res.status(400).json({ message: "Enter a valid payment reference." });
  }
  try {
    const ownPayment = await pool.query(
      "SELECT id FROM deal_listing_payments WHERE reference = $1 AND vendor_id = $2",
      [reference, req.vendor.id]
    );
    if (!ownPayment.rowCount) return res.status(404).json({ message: "Payment was not found for this vendor account." });

    const data = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`, { method: "GET" });
    if (data.reference !== reference || data.status !== "success") {
      return res.status(202).json({ message: "Payment is not complete yet. You can try checking again." });
    }
    const applied = await finalizeListingPayment({
      reference,
      amount: data.amount,
      currency: data.currency,
      domain: data.domain,
      transactionId: data.id,
    });
    if (!applied.found) return res.status(404).json({ message: "Payment record was not found." });
    if (!applied.paid) return res.status(400).json({ message: "Payment amount or currency did not match the listing package." });
    return res.json({ message: "Payment confirmed. Your listing is now active.", listingId: applied.listingId });
  } catch (error) {
    console.error("Could not verify listing payment:", error.message);
    return res.status(error.status || 502).json({ message: error.message || "Could not verify the payment." });
  }
});

module.exports = router;
