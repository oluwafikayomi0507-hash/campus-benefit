const logoutLink = document.querySelector("#logout-link");

if (logoutLink) {
  logoutLink.addEventListener("click", (event) => {
    event.preventDefault();
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.replace("login.html");
  });
}