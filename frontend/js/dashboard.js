const studentInfo = document.querySelector("#student-info");
const logoutButton = document.querySelector("#logout-button");

loadStudentProfile();

async function loadStudentProfile() {
  try {
    const response = await fetch("/api/auth/me");

    if (response.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.replace("login.html");
      return;
    }

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Could not load your profile.");
    }

    const user = result.user;
    studentInfo.textContent =
      `Hello, ${user.fullName}! University: ${user.university}; Level: ${user.level}.`;
  } catch (error) {
    console.error("Profile error:", error);
    studentInfo.textContent = "Could not load your profile. Please refresh the page.";
  }
}

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "login.html";
  });
}
