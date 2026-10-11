const scholarshipGrid = document.querySelector(".scholarships-grid");

async function loadScholarships() {
  if (!scholarshipGrid) return;

  const token = localStorage.getItem("token");
  if (!token) {
    window.location.replace("login.html");
    return;
  }

  try {
    const response = await fetch("/api/scholarships", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.replace("login.html");
      return;
    }

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const scholarships = await response.json();

    const cards = scholarships.map((scholarship) => {
      const card = document.createElement("a");
      card.className = "scholarship-card";
      card.href = scholarship.application_url;
      card.target = "_blank";
      card.rel = "noopener noreferrer";

      const icon = document.createElement("div");
      icon.className = "scholarship-icon";
      icon.textContent = "🎓";

      const title = document.createElement("h3");
      title.textContent = scholarship.title;

      const description = document.createElement("p");
      description.textContent = scholarship.description;

      const details = document.createElement("div");
      details.className = "scholarship-details";

      scholarship.details.forEach((detail) => {
        const item = document.createElement("span");
        item.textContent = detail;
        details.appendChild(item);
      });

      const linkText = document.createElement("span");
      linkText.className = "scholarship-link";
      linkText.textContent = "View Opportunity →";

      card.append(icon, title, description, details, linkText);
      return card;
    });

    scholarshipGrid.replaceChildren(...cards);
  } catch (error) {
    console.error("Could not load scholarships:", error);
  }
}

loadScholarships();
