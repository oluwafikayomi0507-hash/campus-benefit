function toggleMenu() {
    document.querySelector("nav ul").classList.toggle("show-menu");
}

const navLinks = document.querySelectorAll("nav ul a");

navLinks.forEach(link => {
    link.addEventListener("click", () => {
        document.querySelector("nav ul").classList.remove("show-menu");
    });
});