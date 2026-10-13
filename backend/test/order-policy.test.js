const test = require("node:test");
const assert = require("node:assert/strict");
const { studentCancellationConflict } = require("../src/services/order-policy");

test("student can cancel a pending unpaid order", () => {
  assert.equal(studentCancellationConflict({ status: "pending", payment_status: "not_required" }), null);
});

test("student can cancel an accepted unpaid order before preparation", () => {
  assert.equal(studentCancellationConflict({ status: "accepted", payment_status: "not_required" }), null);
});

test("student cannot cancel after preparation starts", () => {
  for (const status of ["preparing", "ready", "completed", "cancelled"]) {
    assert.match(studentCancellationConflict({ status, payment_status: "not_required" }), /before preparation begins/);
  }
});

test("student cannot cancel a paid order through the dashboard", () => {
  assert.match(studentCancellationConflict({ status: "accepted", payment_status: "paid" }), /order has been paid/);
});

test("student cannot cancel while payment is unresolved", () => {
  assert.match(studentCancellationConflict({ status: "pending", payment_status: "pending" }), /payment is still being checked/);
});
