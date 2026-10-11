const pool = require("../config/db");

const PAYSTACK_API = "https://api.paystack.co";

function getSecretKey() {
  return process.env.PAYSTACK_SECRET_KEY || "";
}

function getKeyMode() {
  const key = getSecretKey();
  if (key.startsWith("sk_test_")) return "test";
  if (key.startsWith("sk_live_")) return "live";
  return null;
}

async function paystackRequest(path, options = {}) {
  const secret = getSecretKey();
  if (!secret) {
    const error = new Error("Paystack is not connected yet. Your listing is saved as a draft and will stay hidden until payment is set up.");
    error.status = 503;
    throw error;
  }

  const response = await fetch(`${PAYSTACK_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });

  let result;
  try {
    result = await response.json();
  } catch {
    result = null;
  }
  if (!response.ok || !result?.status) {
    const error = new Error(result?.message || "Paystack could not process the request.");
    error.status = 502;
    throw error;
  }
  return result.data;
}

async function finalizeListingPayment({ reference, amount, currency, domain, transactionId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT p.id, p.vendor_id, p.deal_id, p.amount_kobo, p.payment_mode, p.status,
              d.package_code, lp.duration_days
       FROM deal_listing_payments p
       JOIN deals d ON d.id = p.deal_id AND d.vendor_id = p.vendor_id
       JOIN listing_packages lp ON lp.package_code = d.package_code
       WHERE p.reference = $1
       FOR UPDATE OF p, d`,
      [reference]
    );
    const payment = result.rows[0];
    if (!payment) {
      await client.query("ROLLBACK");
      return { found: false };
    }

    if (Number(payment.amount_kobo) !== Number(amount) || currency !== "NGN" || domain !== payment.payment_mode) {
      await client.query("ROLLBACK");
      return { found: true, paid: false, mismatch: true };
    }

    if (payment.status === "paid") {
      await client.query("COMMIT");
      return { found: true, paid: true, alreadyApplied: true, listingId: payment.deal_id };
    }

    await client.query(
      `UPDATE deal_listing_payments
       SET status = 'paid', paystack_transaction_id = $2, paid_at = NOW()
       WHERE id = $1`,
      [payment.id, String(transactionId)]
    );
    await client.query(
      `UPDATE deals
       SET payment_status = 'paid', is_active = TRUE, is_permanent = FALSE,
           expires_at = NOW() + ($1::integer * INTERVAL '1 day')
       WHERE id = $2 AND vendor_id = $3`,
      [payment.duration_days, payment.deal_id, payment.vendor_id]
    );
    await client.query("COMMIT");
    return { found: true, paid: true, listingId: payment.deal_id };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* Transaction may already be closed. */ }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { getSecretKey, getKeyMode, paystackRequest, finalizeListingPayment };
