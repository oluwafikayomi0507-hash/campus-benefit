const express = require("express");
const pool = require("../config/db");
const requireAuth = require("../middlewares/auth.middleware");
const createRateLimiter = require("../middlewares/rate-limit.middleware");
const { requireVendor, getApprovedVendor } = require("./vendor.routes");

const router = express.Router();
const productCategories = new Set(["food", "beauty", "fashion", "tech", "printing", "creative", "services"]);
const limitStudentOrders = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: "Too many orders. Please wait an hour before placing another order.",
  keyGenerator: (req) => `student:${req.user.id}`,
});

function requireStudent(req, res, next) {
  if (req.user?.role === "vendor") {
    return res.status(403).json({ message: "Student account required." });
  }
  return next();
}

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

async function notifyVendorOfNewOrder(email, orderId) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    console.error("Vendor order notification is not configured. Set RESEND_API_KEY and EMAIL_FROM.");
    return;
  }

  const appBaseUrl = (process.env.APP_BASE_URL || "https://campusbenefit.com.ng").replace(/\/$/, "");
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [email],
        subject: `New Campus Benefit order #${orderId}`,
        text: `A student placed order #${orderId}. Sign in to your vendor dashboard to view the order and respond: ${appBaseUrl}/vendor-dashboard.html`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Resend returned ${response.status}: ${await response.text()}`);
  } catch (error) {
    // The order is already saved; an email problem must not make checkout appear to fail.
    console.error("Could not send vendor order notification:", error.message);
  }
}

router.get("/products", requireAuth, requireStudent, async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category.trim().toLowerCase() : "";
  if (category && !productCategories.has(category)) {
    return res.status(400).json({ message: "Choose a valid marketplace category." });
  }
  try {
    const result = await pool.query(
       `SELECT p.id, p.vendor_id, p.product_name, p.category, p.description, p.price, p.image_url,
              v.business_name, v.university, v.location, v.delivery_fee
       FROM vendor_products p
       JOIN vendors v ON v.id = p.vendor_id
       WHERE p.is_available = TRUE
         AND v.is_approved = TRUE
         AND v.approval_status = 'approved'
         AND ($1 = '' OR p.category = $1)
       ORDER BY v.business_name, p.product_name`,
      [category]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Could not load vendor products:", error.message);
    return res.status(500).json({ message: "Could not load vendor products." });
  }
});

router.get("/vendor/products", requireAuth, requireVendor, requireApprovedVendor, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, vendor_id, product_name, category, description, price, image_url, is_available, created_at
       FROM vendor_products
       WHERE vendor_id = $1
       ORDER BY created_at DESC, id DESC`,
      [req.vendor.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Could not load vendor products:", error.message);
    return res.status(500).json({ message: "Could not load your products." });
  }
});

router.post("/vendor/products", requireAuth, requireVendor, requireApprovedVendor, async (req, res) => {
  const name = typeof req.body?.productName === "string" ? req.body.productName.trim() : "";
  const category = typeof req.body?.category === "string" ? req.body.category.trim().toLowerCase() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  const imageUrl = typeof req.body?.imageUrl === "string" ? req.body.imageUrl.trim() : "";
  const price = Number(req.body?.price);
  if (!name || !productCategories.has(category) || name.length > 160 || description.length > 2000 || !Number.isFinite(price) || price < 0 || price > 99999999) {
    return res.status(400).json({ message: "Enter a product name, choose a category, and enter a valid non-negative price." });
  }
  if (imageUrl) {
    try {
      if (!["http:", "https:"].includes(new URL(imageUrl).protocol)) throw new Error();
    } catch {
      return res.status(400).json({ message: "Image link must be a valid http or https link." });
    }
  }

  try {
    const result = await pool.query(
      `INSERT INTO vendor_products (vendor_id, product_name, category, description, price, image_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, vendor_id, product_name, category, description, price, image_url, is_available`,
      [req.vendor.id, name, category, description || null, price, imageUrl || null]
    );
    return res.status(201).json({ product: result.rows[0] });
  } catch (error) {
    console.error("Could not save product:", error.message);
    return res.status(500).json({ message: "Could not save product." });
  }
});

