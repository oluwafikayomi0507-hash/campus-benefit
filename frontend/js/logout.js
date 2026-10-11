const logoutLink = document.querySelector("#logout-link");

if (logoutLink) {
  logoutLink.addEventListener("click", async (event) => {
    event.preventDefault();
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.replace("login.html");
  });
}
