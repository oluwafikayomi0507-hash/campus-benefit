(() => {
  const token = localStorage.getItem("token");
  const form = document.querySelector("#opportunity-form");
  const list = document.querySelector("#admin-opportunities");
  const status = document.querySelector("#opportunity-admin-status");
  if (!form || !list || !status || !token) return;

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
    if (!value) return;
    const line = document.createElement("p");
    line.textContent = `${label}: ${value}`;
    card.append(line);
  }

  async function load() {
    status.textContent = "Loading opportunity listings...";
    try {
      const items = await request("/api/admin/opportunities");
      list.replaceChildren();
      status.textContent = `${items.length} listing${items.length === 1 ? "" : "s"}. Published listings appear on the matching student page.`;
      if (!items.length) list.textContent = "No listings yet. Use the form above to publish one.";
      for (const item of items) {
        const card = document.createElement("article");
        card.className = "admin-application-card";
        const title = document.createElement("h3");
        title.textContent = item.title;
        card.append(title);
        addLine(card, "Section", item.category);
        addLine(card, "Organization", item.organization);
        addLine(card, "Status", item.is_active ? "Published" : "Paused");
        addLine(card, "Deadline", item.deadline ? new Date(`${item.deadline}T00:00:00`).toLocaleDateString() : "Not specified");
        addLine(card, "Application link", item.application_url);
        const actions = document.createElement("div");
        actions.className = "admin-actions";
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.textContent = item.is_active ? "Pause listing" : "Publish listing";
        toggle.addEventListener("click", async () => {
          toggle.disabled = true;
          try {
            await request(`/api/admin/opportunities/${item.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isActive: !item.is_active }),
            });
            await load();
          } catch (error) { status.textContent = error.message; toggle.disabled = false; }
        });
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "reject-button";
        remove.textContent = "Delete";
        remove.addEventListener("click", async () => {
          if (!window.confirm(`Delete “${item.title}”?`)) return;
          remove.disabled = true;
          try {
            await request(`/api/admin/opportunities/${item.id}`, { method: "DELETE" });
            await load();
          } catch (error) { status.textContent = error.message; remove.disabled = false; }
        });
        actions.append(toggle, remove);
        card.append(actions);
        list.append(card);
      }
    } catch (error) {
      status.textContent = `${error.message} Run the opportunities database setup if this is the first time.`;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    status.textContent = "Publishing listing...";
    const opportunity = Object.fromEntries(new FormData(form).entries());
    try {
      const result = await request("/api/admin/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opportunity),
      });
      form.reset();
      status.textContent = result.message;
      await load();
    } catch (error) {
      status.textContent = error.message;
    } finally { submit.disabled = false; }
  });

  document.querySelector("#refresh-opportunities")?.addEventListener("click", load);
  load();
})();