router.patch("/vendor/products/:productId", requireAuth, requireVendor, requireApprovedVendor, async (req, res) => {
  const productId = Number(req.params.productId);
  const isAvailable = req.body?.isAvailable;
  if (!Number.isSafeInteger(productId) || productId < 1 || typeof isAvailable !== "boolean") {
    return res.status(400).json({ message: "Choose a valid product and availability." });
  }
  try {
    const result = await pool.query(
      `UPDATE vendor_products SET is_available = $1
       WHERE id = $2 AND vendor_id = $3
       RETURNING id, product_name, is_available`,
      [isAvailable, productId, req.vendor.id]
    );
    if (!result.rowCount) return res.status(404).json({ message: "Product not found in your account." });
    return res.json({ product: result.rows[0] });
  } catch (error) {
    console.error("Could not update product availability:", error.message);
    return res.status(500).json({ message: "Could not update product availability." });
  }
});

router.get("/vendor/orders", requireAuth, requireVendor, requireApprovedVendor, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.id, o.student_id, o.customer_phone, o.delivery_note, o.delivery_method,
              o.item_subtotal, o.delivery_fee, o.total_amount, o.status, o.created_at,
              u.full_name AS student_name, u.email AS student_email,
              COALESCE(json_agg(json_build_object(
                'productName', oi.product_name,
                'unitPrice', oi.unit_price,
                'quantity', oi.quantity
              )) FILTER (WHERE oi.id IS NOT NULL), '[]'::json) AS items
       FROM vendor_orders o
       JOIN users u ON u.id = o.student_id
       LEFT JOIN vendor_order_items oi ON oi.order_id = o.id
       WHERE o.vendor_id = $1
       GROUP BY o.id, u.full_name, u.email
       ORDER BY o.created_at DESC`,
      [req.vendor.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Could not load vendor orders:", error.message);
    return res.status(500).json({ message: "Could not load vendor orders." });
  }
});

router.patch("/vendor/orders/:orderId/status", requireAuth, requireVendor, requireApprovedVendor, async (req, res) => {
  const transitions = {
    pending: ["accepted", "cancelled"],
    accepted: ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ready: ["completed", "cancelled"],
  };
  const status = typeof req.body?.status === "string" ? req.body.status : "";
  const orderId = Number(req.params.orderId);
  if (!Number.isSafeInteger(orderId) || orderId < 1 || !Object.values(transitions).some((next) => next.includes(status))) {
    return res.status(400).json({ message: "Choose a valid order and status." });
  }

  try {
    const current = await pool.query(
      "SELECT status FROM vendor_orders WHERE id = $1 AND vendor_id = $2",
      [orderId, req.vendor.id]
    );
    if (!current.rowCount) return res.status(404).json({ message: "Order not found." });
    if (!transitions[current.rows[0].status]?.includes(status)) {
      return res.status(409).json({ message: `Order cannot move from ${current.rows[0].status} to ${status}.` });
    }
    const result = await pool.query(
      `UPDATE vendor_orders SET status = $1, updated_at = NOW()
       WHERE id = $2 AND vendor_id = $3 AND status = $4
       RETURNING id, status, updated_at`,
      [status, orderId, req.vendor.id, current.rows[0].status]
    );
    if (!result.rowCount) return res.status(409).json({ message: "This order changed. Refresh your inbox and try again." });
    return res.json({ order: result.rows[0] });
  } catch (error) {
    console.error("Could not update order:", error.message);
    return res.status(500).json({ message: "Could not update order." });
  }
});

router.post("/orders", requireAuth, requireStudent, limitStudentOrders, async (req, res) => {
  const body = req.body ?? {};
  const customerPhone = typeof body.customerPhone === "string" ? body.customerPhone.trim() : "";
  const deliveryNote = typeof body.deliveryNote === "string" ? body.deliveryNote.trim() : "";
  const deliveryMethod = body.deliveryMethod;
  const rawGroups = Array.isArray(body.orders)
    ? body.orders
    : [{ vendorId: body.vendorId, items: body.items }];

  if (!["delivery", "pickup"].includes(deliveryMethod)) {
    return res.status(400).json({ message: "Choose delivery or pickup." });
  }
  if (rawGroups.length === 0 || rawGroups.length > 20) {
    return res.status(400).json({ message: "Your cart must contain products from at least one vendor." });
  }

  const groups = [];
  const groupByVendor = new Map();
  let totalItems = 0;
  for (const rawGroup of rawGroups) {
    const vendorId = Number(rawGroup?.vendorId);
    if (!Number.isSafeInteger(vendorId) || vendorId < 1 || !Array.isArray(rawGroup?.items)) {
      return res.status(400).json({ message: "Each cart group needs a valid vendor and items." });
    }
    let group = groupByVendor.get(vendorId);
    if (!group) {
      group = { vendorId, quantities: new Map() };
      groups.push(group);
      groupByVendor.set(vendorId, group);
    }

    for (const item of rawGroup.items) {
      const productId = Number(item?.productId);
      const quantity = Number(item?.quantity);
      if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50) {
        return res.status(400).json({ message: "Each item needs a valid product and quantity." });
      }
      group.quantities.set(productId, (group.quantities.get(productId) || 0) + quantity);
      totalItems += 1;
    }
  }
  if (totalItems === 0 || totalItems > 50 || groups.some((group) => group.quantities.size === 0)) {
    return res.status(400).json({ message: "Your cart must contain 1 to 50 items." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const createdOrders = [];
    const orderNotifications = [];
    for (const group of groups) {
      const productIds = Array.from(group.quantities.keys());
      const productResult = await client.query(
        `SELECT p.id, p.vendor_id, p.product_name, p.price, v.delivery_fee, v.email AS vendor_email
         FROM vendor_products p
         JOIN vendors v ON v.id = p.vendor_id
         WHERE p.id = ANY($1::integer[]) AND p.vendor_id = $2
           AND p.is_available = TRUE
           AND v.is_approved = TRUE
           AND v.approval_status = 'approved'`,
        [productIds, group.vendorId]
      );
      if (productResult.rowCount !== productIds.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "One or more selected products are unavailable. Refresh your cart and try again." });
      }

      const itemSubtotal = productResult.rows.reduce(
        (sum, product) => sum + Number(product.price) * group.quantities.get(Number(product.id)),
        0
      );
      const deliveryFee = deliveryMethod === "pickup" ? 0 : Number(productResult.rows[0].delivery_fee);
      const totalAmount = itemSubtotal + deliveryFee;
      const orderResult = await client.query(
        `INSERT INTO vendor_orders
           (student_id, vendor_id, customer_phone, delivery_note, delivery_method,
            item_subtotal, delivery_fee, total_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, vendor_id, status, created_at, delivery_method,
                   item_subtotal, delivery_fee, total_amount`,
        [req.user.id, group.vendorId, customerPhone || null, deliveryNote || null,
          deliveryMethod, itemSubtotal, deliveryFee, totalAmount]
      );
      const order = orderResult.rows[0];
      for (const product of productResult.rows) {
        await client.query(
          `INSERT INTO vendor_order_items (order_id, product_id, product_name, unit_price, quantity)
           VALUES ($1, $2, $3, $4, $5)`,
          [order.id, product.id, product.product_name, product.price, group.quantities.get(Number(product.id))]
        );
      }
      createdOrders.push(order);
      orderNotifications.push({ email: productResult.rows[0].vendor_email, orderId: order.id });
    }

    await client.query("COMMIT");
    for (const notification of orderNotifications) {
      void notifyVendorOfNewOrder(notification.email, notification.orderId);
    }
    return res.status(201).json({ message: "Your order was sent to the vendor(s).", orders: createdOrders });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* Transaction may already be closed. */ }
    console.error("Could not place order:", error.message);
    return res.status(500).json({ message: "Could not place your order." });
  } finally {
    client.release();
  }
});

router.get("/orders/mine", requireAuth, requireStudent, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.id, o.vendor_id, v.business_name, o.customer_phone, o.delivery_note,
              o.delivery_method, o.item_subtotal, o.delivery_fee, o.total_amount,
              o.status, o.created_at,
              COALESCE(json_agg(json_build_object(
                'productName', oi.product_name,
                'unitPrice', oi.unit_price,
                'quantity', oi.quantity
              )) FILTER (WHERE oi.id IS NOT NULL), '[]'::json) AS items
       FROM vendor_orders o
       JOIN vendors v ON v.id = o.vendor_id
       LEFT JOIN vendor_order_items oi ON oi.order_id = o.id
       WHERE o.student_id = $1
       GROUP BY o.id, v.business_name
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Could not load student orders:", error.message);
    return res.status(500).json({ message: "Could not load your orders." });
  }
});

module.exports = router;
