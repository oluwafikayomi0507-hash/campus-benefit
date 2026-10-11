const signupForm = document.querySelector(".signup-form");

if (signupForm) {
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const fullName = document.querySelector("#full-name").value.trim();
    const email = document.querySelector("#email").value.trim();
    const university = document.querySelector("#university").value.trim();
    const level = document.querySelector("#level").value.trim();
    const password = document.querySelector("#password").value;
    const confirmPassword = document.querySelector("#confirm-password").value;

    if (password !== confirmPassword) {
      alert("Your passwords do not match.");
      return;
    }

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName,
          email,
          university,
          level,
          password,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Could not create your account.");
      }

      alert("Your account was created. You can now log in.");
      window.location.href = "login.html";
    } catch (error) {
      console.error("Signup error:", error);
      alert(error.message || "Could not connect to the backend.");
    }
  });
}
