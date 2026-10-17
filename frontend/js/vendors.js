const productsGrid = document.querySelector("#vendor-products-grid");
const productsMessage = document.querySelector("#products-message");
const cartItemsElement = document.querySelector("#cart-items");
const cartSubtotalElement = document.querySelector("#cart-subtotal");
const cartDeliveryElement = document.querySelector("#cart-delivery-fee");
const cartTotalElement = document.querySelector("#cart-total");
const cartCountElement = document.querySelector("#cart-count");
const cartTrigger = document.querySelector("#open-cart");
const cartBackdrop = document.querySelector("#cart-backdrop");
const cartShortcutCountElement = document.querySelector("#cart-shortcut-count");
const cartPanelElement = document.querySelector("#order-cart");
const checkoutMessage = document.querySelector("#checkout-message");
const checkoutButton = document.querySelector("#place-order");
const deliveryMethodSelect = document.querySelector("#delivery-method");
const studentOrdersElement = document.querySelector("#student-orders");
const closedOrderRetentionMs = 5 * 60 * 1000;
let closedOrderRefreshTimer;
const cartStorageKey = "campusBenefitCart";
const categoryNames = {
  food: "Food & drinks",
  beauty: "Beauty & grooming",
  fashion: "Fashion & accessories",
  tech: "Tech & gadgets",
  printing: "Printing",
  creative: "Creative services",
  services: "Other services",
};
const selectedCategory = new URLSearchParams(window.location.search).get("category")?.trim().toLowerCase() || "";

function readCart() {
  try {
    const value = JSON.parse(localStorage.getItem(cartStorageKey) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

let cart = readCart();

function openCart() {
  cartPanelElement.hidden = false;
  cartBackdrop.hidden = false;
  cartTrigger.setAttribute("aria-expanded", "true");
  document.body.classList.add("cart-open");
  document.querySelector("#close-cart").focus();
}

function closeCart() {
  cartPanelElement.hidden = true;
  cartBackdrop.hidden = true;
  cartTrigger.setAttribute("aria-expanded", "false");
  document.body.classList.remove("cart-open");
  cartTrigger.focus();
}

cartTrigger.addEventListener("click", openCart);
document.querySelector("#close-cart").addEventListener("click", closeCart);
cartBackdrop.addEventListener("click", closeCart);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !cartPanelElement.hidden) closeCart();
});

function saveCart() {
  localStorage.setItem(cartStorageKey, JSON.stringify(cart));
  renderCart();
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (response.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.replace("login.html");
    throw new Error("Please log in again.");
  }
  if (!response.ok) throw new Error(result.message || "Request failed.");
  return result;
}

function money(value) {
  return `₦${Number(value || 0).toLocaleString()}`;
}

