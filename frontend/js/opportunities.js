(() => {
  const container = document.querySelector("[data-opportunity-category]");
  if (!container) return;
  const category = container.dataset.opportunityCategory;
  const styles = {
    internship: { card: "internship-card", icon: "internship-icon", details: "internship-details", link: "internship-link", emoji: "💼", action: "View Opportunity" },
    competition: { card: "competition-card", icon: "competition-icon", details: "competition-details", link: "competition-link", emoji: "🏆", action: "View Competition" },
    gig: { card: "freelance-card", icon: "freelance-icon", details: "freelance-details", link: "freelance-link", emoji: "✨", action: "View Opportunity" },
    career: { card: "program-card", icon: "program-icon", details: "program-details", link: "program-link", emoji: "🎓", action: "Explore Program" },
  }[category];
  if (!styles) return;

  const make = (tag, value, className) => {
    const element = document.createElement(tag);
    element.textContent = value;
    if (className) element.className = className;
    return element;
  };

  function render(items) {
    if (!items.length) return;
    const grid = container.parentElement;
    grid.querySelectorAll(`:scope > a.${styles.card}`).forEach((card) => card.remove());
    container.replaceChildren();
    for (const item of items) {
      const card = document.createElement("a");
      card.className = styles.card;
      card.href = item.application_url;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
      card.append(make("div", styles.emoji, styles.icon));
      card.append(make("h3", item.title));
      card.append(make("p", item.description));
      const details = make("div", "", styles.details);
      details.append(make("span", item.organization));
      if (item.location) details.append(make("span", item.location));
      if (item.deadline) details.append(make("span", `Deadline: ${new Date(`${item.deadline}T00:00:00`).toLocaleDateString()}`));
      card.append(details, make("span", `${styles.action} →`, styles.link));
      container.append(card);
    }
  }

  fetch(`/api/opportunities?category=${encodeURIComponent(category)}`)
    .then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not load opportunities.");
      return result;
    })
    .then(render)
    .catch((error) => console.error("Could not load opportunities:", error));
})();
