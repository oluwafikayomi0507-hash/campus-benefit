const express = require("express");
const crypto = require("crypto");
const { getSecretKey, finalizeListingPayment } = require("../services/paystack.service");

const router = express.Router();

router.post("/paystack/webhook", async (req, res) => {
  const secret = getSecretKey();
  const signature = req.get("x-paystack-signature") || "";
  const rawBody = req.rawBody;
  if (!secret || !Buffer.isBuffer(rawBody) || !/^[a-f\d]{128}$/i.test(signature)) {
    return res.sendStatus(401);
  }

  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return res.sendStatus(401);
  }

  const event = req.body;
  if (event?.event !== "charge.success" || event?.data?.status !== "success") {
    return res.sendStatus(200);
  }

  try {
    const result = await finalizeListingPayment({
      reference: event.data.reference,
      amount: event.data.amount,
      currency: event.data.currency,
      domain: event.data.domain,
      transactionId: event.data.id,
    });
    if (!result.found) {
      console.warn("Paystack success event did not match a Campus Benefit listing payment.");
    } else if (!result.paid) {
      console.error("Paystack listing payment did not match the expected amount or currency.");
    }
    return res.sendStatus(200);
  } catch (error) {
    console.error("Could not apply Paystack listing event:", error.message);
    return res.sendStatus(500);
  }
});

module.exports = router;
