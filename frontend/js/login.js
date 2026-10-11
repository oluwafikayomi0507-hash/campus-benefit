const loginForm = document.querySelector(".login-form");

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.querySelector("#email").value.trim();
    const password = document.querySelector("#password").value;
    const loginButton = loginForm.querySelector(".login-button");

    loginButton.disabled = true;
    loginButton.textContent = "Logging in...";

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Could not log in.");
      }

      localStorage.setItem("token", result.token);

      if (result.user) {
        localStorage.setItem("user", JSON.stringify(result.user));
      }

      window.location.href = "index.html";
    } catch (error) {
      console.error("Login error:", error);
      alert(error.message || "Could not connect to the backend.");
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = "Log In";
    }
  });
}

const forgotPanel = document.querySelector("#forgot-password-panel");
const resetPanel = document.querySelector("#reset-password-panel");
const signupText = document.querySelector(".signup-text");
const forgotForm = document.querySelector("#forgot-password-form");
const resetForm = document.querySelector("#reset-password-form");
const resetMessage = document.querySelector("#reset-password-message");
const resetUrl = new URL(window.location.href);
const resetToken = resetUrl.searchParams.get("reset") || "";

document.querySelector("#show-forgot-password")?.addEventListener("click", (event) => {
  event.preventDefault();
  loginForm.style.display = "none";
  if (signupText) signupText.style.display = "none";
  forgotPanel.style.display = "block";
  document.querySelector("#forgot-email").value = document.querySelector("#email").value.trim();
});

document.querySelector("#return-to-login")?.addEventListener("click", () => {
  forgotPanel.style.display = "none";
  loginForm.style.display = "flex";
  if (signupText) signupText.style.display = "";
});

forgotForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = forgotForm.querySelector("button[type='submit']");
  const message = document.querySelector("#forgot-password-message");
  button.disabled = true;
  message.textContent = "Sending request...";
  try {
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: document.querySelector("#forgot-email").value.trim() }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Could not send the request.");
    message.textContent = result.message;
  } catch (error) {
    message.textContent = error.message || "Could not connect to Campus Benefit.";
  } finally {
    button.disabled = false;
  }
});

if (resetToken) {
  loginForm.style.display = "none";
  forgotPanel.style.display = "none";
  resetPanel.style.display = "block";
  if (signupText) signupText.style.display = "none";
  resetUrl.searchParams.delete("reset");
  window.history.replaceState({}, "", resetUrl);
}

resetForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.querySelector("#new-password").value;
  const confirmation = document.querySelector("#confirm-new-password").value;
  if (!resetToken) {
    resetMessage.textContent = "This reset link is missing or expired. Request a new one.";
    return;
  }
  if (password !== confirmation) {
    resetMessage.textContent = "The passwords do not match.";
    return;
  }
  const button = resetForm.querySelector("button[type='submit']");
  button.disabled = true;
  resetMessage.textContent = "Saving your new password...";
  try {
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: resetToken, password }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Could not reset the password.");
    resetMessage.textContent = result.message;
    resetForm.reset();
    window.setTimeout(() => window.location.assign("login.html"), 2000);
  } catch (error) {
    resetMessage.textContent = error.message || "Could not connect to Campus Benefit.";
    button.disabled = false;
  }
});
