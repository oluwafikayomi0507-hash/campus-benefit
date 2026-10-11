const foodDealsGrid = document.querySelector("#food-deals-grid");

async function loadFoodDeals() {
  if (!foodDealsGrid) return;

  try {
    const response = await fetch("/api/deals?category=food");

    if (response.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.replace("login.html");
      return;
    }

    const deals = await response.json();

    if (!response.ok) {
      throw new Error(deals.message || "Could not load food deals.");
    }

    if (deals.length === 0) return;

    const comingSoon = document.querySelector(".food-coming-soon");
    if (comingSoon) comingSoon.style.display = "none";

    for (const deal of deals) {
      const card = document.createElement("article");
      card.className = "food-deal-card";

      if (deal.image_url) {
        const image = document.createElement("img");
        image.className = "food-deal-image";
        image.src = deal.image_url;
        image.alt = `${deal.vendor_name || deal.title} logo`;
        card.appendChild(image);
      }

      const content = document.createElement("div");
      content.className = "food-deal-content";

      const title = document.createElement("h2");
      title.textContent = deal.title;
      content.appendChild(title);

      if (deal.description) {
        const description = document.createElement("p");
        description.className = "food-deal-description";
        description.textContent = deal.description;
        content.appendChild(description);
      }

      if (deal.discount) {
        const discount = document.createElement("p");
        discount.className = "food-deal-detail";
        discount.textContent = `Offer: ${deal.discount}`;
        content.appendChild(discount);
      }

      if (deal.price !== null && deal.price !== "") {
        const price = document.createElement("p");
        price.className = "food-deal-price";
        price.textContent = `Price: ₦${Number(deal.price).toLocaleString()}`;
        content.appendChild(price);
      }

      if (deal.vendor_name) {
        const vendor = document.createElement("p");
        vendor.className = "food-deal-detail";
        vendor.textContent = `Vendor: ${deal.vendor_name}`;
        content.appendChild(vendor);
      }

      if (deal.location) {
        const location = document.createElement("p");
        location.className = "food-deal-detail";
        location.textContent = `Location: ${deal.location}`;
        content.appendChild(location);
      }

      if (deal.offer_url) {
        const link = document.createElement("a");
        link.className = "food-deal-link";
        link.href = deal.offer_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "View deal";
        content.appendChild(link);
      }

      card.appendChild(content);
      foodDealsGrid.appendChild(card);
    }
  } catch (error) {
    console.error("Could not load food deals:", error);
    foodDealsGrid.textContent =
      "Could not load food deals. Please refresh the page.";
  }
}

loadFoodDeals();
