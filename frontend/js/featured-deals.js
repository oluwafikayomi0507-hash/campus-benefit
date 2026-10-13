const dealCategoryNames = {
  food: "food and drinks",
  fashion: "fashion",
  beauty: "beauty and grooming",
  printing: "printing and services",
  tech: "tech and gadgets",
};

async function loadFeaturedDeals() {
  const feed = document.querySelector(".featured-deals-feed");
  if (!feed) return;

  const category = feed.dataset.category;
  const status = feed.querySelector(".featured-deals-status");
  const grid = feed.querySelector(".featured-deals-grid");
  const vendorName = new URLSearchParams(window.location.search).get("vendor")?.trim() || "";
  const storefront = feed.dataset.vendorStorefront === "true";

  if (storefront) {
    const title = document.querySelector("[data-vendor-shop-title]");
    const description = document.querySelector("[data-vendor-shop-description]");
    if (title) title.textContent = vendorName ? vendorName + " — Products" : "Vendor Products";
    if (description) {
      description.textContent = vendorName
        ? "Browse " + vendorName + "’s available products and order directly."
        : "Choose a vendor from Food & Drinks to browse their products.";
    }
  }

  try {
    const response = await fetch("/api/deals?category=" + encodeURIComponent(category));
    const deals = await response.json();

    if (response.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.replace("login.html");
      return;
    }
    if (!response.ok) throw new Error(deals.message || "Could not load featured deals.");

    const visibleDeals = vendorName
      ? deals.filter((deal) => (deal.vendor_name || "").trim().toLocaleLowerCase() === vendorName.toLocaleLowerCase())
      : storefront ? [] : deals;

    if (!visibleDeals.length) {
      status.textContent = vendorName
        ? "No active products are listed for " + vendorName + " right now."
        : storefront
          ? "Choose a vendor from Food & Drinks to browse their products."
          : "No active " + (dealCategoryNames[category] || "student") + " deals are listed right now.";
      return;
    }

    status.hidden = true;
    document.querySelector(
      ".food-coming-soon, .fashion-coming-soon, .beauty-coming-soon, .printing-coming-soon, .tech-coming-soon"
    )?.setAttribute("hidden", "");

    for (const deal of visibleDeals) {
      const card = document.createElement("article");
      card.className = "featured-deal-card";

      if (deal.image_url) {
        const image = document.createElement("img");
        image.src = deal.image_url;
        image.alt = (deal.vendor_name || deal.title);
        image.loading = "lazy";
        card.appendChild(image);
      }

      const content = document.createElement("div");
      content.className = "featured-deal-content";
      const title = document.createElement("h2");
      title.textContent = deal.title;
      content.appendChild(title);

      if (deal.description) {
        const description = document.createElement("p");
        description.textContent = deal.description;
        content.appendChild(description);
      }
      if (deal.discount) {
        const discount = document.createElement("p");
        discount.className = "featured-deal-highlight";
        discount.textContent = "Offer: " + deal.discount;
        content.appendChild(discount);
      }
      if (deal.price !== null && deal.price !== "") {
        const price = document.createElement("p");
        price.className = "featured-deal-price";
        price.textContent = "Price: ₦" + Number(deal.price).toLocaleString();
        content.appendChild(price);
      }
      if (deal.vendor_name) {
        const vendor = document.createElement("p");
        vendor.textContent = "Vendor: " + deal.vendor_name;
        content.appendChild(vendor);
      }
      if (deal.location) {
        const location = document.createElement("p");
        location.textContent = "Location: " + deal.location;
        content.appendChild(location);
      }
      if (deal.offer_url) {
        const link = document.createElement("a");
        link.href = deal.offer_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "View deal";
        content.appendChild(link);
      }
      if (!storefront && deal.vendor_name) {
        const shopLink = document.createElement("a");
        shopLink.className = "featured-deal-shop-link";
        shopLink.href = "vendor-shop.html?category=" + encodeURIComponent(category) + "&vendor=" + encodeURIComponent(deal.vendor_name);
        shopLink.setAttribute("aria-label", "Browse " + deal.vendor_name + " products");
        shopLink.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.5L21 8H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg><span>Browse products</span>';
        content.appendChild(shopLink);
      }
      card.appendChild(content);
      grid.appendChild(card);
    }
  } catch (error) {
    status.textContent = error.message || "Could not reach the Campus Benefit server. Refresh and try again.";
  }
}

loadFeaturedDeals();
