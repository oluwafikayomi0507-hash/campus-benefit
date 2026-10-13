const welcome = document.querySelector("#vendor-welcome");
const productForm = document.querySelector("#product-form");
const productMessage = document.querySelector("#product-message");
const deliveryFeeForm = document.querySelector("#delivery-fee-form");
const deliveryFeeMessage = document.querySelector("#delivery-fee-message");
const productsContainer = document.querySelector("#vendor-products");
const ordersContainer = document.querySelector("#vendor-orders");
const listingForm = document.querySelector("#listing-form");
const listingMessage = document.querySelector("#listing-message");
const listingPackageSelect = document.querySelector("#listing-package");
const listingsContainer = document.querySelector("#vendor-listings");
let currentVendor = null;

async function vendorFetch(url, options = {}) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (response.status === 401) {
    localStorage.removeItem("vendorToken");
    localStorage.removeItem("vendor");
    window.location.replace("vendor-login.html");
    throw new Error("Please sign in again.");
  }
  if (!response.ok) throw new Error(result.message || "Request failed.");
  return result;
}

function showEmpty(container, text) {
  container.textContent = text;
}

async function loadProducts() {
  const mine = await vendorFetch("/api/vendor/products");
  productsContainer.replaceChildren();
  if (!mine.length) return showEmpty(productsContainer, "You have not added any products yet.");

  for (const product of mine) {
    const card = document.createElement("article");
    card.className = "dashboard-item";
    const name = document.createElement("h3");
    name.textContent = `${product.product_name}${product.is_available ? "" : " · Hidden"}`;
    const price = document.createElement("p");
    price.textContent = `₦${Number(product.price).toLocaleString()}`;
    const category = document.createElement("p");
    category.textContent = `Section: ${product.category}`;
    card.append(name, category, price);
    if (product.description) {
      const description = document.createElement("p");
      description.textContent = product.description;
      card.appendChild(description);
    }
    const visibility = document.createElement("button");
    visibility.type = "button";
    visibility.className = "small-action";
    visibility.textContent = product.is_available ? "Hide product" : "Show product";
    visibility.addEventListener("click", async () => {
      visibility.disabled = true;
      try {
        await vendorFetch(`/api/vendor/products/${product.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isAvailable: !product.is_available }),
        });
        await loadProducts();
      } catch (error) {
        window.alert(error.message);
        visibility.disabled = false;
      }
    });
    card.appendChild(visibility);
    productsContainer.appendChild(card);
  }
}

function statusButton(label, status, orderId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "small-action";
  button.textContent = label;
  button.addEventListener("click", async () => {
    let cancellationReason = "";
    if (status === "cancelled") {
      const enteredReason = window.prompt("Why are you cancelling this order? A reason is required and will be saved with the order.");
      if (enteredReason === null) return;
      cancellationReason = enteredReason.trim();
      if (!cancellationReason) {
        window.alert("Enter a reason before cancelling this order.");
        return;
      }
    }
    button.disabled = true;
    try {
      await vendorFetch(`/api/vendor/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, cancellationReason }),
      });
      await loadOrders();
    } catch (error) {
      window.alert(error.message);
      button.disabled = false;
    }
  });
  return button;
}

