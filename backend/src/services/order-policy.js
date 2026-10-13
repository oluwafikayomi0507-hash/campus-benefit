function studentCancellationConflict(order) {
  if (order.payment_status === "paid") {
    return "This order has been paid. Contact Campus Benefit support to review cancellation and refund options.";
  }
  if (order.payment_status !== "not_required") {
    return "This order's payment is still being checked. Refresh My Orders before trying to cancel.";
  }
  if (!["pending", "accepted"].includes(order.status)) {
    return "You can cancel an order only while it is pending or accepted, before preparation begins.";
  }
  return null;
}

module.exports = { studentCancellationConflict };