function renderProducts(products) {
  const deliveryFees = new Map(products.map((product) => [Number(product.vendor_id), Number(product.delivery_fee || 0)]));
  cart = cart.map((item) => ({
    ...item,
    deliveryFee: deliveryFees.has(Number(item.vendorId))
      ? deliveryFees.get(Number(item.vendorId))
      : Number(item.deliveryFee || 0),
  }));
  localStorage.setItem(cartStorageKey, JSON.stringify(cart));
  renderCart();
  productsGrid.replaceChildren();
  if (!products.length) {
    productsMessage.textContent = "No products are listed yet. Vendors need approval and must add products before they appear here.";
    return;
  }
  productsMessage.textContent = "";

  for (const product of products) {
    const card = document.createElement("article");
    card.className = "vendor-product-card";
    if (product.image_url) {
      const image = document.createElement("img");
      image.src = product.image_url;
      image.alt = product.product_name;
      image.loading = "lazy";
      card.appendChild(image);
    }
    const content = document.createElement("div");
    content.className = "vendor-product-content";
    const name = document.createElement("h3");
    name.textContent = product.product_name;
    const vendor = document.createElement("p");
    vendor.className = "vendor-product-vendor";
    vendor.textContent = product.business_name;
    const vendorLocation = document.createElement("p");
    vendorLocation.className = "vendor-product-location";
    vendorLocation.textContent = [product.university, product.location].filter(Boolean).join(" · ");
    const category = document.createElement("p");
    category.className = "vendor-product-category";
    category.textContent = categoryNames[product.category] || "Marketplace";
    const price = document.createElement("p");
    price.className = "vendor-product-price";
    price.textContent = money(product.price);
    const delivery = document.createElement("p");
    delivery.className = "vendor-product-description";
    delivery.textContent = `Delivery: ${money(product.delivery_fee)} per order · Pickup is free`;
    content.append(name, category, vendor);
    if (vendorLocation.textContent) content.appendChild(vendorLocation);
    if (product.description) {
      const description = document.createElement("p");
      description.className = "vendor-product-description";
      description.textContent = product.description;
      content.appendChild(description);
    }
    content.append(price, delivery);
    const actions = document.createElement("div");
    actions.className = "product-card-actions";
    const addedFeedback = document.createElement("span");
    addedFeedback.className = "added-feedback";
    addedFeedback.setAttribute("role", "status");
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "add-cart-icon";
    addButton.setAttribute("aria-label", `Add ${product.product_name} to cart`);
    addButton.title = "Add to cart";
    addButton.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.5L21 8H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>';
    addButton.addEventListener("click", () => {
      const existing = cart.find((item) => Number(item.productId) === Number(product.id));
      if (existing) existing.quantity += 1;
      else cart.push({
        productId: Number(product.id),
        vendorId: Number(product.vendor_id),
        productName: product.product_name,
        vendorName: product.business_name,
        price: Number(product.price),
        deliveryFee: Number(product.delivery_fee || 0),
        description: product.description || "",
        imageUrl: product.image_url || "",
        quantity: 1,
      });
      saveCart();
      addedFeedback.textContent = "Added to cart";
      window.setTimeout(() => { addedFeedback.textContent = ""; }, 2200);
    });
    actions.append(addedFeedback, addButton);
    content.appendChild(actions);
    card.appendChild(content);
    productsGrid.appendChild(card);
  }
}

function renderCart() {
  cartItemsElement.replaceChildren();
  let totalQuantity = 0;
  let itemSubtotal = 0;
  const vendorFees = new Map();

  cart.forEach((item, index) => {
    totalQuantity += item.quantity;
    itemSubtotal += item.price * item.quantity;
    vendorFees.set(Number(item.vendorId), Number(item.deliveryFee || 0));

    const line = document.createElement("div");
    line.className = "cart-line";
    const details = document.createElement("div");
    details.className = "cart-line-details";
    if (item.imageUrl) {
      const image = document.createElement("img");
      image.className = "cart-line-image";
      image.src = item.imageUrl;
      image.alt = item.productName;
      image.loading = "lazy";
      details.appendChild(image);
    }
    const text = document.createElement("div");
    const name = document.createElement("span");
    name.className = "cart-line-name";
    name.textContent = item.productName;
    text.appendChild(name);
    const vendor = document.createElement("span");
    vendor.className = "cart-line-vendor";
    vendor.textContent = item.vendorName;
    text.appendChild(vendor);
    if (item.description) {
      const description = document.createElement("p");
      description.className = "cart-line-description";
      description.textContent = item.description;
      text.appendChild(description);
    }
    details.appendChild(text);
    const lineTotal = document.createElement("span");
    lineTotal.className = "cart-line-price";
    lineTotal.textContent = money(item.price * item.quantity);
    const controls = document.createElement("div");
    controls.className = "cart-line-controls";
    const minus = document.createElement("button");
    minus.type = "button";
    minus.textContent = "−";
    minus.setAttribute("aria-label", `Remove one ${item.productName}`);
    minus.addEventListener("click", () => {
      if (cart[index].quantity > 1) cart[index].quantity -= 1;
      else cart.splice(index, 1);
      saveCart();
    });
    const quantity = document.createElement("span");
    quantity.textContent = String(item.quantity);
    const plus = document.createElement("button");
    plus.type = "button";
    plus.textContent = "+";
    plus.setAttribute("aria-label", `Add one ${item.productName}`);
    plus.addEventListener("click", () => {
      cart[index].quantity += 1;
      saveCart();
    });
    controls.append(minus, quantity, plus);
    line.append(details, lineTotal, controls);
    cartItemsElement.appendChild(line);
  });

  if (!cart.length) {
    const empty = document.createElement("p");
    empty.className = "vendors-message";
    empty.textContent = "Your cart is empty.";
    cartItemsElement.appendChild(empty);
  }
  const deliveryTotal = deliveryMethodSelect.value === "pickup"
    ? 0
    : Array.from(vendorFees.values()).reduce((sum, fee) => sum + fee, 0);
  cartCountElement.textContent = String(totalQuantity);
  if (cartShortcutCountElement) cartShortcutCountElement.textContent = String(totalQuantity);
  cartTrigger.setAttribute("aria-label", `Open shopping cart, ${totalQuantity} ${totalQuantity === 1 ? "item" : "items"}`);
  cartSubtotalElement.textContent = money(itemSubtotal);
  cartDeliveryElement.textContent = money(deliveryTotal);
  cartTotalElement.textContent = money(itemSubtotal + deliveryTotal);
  checkoutButton.disabled = cart.length === 0;
}

