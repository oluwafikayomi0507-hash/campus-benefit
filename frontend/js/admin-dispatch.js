const dispatchStatus = document.querySelector("#dispatch-admin-status");
const quoteRequests = document.querySelector("#dispatch-quote-requests");
const activeDispatchJobs = document.querySelector("#dispatch-active-jobs");

async function dispatchAdminRequest(url, options = {}) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (response.status === 401) {
    window.location.replace("login.html");
    throw new Error("Please log in again.");
  }
  if (!response.ok) throw new Error(result.message || "Request failed.");
  return result;
}

function dispatchLine(label, value) {
  const line = document.createElement("p");
  line.textContent = `${label}: ${value || "—"}`;
  return line;
}

async function saveDispatchFee(quote, input, button) {
  const fee = Number(input.value);
  if (!Number.isFinite(fee) || fee < 0) {
    dispatchStatus.textContent = "Enter a valid dispatch fee.";
    return;
  }
  button.disabled = true;
  try {
    const result = await dispatchAdminRequest(`/api/admin/dispatch/quotes/${quote.id}/fee`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fee }),
    });
    dispatchStatus.textContent = result.message;
    await loadDispatch();
  } catch (error) {
    dispatchStatus.textContent = error.message;
    button.disabled = false;
  }
}

function renderQuoteRequests(quotes) {
  quoteRequests.replaceChildren();
  if (!quotes.length) {
    quoteRequests.textContent = "No delivery quotes are waiting.";
    return;
  }
  for (const quote of quotes) {
    const card = document.createElement("article");
    card.className = "admin-application-card";
    const heading = document.createElement("h3");
    heading.textContent = `Quote #${quote.id} · ${quote.business_name}`;
    card.appendChild(heading);
    card.appendChild(dispatchLine("Student", `${quote.student_name} · ${quote.customer_phone}`));
    card.appendChild(dispatchLine("Delivery address", quote.delivery_address));
    card.appendChild(dispatchLine("Vendor location", quote.vendor_location));
    if (quote.delivery_note) card.appendChild(dispatchLine("Instructions", quote.delivery_note));
    for (const item of quote.items || []) {
      card.appendChild(dispatchLine("Item", `${item.quantity} × ${item.productName}`));
    }
    const feeLabel = document.createElement("label");
    feeLabel.textContent = "Distance-based dispatch fee (₦)";
    const feeInput = document.createElement("input");
    feeInput.type = "number";
    feeInput.min = "0";
    feeInput.max = "100000";
    feeInput.step = "1";
    feeInput.required = true;
    feeInput.value = quote.quoted_fee ?? "";
    feeLabel.appendChild(feeInput);
    const send = document.createElement("button");
    send.type = "button";
    send.className = "admin-secondary";
    send.textContent = quote.quoted_fee === null ? "Send fee to student" : "Update fee";
    send.addEventListener("click", () => saveDispatchFee(quote, feeInput, send));
    card.append(feeLabel, send);
    quoteRequests.appendChild(card);
  }
}

async function updateDispatchStatus(job, status, details = {}) {
  dispatchStatus.textContent = "Updating dispatch...";
  try {
    const result = await dispatchAdminRequest(`/api/admin/dispatch/${job.quote_id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...details }),
    });
    dispatchStatus.textContent = result.message;
    await loadDispatch();
  } catch (error) {
    dispatchStatus.textContent = error.message;
  }
}

function renderActiveDispatch(jobs) {
  activeDispatchJobs.replaceChildren();
  if (!jobs.length) {
    activeDispatchJobs.textContent = "No paid orders are ready for dispatch.";
    return;
  }
  for (const job of jobs) {
    const card = document.createElement("article");
    card.className = "admin-application-card";
    const heading = document.createElement("h3");
    heading.textContent = `Order #${job.order_id} · ${job.dispatch_status.replaceAll("_", " ")}`;
    card.appendChild(heading);
    card.appendChild(dispatchLine("Vendor", job.business_name));
    card.appendChild(dispatchLine("Student", job.student_name));
    card.appendChild(dispatchLine("Address", job.delivery_address));
    card.appendChild(dispatchLine("Customer phone", job.customer_phone));
    card.appendChild(dispatchLine("Fee paid", `₦${Number(job.quoted_fee).toLocaleString()}`));
    for (const item of job.items || []) card.appendChild(dispatchLine("Item", `${item.quantity} × ${item.productName}`));
    if (job.dispatch_status === "paid") {
      const name = document.createElement("input");
      name.placeholder = "Rider name";
      name.maxLength = 160;
      name.required = true;
      const phone = document.createElement("input");
      phone.placeholder = "Rider phone";
      phone.maxLength = 30;
      phone.required = true;
      const assign = document.createElement("button");
      assign.type = "button";
      assign.className = "admin-secondary";
      assign.textContent = "Assign rider";
      assign.addEventListener("click", () => {
        if (!name.value.trim() || !phone.value.trim()) {
          dispatchStatus.textContent = "Enter the rider’s name and phone number.";
          return;
        }
        void updateDispatchStatus(job, "assigned", { riderName: name.value.trim(), riderPhone: phone.value.trim() });
      });
      card.append(name, phone, assign);
    } else if (job.dispatch_status === "assigned") {
      card.appendChild(dispatchLine("Rider", `${job.rider_name} · ${job.rider_phone}`));
      const pickedUp = document.createElement("button");
      pickedUp.type = "button";
      pickedUp.className = "admin-secondary";
      pickedUp.textContent = "Mark picked up";
      pickedUp.addEventListener("click", () => updateDispatchStatus(job, "picked_up"));
      card.appendChild(pickedUp);
    } else if (job.dispatch_status === "picked_up") {
      card.appendChild(dispatchLine("Rider", `${job.rider_name} · ${job.rider_phone}`));
      const delivered = document.createElement("button");
      delivered.type = "button";
      delivered.className = "admin-secondary";
      delivered.textContent = "Mark delivered";
      delivered.addEventListener("click", () => updateDispatchStatus(job, "delivered"));
      card.appendChild(delivered);
    }
    activeDispatchJobs.appendChild(card);
  }
}

async function loadDispatch() {
  try {
    const [quotes, jobs] = await Promise.all([
      dispatchAdminRequest("/api/admin/dispatch/quotes"),
      dispatchAdminRequest("/api/admin/dispatch/active"),
    ]);
    renderQuoteRequests(quotes);
    renderActiveDispatch(jobs);
  } catch (error) {
    dispatchStatus.textContent = error.message;
  }
}

document.querySelector("#refresh-dispatch")?.addEventListener("click", loadDispatch);
loadDispatch();
