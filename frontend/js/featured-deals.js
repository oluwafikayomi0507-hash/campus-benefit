const dealCategoryNames = {
  food: "food and drinks",
  fashion: "fashion",
  beauty: "beauty and grooming",
  printing: "printing and services",
  tech: "tech and gadgets",
};

function normalizeVendorName(name) {
  return (name || "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, " ");
}

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
    if (title) title.textContent = vendorName ? `${vendorName} — Products` : "Vendor Products";
    if (description) {
      description.textContent = vendorName
        ? `Browse ${vendorName}’s products.`
        : "Choose a vendor from Food & Drinks to browse their products.";
    }
  }

  try {
    const response = await fetch(`/api/deals?category=${encodeURIComponent(category)}`);
    const deals = await response.json();

    if (response.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.replace("login.html");
      return;
    }
    if (!response.ok) throw new Error(deals.message || "Could not load featured deals.");

    let marketplaceProducts = [];
    if (category === "food") {
      try {
        const productsResponse = await fetch("/api/products?category=food");
        if (productsResponse.ok) marketplaceProducts = await productsResponse.json();
      } catch {
        // Public food deals remain browsable if the marketplace catalog is unavailable.
      }
    }

    const visibleDeals = vendorName
      ? deals.filter((deal) => normalizeVendorName(deal.vendor_name) === normalizeVendorName(vendorName))
      : storefront ? [] : deals;

    if (!visibleDeals.length) {
      status.textContent = vendorName
        ? `No active products are listed for ${vendorName} right now.`
        : storefront
          ? "Choose a vendor from Food & Drinks to browse their products."
          : `No active ${dealCategoryNames[category] || "student"} deals are listed right now.`;
      return;
    }

    status.hidden = true;
    document.querySelector(
      ".food-coming-soon, .fashion-coming-soon, .beauty-coming-soon, .printing-coming-soon, .tech-coming-soon"
    )?.setAttribute("hidden", "");

    const dealsByVendor = new Map();
    for (const deal of visibleDeals) {
      const key = deal.vendor_name || "Campus Benefit deals";
      if (!dealsByVendor.has(key)) dealsByVendor.set(key, []);
      dealsByVendor.get(key).push(deal);
    }

    for (const [name, vendorDeals] of dealsByVendor) {
      const container = document.createElement(storefront ? "section" : "details");
      container.className = "featured-vendor-container";
      const heading = document.createElement(storefront ? "h2" : "summary");
      heading.className = "featured-vendor-heading";
      const vendorTitle = document.createElement("span");
      vendorTitle.textContent = name;
      if (normalizeVendorName(name) === normalizeVendorName("Heesha’s Perfect Bitez")) {
        const brand = document.createElement("span");
        brand.className = "featured-vendor-brand";
        const logo = document.createElement("img");
        logo.src = "images/heesha-perfect-bitez-logo.jpeg";
        logo.alt = "";
        logo.loading = "lazy";
        brand.append(logo, vendorTitle);
        heading.appendChild(brand);
      } else {
        heading.appendChild(vendorTitle);
      }
      const productCount = document.createElement("span");
      productCount.className = "featured-vendor-count";
      productCount.textContent = vendorDeals.length + (vendorDeals.length === 1 ? " item" : " items");
      heading.append(productCount);
      container.appendChild(heading);

      const sellerProducts = marketplaceProducts.filter((product) =>
        normalizeVendorName(product.business_name) === normalizeVendorName(name)
      );
      const sellerHasCartProducts = sellerProducts.length > 0;
      const sellerHasMatchingCartProduct = vendorDeals.some((deal) => sellerProducts.some((product) =>
        normalizeVendorName(product.product_name) === normalizeVendorName(deal.title)
      ));
      if (normalizeVendorName(name) === normalizeVendorName("Heesha’s Perfect Bitez") && !sellerHasMatchingCartProduct) {
        const orderingNote = document.createElement("p");
        orderingNote.className = "featured-vendor-ordering-note";
        orderingNote.textContent = "In-app ordering will appear here after Heesha signs up, is approved, and adds her products.";
        container.appendChild(orderingNote);
      }

      const products = document.createElement("div");
      products.className = "featured-vendor-products";
      for (const deal of vendorDeals) {
        const card = document.createElement("article");
        card.className = "featured-deal-card";

        if (deal.image_url) {
          const image = document.createElement("img");
          image.src = deal.image_url;
          image.alt = deal.vendor_name || deal.title;
          image.loading = "lazy";
          card.appendChild(image);
        }

        const content = document.createElement("div");
        content.className = "featured-deal-content";
        const title = document.createElement("h3");
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
        if (deal.location) {
          const location = document.createElement("p");
          location.textContent = "Location: " + deal.location;
          content.appendChild(location);
        }
        const marketplaceProduct = sellerProducts.find((product) =>
          normalizeVendorName(product.product_name) === normalizeVendorName(deal.title)
        );
        const productDescription = marketplaceProduct?.description || deal.description || "";
        if (marketplaceProduct?.description && !deal.description) {
          const description = document.createElement("p");
          description.className = "featured-product-description";
          description.textContent = marketplaceProduct.description;
          content.insertBefore(description, content.querySelector(".featured-deal-price"));
        }
        if (marketplaceProduct) {
          const addButton = document.createElement("button");
          addButton.type = "button";
          addButton.className = "featured-add-to-cart";
          addButton.textContent = "Add to cart";
          addButton.addEventListener("click", () => {
            let cart = [];
            try {
              const storedCart = JSON.parse(localStorage.getItem("campusBenefitCart") || "[]");
              if (Array.isArray(storedCart)) cart = storedCart;
            } catch { /* Start with an empty cart if saved cart data is invalid. */ }
            const existing = cart.find((item) => Number(item.productId) === Number(marketplaceProduct.id));
            if (existing) {
              existing.quantity += 1;
              existing.description = productDescription;
              existing.imageUrl = marketplaceProduct.image_url || deal.image_url || existing.imageUrl || "";
            }
            else cart.push({
              productId: Number(marketplaceProduct.id),
              vendorId: Number(marketplaceProduct.vendor_id),
              productName: marketplaceProduct.product_name,
              vendorName: marketplaceProduct.business_name,
              price: Number(marketplaceProduct.price),
              deliveryFee: Number(marketplaceProduct.delivery_fee || 0),
              description: productDescription,
              imageUrl: marketplaceProduct.image_url || deal.image_url || "",
              quantity: 1,
            });
            localStorage.setItem("campusBenefitCart", JSON.stringify(cart));
            addButton.textContent = "Added to cart";
            window.setTimeout(() => { addButton.textContent = "Add to cart"; }, 1800);
          });
          content.appendChild(addButton);
        }
        card.appendChild(content);
        products.appendChild(card);
      }
      container.appendChild(products);
      if (sellerHasCartProducts) {
        const cartLink = document.createElement("a");
        cartLink.className = "featured-vendor-cart-link";
        cartLink.href = "vendors.html?category=food";
        cartLink.textContent = "View cart and checkout";
        container.appendChild(cartLink);
      }
      grid.appendChild(container);
    }
  } catch (error) {
    status.textContent = error.message || "Could not reach the Campus Benefit server. Refresh and try again.";
  }
}

loadFeaturedDeals();
