const form = document.querySelector("#vendor-login-form");
const message = document.querySelector("#login-message");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "Signing in...";

  try {
    const response = await fetch("/api/vendor/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: document.querySelector("#vendor-email").value.trim(),
        password: document.querySelector("#vendor-password").value,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Could not sign in.");
    localStorage.setItem("vendorToken", result.token);
    localStorage.setItem("vendor", JSON.stringify(result.vendor));
    window.location.replace("vendor-dashboard.html");
  } catch (error) {
    message.textContent = error.message || "Could not reach Campus Benefit. Try again.";
  }
});
