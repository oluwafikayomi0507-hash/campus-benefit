const dealCountLabels = document.querySelectorAll("[data-deal-count]");

async function loadDealCounts() {
  if (!dealCountLabels.length) return;
  try {
    const response = await fetch("/api/deals/summary");
    const counts = await response.json();
    if (response.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.replace("login.html");
      return;
    }
    if (!response.ok) throw new Error(counts.message || "Could not load deals.");

    for (const label of dealCountLabels) {
      const count = Number(counts[label.dataset.dealCount] || 0);
      label.textContent = `${count} ${count === 1 ? "deal" : "deals"}`;
    }
  } catch {
    for (const label of dealCountLabels) label.textContent = "View deals";
  }
}

loadDealCounts();