async function loadProducts() {
  try {
    if (selectedCategory && categoryNames[selectedCategory]) {
      document.querySelector("#vendors-page-title").textContent = `${categoryNames[selectedCategory]} from campus vendors`;
    }
    const query = selectedCategory ? `?category=${encodeURIComponent(selectedCategory)}` : "";
    const products = await apiRequest(`/api/products${query}`);
    renderProducts(products);
  } catch (error) {
    productsMessage.textContent = error.message;
  }
}

async function loadStudentOrders() {
  try {
    const orders = await apiRequest("/api/orders/mine");
    const now = Date.now();
    window.clearTimeout(closedOrderRefreshTimer);
    const visibleOrders = orders.filter((order) => {
      if (!["cancelled", "completed"].includes(order.status)) return true;
      const updatedAt = Date.parse(order.updated_at || order.created_at);
      return !Number.isFinite(updatedAt) || now - updatedAt < closedOrderRetentionMs;
    });
    const nextClosedOrderExpiry = orders
      .filter((order) => ["cancelled", "completed"].includes(order.status))
      .map((order) => Date.parse(order.updated_at || order.created_at) + closedOrderRetentionMs)
      .filter((expiry) => Number.isFinite(expiry) && expiry > now)
      .sort((a, b) => a - b)[0];
    if (nextClosedOrderExpiry) {
      closedOrderRefreshTimer = window.setTimeout(loadStudentOrders, nextClosedOrderExpiry - now);
    }
    studentOrdersElement.replaceChildren();
    if (!visibleOrders.length) {
      studentOrdersElement.textContent = orders.length
        ? "No current orders. Cancelled and delivered orders clear from this list after five minutes."
        : "Your placed orders will appear here.";
    } else {
      for (const order of visibleOrders) {
      const card = document.createElement("article");
      card.className = "student-order-card";
      const heading = document.createElement("h3");
      heading.textContent = `Order #${order.id} · ${order.business_name} · ${order.status}`;
      card.appendChild(heading);
      if (order.cancellation_reason) {
        const reason = document.createElement("p");
        reason.textContent = `${order.cancelled_by === "student" ? "Your" : "Vendor"} cancellation reason: ${order.cancellation_reason}`;
        card.appendChild(reason);
      }
      for (const item of order.items) {
        const line = document.createElement("p");
        line.textContent = `${item.quantity} × ${item.productName} — ${money(item.unitPrice)}`;
        card.appendChild(line);
      }
      const payment = document.createElement("p");
      payment.textContent = order.payment_status === "paid"
        ? "Payment: confirmed by Paystack"
        : "Payment: arrange directly with the vendor";
      card.appendChild(payment);
      const method = document.createElement("p");
      method.textContent = `Method: ${order.delivery_method}`;
      const total = document.createElement("p");
      total.textContent = `Items ${money(order.item_subtotal)} + delivery ${money(order.delivery_fee)} = ${money(order.total_amount)}`;
      card.append(method, total);
      if (["pending", "accepted"].includes(order.status) && order.payment_status === "not_required") {
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "refresh-button";
        cancel.textContent = "Cancel order";
        cancel.addEventListener("click", async () => {
          if (card.querySelector(".order-cancel-form")) return;
          cancel.hidden = true;
          const cancelForm = document.createElement("form");
          cancelForm.className = "order-cancel-form";
          const reasonLabel = document.createElement("label");
          reasonLabel.textContent = "Why do you need to cancel?";
          const reasonInput = document.createElement("textarea");
          reasonInput.required = true;
          reasonInput.maxLength = 1000;
          reasonInput.rows = 3;
          reasonInput.placeholder = "Enter a reason for the vendor";
          const cancelError = document.createElement("p");
          cancelError.className = "vendors-message";
          cancelError.setAttribute("role", "status");
          const confirmCancel = document.createElement("button");
          confirmCancel.type = "submit";
          confirmCancel.className = "refresh-button";
          confirmCancel.textContent = "Confirm cancellation";
          const keepOrder = document.createElement("button");
          keepOrder.type = "button";
          keepOrder.className = "refresh-button";
          keepOrder.textContent = "Keep order";
          keepOrder.addEventListener("click", () => {
            cancelForm.remove();
            cancel.hidden = false;
            cancel.focus();
          });
          reasonLabel.appendChild(reasonInput);
          cancelForm.append(reasonLabel, confirmCancel, keepOrder, cancelError);
          cancelForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const reason = reasonInput.value.trim();
            if (!reason) {
              reasonInput.setCustomValidity("Enter a reason before cancelling this order.");
              reasonInput.reportValidity();
              return;
            }
            reasonInput.setCustomValidity("");
            confirmCancel.disabled = true;
            keepOrder.disabled = true;
            cancelError.textContent = "Cancelling order...";
            try {
              await apiRequest(`/api/orders/${order.id}/cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason }),
              });
              await loadStudentOrders();
            } catch (error) {
              cancelError.textContent = error.message;
              confirmCancel.disabled = false;
              keepOrder.disabled = false;
            }
          });
          card.appendChild(cancelForm);
          reasonInput.focus();
        });
        card.appendChild(cancel);
      } else if (order.payment_status === "paid" && order.status !== "completed" && order.status !== "cancelled") {
        const note = document.createElement("p");
        note.textContent = "This order is paid. Contact Campus Benefit support to request cancellation and refund review.";
        card.appendChild(note);
      }
      studentOrdersElement.appendChild(card);
      }
    }
  } catch (error) {
    studentOrdersElement.textContent = error.message;
  }
}

 deliveryMethodSelect.addEventListener("change", renderCart);

document.querySelector("#checkout-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!cart.length) return;
  checkoutButton.disabled = true;
  checkoutMessage.textContent = "Sending your order...";
  const groupedOrders = new Map();
  for (const item of cart) {
    if (!groupedOrders.has(item.vendorId)) groupedOrders.set(item.vendorId, []);
    groupedOrders.get(item.vendorId).push({ productId: item.productId, quantity: item.quantity });
  }

  try {
    const result = await apiRequest("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orders: Array.from(groupedOrders, ([vendorId, items]) => ({ vendorId, items })),
        customerPhone: document.querySelector("#customer-phone").value.trim(),
        deliveryNote: document.querySelector("#delivery-note").value.trim(),
        deliveryMethod: deliveryMethodSelect.value,
      }),
    });
    if (result.authorizationUrl) {
      checkoutMessage.textContent = "Opening Paystack secure checkout…";
      window.location.assign(result.authorizationUrl);
      return;
    }
    const grandTotal = result.orders.reduce((sum, order) => sum + Number(order.total_amount), 0);
    cart = [];
    saveCart();
    document.querySelector("#delivery-note").value = "";
    checkoutMessage.textContent = `Order sent. Total: ${money(grandTotal)}. Check My Orders below for updates.`;
    await loadStudentOrders();
  } catch (error) {
    checkoutMessage.textContent = error.message;
    checkoutButton.disabled = cart.length === 0;
  }
});

document.querySelector("#refresh-orders")?.addEventListener("click", loadStudentOrders);
window.setInterval(() => {
  if (!document.hidden) void loadStudentOrders();
}, 30_000);

async function verifyMarketplacePaymentFromReturn() {
  const url = new URL(window.location.href);
  const reference = url.searchParams.get("reference");
  if (url.searchParams.get("order_payment") !== "1" || !reference) return;
  checkoutMessage.textContent = "Checking your payment securely…";
  try {
    const result = await apiRequest("/api/orders/payments/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference }),
    });
    if (result.paid) {
      cart = [];
      saveCart();
      document.querySelector("#delivery-note").value = "";
      checkoutMessage.textContent = result.message;
      await loadStudentOrders();
    } else {
      checkoutMessage.textContent = result.message;
    }
  } catch (error) {
    checkoutMessage.textContent = error.message;
  } finally {
    url.searchParams.delete("reference");
    url.searchParams.delete("trxref");
    url.searchParams.delete("order_payment");
    window.history.replaceState({}, "", url);
  }
}

renderCart();
loadProducts();
loadStudentOrders();
verifyMarketplacePaymentFromReturn();
