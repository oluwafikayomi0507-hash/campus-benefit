localStorage.removeItem("token");
fetch("/api/auth/me").then((response) => {
  if (response.status === 401) window.location.replace("login.html");
}).catch(() => window.location.replace("login.html"));
