const message = document.querySelector("#admin-message");
const applicationsElement = document.querySelector("#vendor-applications");
const supportMessagesElement = document.querySelector("#support-messages");
const supportAdminStatus = document.querySelector("#support-admin-status");

async function adminRequest(url, options = {}) {
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

function addText(card, label, value, className = "") {
  if (!value) return;
  const line = document.createElement("p");
  if (className) line.className = className;
  line.textContent = `${label}: ${value}`;
  card.appendChild(line);
}

async function reviewApplication(vendorId, decision, reviewNote = "") {
  const buttons = applicationsElement.querySelectorAll(`button[data-vendor-id="${vendorId}"]`);
  buttons.forEach((button) => { button.disabled = true; });
  try {
    await adminRequest(`/api/admin/vendors/${vendorId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reviewNote }),
    });
    await loadApplications();
  } catch (error) {
    message.textContent = error.message;
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function renderApplications(applications) {
  applicationsElement.replaceChildren();
  if (!applications.length) {
    applicationsElement.textContent = "No vendor applications are waiting for review.";
    return;
  }
  for (const application of applications) {
    const card = document.createElement("article");
    card.className = "admin-application-card";
    const title = document.createElement("h3");
    title.textContent = application.business_name;
    card.appendChild(title);
    addText(card, "Business type", application.business_type);
    addText(card, "Campus", application.university);
    addText(card, "Location", application.location);
    addText(card, "Email", application.email);
    addText(card, "Phone", application.phone_number);
    addText(card, "WhatsApp", application.whatsapp_number);
    addText(card, "Online presence", application.instagram_url);
    addText(card, "Description", application.description, "admin-description");
    addText(card, "Submitted", new Date(application.created_at).toLocaleString());

    const actions = document.createElement("div");
    actions.className = "admin-actions";
    const approve = document.createElement("button");
    approve.type = "button";
    approve.textContent = "Approve business";
    approve.dataset.vendorId = application.id;
    approve.addEventListener("click", () => reviewApplication(application.id, "approved"));
    const reject = document.createElement("button");
    reject.type = "button";
    reject.className = "reject-button";
    reject.textContent = "Reject application";
    reject.dataset.vendorId = application.id;
    reject.addEventListener("click", () => {
      const reason = window.prompt("Write a short reason the business can use to improve its application:");
      if (reason?.trim()) reviewApplication(application.id, "rejected", reason.trim());
    });
    actions.append(approve, reject);
    card.appendChild(actions);
    applicationsElement.appendChild(card);
  }
}

async function loadApplications() {
  message.textContent = "Loading applications...";
  try {
    const result = await adminRequest("/api/admin/me");
    message.textContent = `Signed in as ${result.admin.full_name}. Review each business before approval.`;
    const applications = await adminRequest("/api/admin/vendors");
    renderApplications(applications);
  } catch (error) {
    message.textContent = error.message;
    applicationsElement.textContent = "Only an approved Campus Benefit administrator can view applications.";
  }
}

function renderSupportMessages(messages) {
  supportMessagesElement.replaceChildren();
  if (!messages.length) {
    supportMessagesElement.textContent = "No student support messages yet.";
    return;
  }

  for (const item of messages) {
    const card = document.createElement("article");
    card.className = "admin-application-card";
    const title = document.createElement("h3");
    title.textContent = `Message #${item.id} · ${item.message_type}`;
    card.appendChild(title);
    addText(card, "From", item.full_name || "Student");
    addText(card, "Email", item.email);
    addText(card, "Submitted", new Date(item.created_at).toLocaleString());
    addText(card, "Status", item.status.replaceAll("_", " "));
    addText(card, "Message", item.message, "admin-description");

    if (item.status !== "resolved") {
      const actions = document.createElement("div");
      actions.className = "admin-actions";
      const update = document.createElement("button");
      update.type = "button";
      update.textContent = item.status === "open" ? "Start review" : "Mark resolved";
      update.addEventListener("click", async () => {
        update.disabled = true;
        const status = item.status === "open" ? "in_progress" : "resolved";
        try {
          await adminRequest(`/api/admin/support/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          });
          await loadSupportMessages();
        } catch (error) {
          supportAdminStatus.textContent = error.message;
          update.disabled = false;
        }
      });
      actions.appendChild(update);
      card.appendChild(actions);
    }
    supportMessagesElement.appendChild(card);
  }
}

async function loadSupportMessages() {
  supportAdminStatus.textContent = "Loading support messages...";
  try {
    const messages = await adminRequest("/api/admin/support");
    supportAdminStatus.textContent = "Review messages submitted through the Help form.";
    renderSupportMessages(messages);
  } catch (error) {
    supportAdminStatus.textContent = `${error.message} If the support database update has not been run, run it first.`;
    supportMessagesElement.replaceChildren();
  }
}

document.querySelector("#refresh-applications")?.addEventListener("click", loadApplications);
document.querySelector("#refresh-support")?.addEventListener("click", loadSupportMessages);
document.querySelector("#admin-logout")?.addEventListener("click", async () => {
  try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.replace("login.html");
});

loadApplications();
loadSupportMessages();

