const form = document.querySelector("#vendor-signup-form");
const message = document.querySelector("#signup-message");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "Submitting your business for review...";

  const password = document.querySelector("#vendor-password").value;
  const confirmPassword = document.querySelector("#vendor-confirm-password").value;
  const phoneNumber = document.querySelector("#vendor-phone").value.trim();
  const whatsappNumber = document.querySelector("#vendor-whatsapp").value.trim();
  if (password !== confirmPassword) {
    message.textContent = "The passwords do not match.";
    return;
  }
  if (!phoneNumber && !whatsappNumber) {
    message.textContent = "Enter a phone or WhatsApp number customers can use.";
    return;
  }

  const body = {
    businessName: document.querySelector("#business-name").value.trim(),
    businessType: document.querySelector("#business-type").value.trim(),
    university: document.querySelector("#university").value.trim(),
    location: document.querySelector("#business-location").value.trim(),
    email: document.querySelector("#vendor-email").value.trim(),
    phoneNumber,
    whatsappNumber,
    social: document.querySelector("#vendor-social").value.trim(),
    description: document.querySelector("#business-description").value.trim(),
    password,
  };

  try {
    const response = await fetch("/api/vendor/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Could not submit the business.");
    form.reset();
    message.textContent = `${result.message} We’ll let you sign in after approval.`;
  } catch (error) {
    message.textContent = error.message || "Could not reach Campus Benefit. Try again.";
  }
});