async function loadOrders() {
  const orders = await vendorFetch("/api/vendor/orders");
  ordersContainer.replaceChildren();
  if (!orders.length) return showEmpty(ordersContainer, "New orders will appear here.");

  for (const order of orders) {
    const card = document.createElement("article");
    card.className = "dashboard-item";
    const heading = document.createElement("h3");
    heading.textContent = `Order #${order.id} · ${order.status}`;
    const student = document.createElement("p");
    student.textContent = `From: ${order.student_name} (${order.student_email})`;
    card.append(heading, student);
    const total = document.createElement("p");
    total.textContent = `Total: ₦${Number(order.total_amount).toLocaleString()} · ${order.delivery_method}`;
    card.appendChild(total);
    const payment = document.createElement("p");
    payment.textContent = order.payment_status === "paid"
      ? "Payment: paid through Paystack"
      : "Payment: arrange directly with the customer";
    card.appendChild(payment);
    if (order.customer_phone) {
      const phone = document.createElement("p");
      phone.textContent = `Phone: ${order.customer_phone}`;
      card.appendChild(phone);
    }
    for (const item of order.items) {
      const line = document.createElement("p");
      line.textContent = `${item.quantity} × ${item.productName} — ₦${Number(item.unitPrice).toLocaleString()}`;
      card.appendChild(line);
    }
    if (order.delivery_note) {
      const note = document.createElement("p");
      note.textContent = `Note: ${order.delivery_note}`;
      card.appendChild(note);
    }
    if (order.cancellation_reason) {
      const reason = document.createElement("p");
      reason.textContent = `${order.cancelled_by === "student" ? "Student" : "Vendor"} cancellation reason: ${order.cancellation_reason}`;
      card.appendChild(reason);
    }
    const actions = document.createElement("div");
    actions.className = "order-actions";
    const nextActions = {
      pending: [["Accept", "accepted"], ["Cancel", "cancelled"]],
      accepted: [["Preparing", "preparing"], ["Cancel", "cancelled"]],
      preparing: [["Ready", "ready"], ["Cancel", "cancelled"]],
      ready: [["Complete", "completed"], ["Cancel", "cancelled"]],
    };
    for (const [label, nextStatus] of nextActions[order.status] || []) {
      if (order.payment_status === "paid" && nextStatus === "cancelled") continue;
      actions.appendChild(statusButton(label, nextStatus, order.id));
    }
    if (order.payment_status === "paid" && order.status !== "completed" && order.status !== "cancelled") {
      const note = document.createElement("p");
      note.textContent = "For a paid order that cannot be fulfilled, contact Campus Benefit support to review a refund.";
      card.appendChild(note);
    }
    card.appendChild(actions);
    ordersContainer.appendChild(card);
  }
}

async function loadListingPackages() {
  if (!listingPackageSelect) return;
  const result = await vendorFetch("/api/vendor/listing-packages");
  listingPackageSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a listing package";
  listingPackageSelect.appendChild(placeholder);
  for (const item of result.packages) {
    const option = document.createElement("option");
    option.value = item.package_code;
    option.textContent = `₦${Number(item.price_naira).toLocaleString()} · ${item.duration_days} days`;
    listingPackageSelect.appendChild(option);
  }
}

