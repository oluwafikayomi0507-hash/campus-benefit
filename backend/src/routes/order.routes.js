const express = require("express");
const pool = require("../config/db");
const requireAuth = require("../middlewares/auth.middleware");
const createRateLimiter = require("../middlewares/rate-limit.middleware");
const { requireVendor, getApprovedVendor } = require("./vendor.routes");
const { getKeyMode, paystackRequest, finalizeMarketplacePayment, notifyMarketplaceVendors } = require("../services/paystack.service");
const { studentCancellationConflict } = require("../services/order-policy");

const router = express.Router();
const productCategories = new Set(["food", "beauty", "fashion", "tech", "printing", "creative", "services"]);
const limitStudentOrders = createRateLimiter({
  name: "student-orders",
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

const marketplacePaymentsEnabled = () => process.env.MARKETPLACE_PAYMENTS_ENABLED === "true";
const commissionRate = () => {
  const value = Number(process.env.MARKETPLACE_PLATFORM_COMMISSION_PERCENT || 5);
  return Number.isFinite(value) && value >= 0 && value <= 20 ? value : 5;
};

async function createMarketplaceCheckout(req, groups, { customerPhone, deliveryNote, deliveryMethod, deliveryAddress = "" }) {
  const paymentMode = getKeyMode();
  if (!paymentMode) {
    const error = new Error("Online payments are temporarily unavailable. Please try again later.");
    error.status = 503;
    throw error;
  }
  const client = await pool.connect();
  let paymentId;
  let reference;
  let amountKobo;
  let checkoutVendors = [];
  let checkoutTotals = { subtotal: 0, delivery: 0, platformFee: 0 };
  try {
    await client.query("BEGIN");
    const orderData = [];
    for (const group of groups) {
      const productIds = Array.from(group.quantities.keys());
      const products = await client.query(
        `SELECT p.id, p.vendor_id, p.product_name, p.price,
                v.delivery_fee, v.email AS vendor_email, v.paystack_subaccount_code, v.payout_mode
         FROM vendor_products p JOIN vendors v ON v.id = p.vendor_id
         WHERE p.id = ANY($1::integer[]) AND p.vendor_id = $2 AND p.is_available = TRUE
           AND v.is_approved = TRUE AND v.approval_status = 'approved'`,
        [productIds, group.vendorId]
      );
      if (products.rowCount !== productIds.length) {
        const error = new Error("One or more selected products are unavailable. Refresh your cart and try again.");
        error.status = 400;
        throw error;
      }
      const vendor = products.rows[0];
      if (!vendor.paystack_subaccount_code || vendor.payout_mode !== paymentMode) {
        const error = new Error("A vendor in your cart has not connected a matching Paystack payout account. Contact the vendor or choose products from vendors ready for online payment.");
        error.status = 409;
        throw error;
      }
      const itemSubtotalKobo = products.rows.reduce((sum, product) =>
        sum + Math.round(Number(product.price) * 100) * group.quantities.get(Number(product.id)), 0);
      const deliveryKobo = deliveryMethod === "pickup" ? 0 : Math.round(Number(vendor.delivery_fee) * 100);
      const vendorCommissionKobo = Math.round(itemSubtotalKobo * commissionRate() / 100);
      orderData.push({ group, products: products.rows, vendor, itemSubtotalKobo, deliveryKobo,
        vendorShareKobo: itemSubtotalKobo - vendorCommissionKobo + deliveryKobo });
    }
    const subtotalKobo = orderData.reduce((sum, order) => sum + order.itemSubtotalKobo, 0);
    const deliveryTotalKobo = orderData.reduce((sum, order) => sum + order.deliveryKobo, 0);
    amountKobo = subtotalKobo + deliveryTotalKobo;
    const platformFeeKobo = Math.round(subtotalKobo * commissionRate() / 100);
    checkoutVendors = orderData.map((order) => ({ subaccount: order.vendor.paystack_subaccount_code, share: order.vendorShareKobo }));
    checkoutTotals = { subtotal: subtotalKobo / 100, delivery: deliveryTotalKobo / 100, platformFee: platformFeeKobo / 100 };
    if (amountKobo < 100) {
      const error = new Error("The checkout total must be at least ₦1.00.");
      error.status = 400;
      throw error;
    }
    reference = `CBM-${req.user.id}-${require("crypto").randomBytes(16).toString("hex")}`;
    const payment = await client.query(
      `INSERT INTO marketplace_payments
         (student_id, reference, amount_kobo, item_subtotal, delivery_total, platform_fee, payment_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [req.user.id, reference, amountKobo, subtotalKobo / 100, deliveryTotalKobo / 100, platformFeeKobo / 100, paymentMode]
    );
    paymentId = payment.rows[0].id;
    for (const order of orderData) {
      const orderSubtotal = order.itemSubtotalKobo / 100;
      const delivery = order.deliveryKobo / 100;
      const created = await client.query(
        `INSERT INTO vendor_orders
           (student_id, vendor_id, customer_phone, delivery_note, delivery_method, delivery_address,
            item_subtotal, delivery_fee, total_amount, payment_status, marketplace_payment_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)
         RETURNING id`,
        [req.user.id, order.group.vendorId, customerPhone || null, deliveryNote || null,
          deliveryMethod, deliveryAddress || null, orderSubtotal, delivery, orderSubtotal + delivery,
          paymentId]
      );
      order.orderId = created.rows[0].id;
      for (const product of order.products) {
        await client.query(
          `INSERT INTO vendor_order_items (order_id, product_id, product_name, unit_price, quantity)
           VALUES ($1, $2, $3, $4, $5)`,
          [order.orderId, product.id, product.product_name, product.price, order.group.quantities.get(Number(product.id))]
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* Transaction may already be closed. */ }
    throw error;
  } finally {
    client.release();
  }

  try {
    const user = await pool.query("SELECT email FROM users WHERE id = $1", [req.user.id]);
    const initialized = await paystackRequest("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: user.rows[0]?.email,
        amount: amountKobo,
        currency: "NGN",
        reference,
        callback_url: `${(process.env.APP_BASE_URL || "https://campusbenefit.com.ng").replace(/\/$/, "")}/vendors.html?order_payment=1`,
        metadata: { purpose: "marketplace_order", payment_id: paymentId },
        split: {
          type: "flat",
          bearer_type: "all-proportional",
          subaccounts: checkoutVendors.filter((item) => item.share > 0).map(({ subaccount, share }) => ({ subaccount, share })),
        },
      }),
    });
    if (!initialized.authorization_url) throw new Error("Paystack did not return a checkout URL.");
    await pool.query("UPDATE marketplace_payments SET authorization_url = $1 WHERE id = $2", [initialized.authorization_url, paymentId]);
    return {
      authorizationUrl: initialized.authorization_url,
      reference,
      amount: amountKobo / 100,
      itemSubtotal: checkoutTotals.subtotal,
      deliveryTotal: checkoutTotals.delivery,
      commissionPercent: commissionRate(),
      platformShare: checkoutTotals.platformFee,
    };
  } catch (error) {
    await pool.query(
      `UPDATE marketplace_payments SET status = 'failed' WHERE id = $1 AND status = 'pending'`, [paymentId]
    ).catch(() => {});
    await pool.query(
      `UPDATE vendor_orders SET payment_status = 'failed', status = 'cancelled', updated_at = NOW()
       WHERE marketplace_payment_id = $1 AND payment_status = 'pending'`, [paymentId]
    ).catch(() => {});
    throw error;
  }
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

async function notifyVendorOfOrderCancellation(email, orderId, reason) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    console.error("Vendor cancellation notification is not configured. Set RESEND_API_KEY and EMAIL_FROM.");
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
        subject: `Campus Benefit order #${orderId} was cancelled`,
        text: `The student cancelled order #${orderId}. Reason: ${reason}\n\nView your vendor dashboard: ${appBaseUrl}/vendor-dashboard.html`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Resend returned ${response.status}: ${await response.text()}`);
  } catch (error) {
    // Cancellation is already saved; email failure must not undo or hide it.
    console.error("Could not send vendor cancellation notification:", error.message);
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
              o.item_subtotal, o.delivery_fee, o.total_amount, o.status, o.payment_status,
              o.delivery_address,
              o.cancellation_reason, o.cancelled_by, o.created_at,
              u.full_name AS student_name, u.email AS student_email,
              COALESCE(json_agg(json_build_object(
                'productName', oi.product_name,
                'unitPrice', oi.unit_price,
                'quantity', oi.quantity
              )) FILTER (WHERE oi.id IS NOT NULL), '[]'::json) AS items
       FROM vendor_orders o
       JOIN users u ON u.id = o.student_id
       LEFT JOIN vendor_order_items oi ON oi.order_id = o.id
       WHERE o.vendor_id = $1 AND o.payment_status <> 'pending'
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
  const cancellationReason = typeof req.body?.cancellationReason === "string"
    ? req.body.cancellationReason.trim()
    : "";
  const orderId = Number(req.params.orderId);
  if (!Number.isSafeInteger(orderId) || orderId < 1 || !Object.values(transitions).some((next) => next.includes(status))) {
    return res.status(400).json({ message: "Choose a valid order and status." });
  }
  if (status === "cancelled" && (!cancellationReason || cancellationReason.length > 1000)) {
    return res.status(400).json({ message: "Enter a cancellation reason (up to 1,000 characters) before cancelling this order." });
  }

  try {
    const current = await pool.query(
      "SELECT status, payment_status FROM vendor_orders WHERE id = $1 AND vendor_id = $2 AND payment_status <> 'pending'",
      [orderId, req.vendor.id]
    );
    if (!current.rowCount) return res.status(404).json({ message: "Order not found." });
    if (status === "cancelled" && current.rows[0].payment_status === "paid") {
      return res.status(409).json({ message: "This order has been paid. Contact Campus Benefit support to review cancellation and refund options." });
    }
    if (!transitions[current.rows[0].status]?.includes(status)) {
      return res.status(409).json({ message: `Order cannot move from ${current.rows[0].status} to ${status}.` });
    }
    const result = await pool.query(
      `UPDATE vendor_orders
       SET status = $1::varchar,
           cancellation_reason = CASE WHEN $1::varchar = 'cancelled' THEN $5::text ELSE cancellation_reason END,
           cancelled_by = CASE WHEN $1::varchar = 'cancelled' THEN 'vendor' ELSE cancelled_by END,
           updated_at = NOW()
       WHERE id = $2 AND vendor_id = $3 AND status = $4
       RETURNING id, status, updated_at`,
      [status, orderId, req.vendor.id, current.rows[0].status, cancellationReason || null]
    );
    if (!result.rowCount) return res.status(409).json({ message: "This order changed. Refresh your inbox and try again." });
    return res.json({ order: result.rows[0] });
  } catch (error) {
    console.error("Could not update order:", error.message);
    return res.status(500).json({ message: "Could not update order." });
  }
});

router.post("/orders/:orderId/cancel", requireAuth, requireStudent, async (req, res) => {
  const orderId = Number(req.params.orderId);
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!Number.isSafeInteger(orderId) || orderId < 1) {
    return res.status(400).json({ message: "Choose a valid order." });
  }
  if (!reason || reason.length > 1000) {
    return res.status(400).json({ message: "Enter a cancellation reason (up to 1,000 characters)." });
  }

  try {
    const order = await pool.query(
      `SELECT o.status, o.payment_status, v.email AS vendor_email
       FROM vendor_orders o
       JOIN vendors v ON v.id = o.vendor_id
       WHERE o.id = $1 AND o.student_id = $2`,
      [orderId, req.user.id]
    );
    if (!order.rowCount) return res.status(404).json({ message: "Order not found." });
    const cancellationConflict = studentCancellationConflict(order.rows[0]);
    if (cancellationConflict) {
      return res.status(409).json({ message: cancellationConflict });
    }

    const cancelled = await pool.query(
      `UPDATE vendor_orders
       SET status = 'cancelled', cancellation_reason = $1, cancelled_by = 'student', updated_at = NOW()
       WHERE id = $2 AND student_id = $3 AND status IN ('pending', 'accepted') AND payment_status = 'not_required'
       RETURNING id, status, cancellation_reason, cancelled_by`,
      [reason, orderId, req.user.id]
    );
    if (!cancelled.rowCount) {
      return res.status(409).json({ message: "The vendor updated this order at the same time. Refresh My Orders and check its status." });
    }
    void notifyVendorOfOrderCancellation(order.rows[0].vendor_email, orderId, reason);
    return res.json({ message: "Your order was cancelled and the reason was saved.", order: cancelled.rows[0] });
  } catch (error) {
    console.error("Could not cancel student order:", error.message);
    return res.status(500).json({ message: "Could not cancel your order." });
  }
});

router.post("/orders", requireAuth, requireStudent, limitStudentOrders, async (req, res) => {
  const body = req.body ?? {};
  const customerPhone = typeof body.customerPhone === "string" ? body.customerPhone.trim() : "";
  const deliveryNote = typeof body.deliveryNote === "string" ? body.deliveryNote.trim() : "";
  const deliveryMethod = body.deliveryMethod;
  const deliveryAddress = typeof body.deliveryAddress === "string" ? body.deliveryAddress.trim() : "";
  const rawGroups = Array.isArray(body.orders)
    ? body.orders
    : [{ vendorId: body.vendorId, items: body.items }];

  if (!["delivery", "pickup"].includes(deliveryMethod)) {
    return res.status(400).json({ message: "Choose delivery or pickup." });
  }
  if (deliveryMethod === "delivery" && (!deliveryAddress || deliveryAddress.length > 500)) {
    return res.status(400).json({ message: "Enter a delivery address up to 500 characters." });
  }
  if (deliveryNote.length > 1000) {
    return res.status(400).json({ message: "Keep order notes under 1,000 characters." });
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
      const combinedQuantity = (group.quantities.get(productId) || 0) + quantity;
      if (combinedQuantity > 50) {
        return res.status(400).json({ message: "You can order up to 50 of each product at a time." });
      }
      group.quantities.set(productId, combinedQuantity);
      totalItems += 1;
    }
  }
  if (totalItems === 0 || totalItems > 50 || groups.some((group) => group.quantities.size === 0)) {
    return res.status(400).json({ message: "Your cart must contain 1 to 50 items." });
  }

  if (marketplacePaymentsEnabled()) {
    try {
      const checkout = await createMarketplaceCheckout(req, groups, { customerPhone, deliveryNote, deliveryMethod, deliveryAddress });
      return res.status(201).json({
        message: "Your secure payment is ready. Complete it on Paystack to send your order to the vendor.",
        ...checkout,
      });
    } catch (error) {
      console.error("Could not prepare marketplace checkout:", error.message);
      return res.status(error.status || 502).json({ message: error.status ? error.message : "Could not prepare secure checkout. Please try again." });
    }
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
           (student_id, vendor_id, customer_phone, delivery_note, delivery_method, delivery_address,
            item_subtotal, delivery_fee, total_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, vendor_id, status, created_at, delivery_method,
                   item_subtotal, delivery_fee, total_amount`,
        [req.user.id, group.vendorId, customerPhone || null, deliveryNote || null,
          deliveryMethod, deliveryAddress || null, itemSubtotal, deliveryFee, totalAmount]
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

router.post("/orders/payments/verify", requireAuth, requireStudent, async (req, res) => {
  const reference = typeof req.body?.reference === "string" ? req.body.reference.trim() : "";
  if (!/^CBM-\d+-[a-f\d]{32}$/i.test(reference)) {
    return res.status(400).json({ message: "Payment reference is missing or invalid." });
  }
  try {
    const pending = await pool.query(
      `SELECT reference FROM marketplace_payments
       WHERE reference = $1 AND student_id = $2`, [reference, req.user.id]
    );
    if (!pending.rowCount) return res.status(404).json({ message: "This payment was not found in your account." });
    const transaction = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`, { method: "GET" });
    if (transaction.status !== "success") {
      return res.status(409).json({ paid: false, message: "Paystack has not confirmed this payment. If you cancelled, your cart is still saved; you can try again." });
    }
    const finalized = await finalizeMarketplacePayment({
      reference: transaction.reference,
      amount: transaction.amount,
      currency: transaction.currency,
      domain: transaction.domain,
      transactionId: transaction.id,
    });
    if (!finalized.found || !finalized.paid) {
      return res.status(409).json({ paid: false, message: "We could not match the payment to this order. Contact Campus Benefit support before paying again." });
    }
    if (!finalized.alreadyApplied) void notifyMarketplaceVendors(finalized.notifications);
    return res.json({ paid: true, message: "Payment confirmed. Your order has been sent to the vendor." });
  } catch (error) {
    console.error("Could not verify marketplace payment:", error.message);
    return res.status(error.status || 502).json({ message: "Could not check the payment yet. Your cart is saved; refresh My Orders in a moment." });
  }
});

router.get("/orders/mine", requireAuth, requireStudent, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.id, o.vendor_id, v.business_name, o.customer_phone, o.delivery_note,
              o.delivery_method, o.delivery_address, o.item_subtotal, o.delivery_fee, o.total_amount,
              o.status, o.payment_status,
              o.cancellation_reason, o.cancelled_by, o.created_at,
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
