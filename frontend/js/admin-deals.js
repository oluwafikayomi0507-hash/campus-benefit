(() => {
  const token = localStorage.getItem("token");
  const list = document.querySelector("#admin-deals");
  const status = document.querySelector("#admin-deals-status");
  if (!token || !list || !status) return;

  async function request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Could not complete that action.");
    return result;
  }

  function addLine(card, label, value) {
    if (value === null || value === undefined || value === "") return;
    const line = document.createElement("p");
    line.textContent = `${label}: ${value}`;
    card.append(line);
  }

  async function load() {
    status.textContent = "Loading vendor promotions...";
    try {
      const deals = await request("/api/admin/deals");
      list.replaceChildren();
      status.textContent = `${deals.length} promotion${deals.length === 1 ? "" : "s"} found.`;
      if (!deals.length) list.textContent = "No vendor promotions yet.";
      for (const deal of deals) {
        const card = document.createElement("article");
        card.className = "admin-application-card";
        const title = document.createElement("h3");
        title.textContent = deal.title;
        card.append(title);
        addLine(card, "Business", deal.registered_business || deal.vendor_name || "Vendor");
        addLine(card, "Section", deal.category);
        addLine(card, "Payment", deal.payment_status || deal.latest_payment_status || "Not paid");
        addLine(card, "Package", deal.package_name || "—");
        addLine(card, "Expires", deal.expires_at ? new Date(deal.expires_at).toLocaleDateString() : (deal.within_dates ? "Permanent" : "Expired"));
        addLine(card, "Visibility", deal.is_active && deal.within_dates ? "Shown to students" : "Hidden");
        if (deal.description) addLine(card, "Description", deal.description);

        const actions = document.createElement("div");
        actions.className = "admin-actions";
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.textContent = deal.is_active ? "Hide promotion" : "Show promotion";
        const canShow = ["paid", "not_required"].includes(deal.payment_status) && deal.within_dates;
        toggle.disabled = !deal.is_active && !canShow;
        toggle.title = toggle.disabled ? "Only paid, unexpired promotions can be shown." : "";
        toggle.addEventListener("click", async () => {
          toggle.disabled = true;
          try {
            await request(`/api/admin/deals/${deal.id}/visibility`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isActive: !deal.is_active }),
            });
            await load();
          } catch (error) {
            status.textContent = error.message;
            toggle.disabled = false;
          }
        });
        actions.append(toggle);
        card.append(actions);
        list.append(card);
      }
    } catch (error) {
      status.textContent = error.message;
    }
  }

  document.querySelector("#refresh-admin-deals")?.addEventListener("click", load);
  load();
})();