async function loadPayoutSetup() {
  const panel = document.createElement("section");
  panel.className = "dashboard-panel";
  const heading = document.createElement("h2");
  heading.textContent = "Bank account for customer orders";
  const help = document.createElement("p");
  help.textContent = "Paystack sends your share directly to this account. Your bank number is sent securely to Paystack and is not saved by Campus Benefit. Connect one account to receive online order payments.";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  panel.append(heading, help, status);
  const anchor = document.querySelector(".dashboard-welcome");
  anchor?.after(panel);
  try {
    const [payoutResult, bankResult] = await Promise.all([
      vendorFetch("/api/vendor/payout"),
      vendorFetch("/api/vendor/payout/banks"),
    ]);
    if (payoutResult.payout.payout_ready) {
      const detail = document.createElement("p");
      detail.textContent = `Connected: ${payoutResult.payout.payout_account_name} · ${payoutResult.payout.payout_bank_name} ending ${payoutResult.payout.payout_account_last4} (${payoutResult.payout.payout_mode} mode)`;
      status.textContent = "Payout account ready.";
      panel.appendChild(detail);
      return;
    }
    const form = document.createElement("form");
    form.className = "product-form";
    const bankLabel = document.createElement("label"); bankLabel.textContent = "Bank";
    const bank = document.createElement("select"); bank.required = true;
    const placeholder = document.createElement("option"); placeholder.value = ""; placeholder.textContent = "Choose your bank"; bank.appendChild(placeholder);
    for (const item of bankResult.banks) {
      const option = document.createElement("option"); option.value = item.code; option.textContent = item.name; bank.appendChild(option);
    }
    const accountLabel = document.createElement("label"); accountLabel.textContent = "10-digit account number";
    const account = document.createElement("input"); account.inputMode = "numeric"; account.autocomplete = "off"; account.maxLength = 10; account.pattern = "[0-9]{10}"; account.required = true;
    const confirmWrap = document.createElement("label");
    const confirm = document.createElement("input"); confirm.type = "checkbox"; confirm.disabled = true;
    confirmWrap.append(confirm, document.createTextNode(" I confirm this is my bank account and the name shown is correct."));
    const preview = document.createElement("p");
    const submit = document.createElement("button"); submit.type = "submit"; submit.textContent = "Check bank details";
    form.append(bankLabel, bank, accountLabel, account, confirmWrap, preview, submit);
    panel.appendChild(form);
    let verifiedName = "";
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); submit.disabled = true;
      try {
        const payload = { bankCode: bank.value, accountNumber: account.value.trim() };
        if (!verifiedName) {
          const result = await vendorFetch("/api/vendor/payout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          verifiedName = result.accountName;
          preview.textContent = `Paystack found: ${result.accountName} · ${result.bankName}. Confirm the name and bank belong to you before connecting.`;
          confirm.disabled = false;
          submit.textContent = "Connect payout account";
        } else {
          if (!confirm.checked) throw new Error("Please confirm the account name belongs to you.");
          const result = await vendorFetch("/api/vendor/payout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, confirmedAccountName: verifiedName }) });
          status.textContent = "Payout account connected.";
          const detail = document.createElement("p");
          detail.textContent = `Connected: ${result.payout.payout_account_name} · ${result.payout.payout_bank_name} ending ${result.payout.payout_account_last4} (${result.payout.payout_mode} mode)`;
          form.replaceWith(detail);
          help.textContent = "Online order payments can be sent directly to this account.";
        }
      } catch (error) {
        status.textContent = error.message;
      } finally { submit.disabled = false; }
    });
  } catch (error) {
    status.textContent = error.message || "Payout setup is not available yet. Please try again later.";
  }
}

function checkoutButton(listing) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "small-action";
  button.textContent = "Pay and publish";
  button.addEventListener("click", async () => {
    listingMessage.textContent = "Preparing secure checkout...";
    button.disabled = true;
    button.textContent = "Connecting to Paystack...";
    try {
      const result = await vendorFetch(`/api/vendor/listings/${listing.id}/checkout`, { method: "POST" });
      if (!result.authorizationUrl) {
        throw new Error(result.message || "Paystack did not return a checkout link.");
      }
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      listingMessage.textContent = error.message;
      button.disabled = false;
      button.textContent = "Pay and publish";
    }
  });
  return button;
}

async function loadFeaturedListings() {
  const result = await vendorFetch("/api/vendor/listings");
  listingsContainer.replaceChildren();
  if (!result.listings.length) {
    return showEmpty(listingsContainer, "Your submitted featured listings will appear here.");
  }

  for (const listing of result.listings) {
    const card = document.createElement("article");
    card.className = "dashboard-item";
    const title = document.createElement("h3");
    title.textContent = listing.title;
    const category = document.createElement("p");
    category.textContent = `Category: ${listing.category}`;
    const status = document.createElement("p");
    if (listing.payment_status === "paid" && listing.is_active) {
      const expiry = listing.expires_at ? new Date(listing.expires_at).toLocaleDateString() : "—";
      status.textContent = `Active · ${listing.package_name || "Listing"} · ends ${expiry}`;
    } else {
      status.textContent = `Not published · ${listing.latest_payment_status === "failed" ? "last payment did not complete" : "payment required"}`;
    }
    card.append(title, category, status);
    if (listing.description) {
      const description = document.createElement("p");
      description.textContent = listing.description;
      card.appendChild(description);
    }
    if (!(listing.payment_status === "paid" && listing.is_active)) {
      card.appendChild(checkoutButton(listing));
    }
    listingsContainer.appendChild(card);
  }
}

listingForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  listingMessage.textContent = "Saving your listing...";
  const submit = document.querySelector("#listing-submit");
  submit.disabled = true;
  try {
    const result = await vendorFetch("/api/vendor/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: document.querySelector("#listing-title").value.trim(),
        category: document.querySelector("#listing-category").value,
        description: document.querySelector("#listing-description").value.trim(),
        price: document.querySelector("#listing-price").value,
        discount: document.querySelector("#listing-discount").value.trim(),
        imageUrl: document.querySelector("#listing-image").value.trim(),
        offerUrl: document.querySelector("#listing-offer-url").value.trim(),
        packageCode: listingPackageSelect.value,
      }),
    });
    if (result.authorizationUrl) {
      window.location.assign(result.authorizationUrl);
      return;
    }
    listingForm.reset();
    listingMessage.textContent = result.message;
    await loadFeaturedListings();
  } catch (error) {
    listingMessage.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

productForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  productMessage.textContent = "Saving product...";
  try {
    await vendorFetch("/api/vendor/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productName: document.querySelector("#product-name").value.trim(),
        category: document.querySelector("#product-category").value,
        price: document.querySelector("#product-price").value,
        description: document.querySelector("#product-description").value.trim(),
        imageUrl: document.querySelector("#product-image").value.trim(),
      }),
    });
    productForm.reset();
    productMessage.textContent = "Product added.";
    await loadProducts();
  } catch (error) {
    productMessage.textContent = error.message;
  }
});

deliveryFeeForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  deliveryFeeMessage.textContent = "Saving delivery fee...";
  try {
    const result = await vendorFetch("/api/vendor/delivery-fee", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryFee: document.querySelector("#vendor-delivery-fee").value }),
    });
    deliveryFeeMessage.textContent = `Delivery fee saved: ₦${Number(result.deliveryFee).toLocaleString()}`;
  } catch (error) {
    deliveryFeeMessage.textContent = error.message;
  }
});
document.querySelector("#vendor-logout")?.addEventListener("click", async () => {
  try { await fetch("/api/vendor/auth/logout", { method: "POST" }); } catch {}
  localStorage.removeItem("vendorToken");
  localStorage.removeItem("vendor");
  window.location.replace("vendor-login.html");
});

(async function startDashboard() {
  try {
    const result = await vendorFetch("/api/vendor/me");
    currentVendor = result.vendor;
    welcome.textContent = `Welcome, ${currentVendor.business_name}`;
    document.querySelector("#vendor-delivery-fee").value = Number(currentVendor.delivery_fee || 0);
    await verifyListingPaymentFromReturn();
    await Promise.all([loadProducts(), loadOrders(), loadListingPackages(), loadFeaturedListings(), loadPayoutSetup()]);
  } catch (error) {
    showEmpty(ordersContainer, error.message);
  }
})();

// Keep the vendor's inbox current while the dashboard is open.
window.setInterval(() => {
  if (!document.hidden) {
    loadOrders().catch((error) => console.error("Could not refresh vendor orders:", error));
  }
}, 60000);

async function verifyListingPaymentFromReturn() {
  const url = new URL(window.location.href);
  const reference = url.searchParams.get("reference");
  if (!reference || url.searchParams.get("listing_payment") !== "1") return;
  listingMessage.textContent = "Checking your payment with Paystack...";
  try {
    const result = await vendorFetch("/api/vendor/listings/payments/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference }),
    });
    listingMessage.textContent = result.message;
  } catch (error) {
    listingMessage.textContent = error.message;
  } finally {
    url.searchParams.delete("reference");
    url.searchParams.delete("listing_payment");
    window.history.replaceState({}, "", url);
  }
}

