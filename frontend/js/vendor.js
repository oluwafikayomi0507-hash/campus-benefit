const vendorForm = document.querySelector(".vendor-form");

vendorForm.addEventListener("submit", function (event) {

    event.preventDefault();

    const businessName = document.querySelector("#business-name").value.trim();
    const businessType = document.querySelector("#business-type").value.trim();
    const university = document.querySelector("#university").value.trim();
    const location = document.querySelector("#location").value.trim();
    const contact = document.querySelector("#contact").value.trim();
    const social = document.querySelector("#social").value.trim();
    const description = document.querySelector("#description").value.trim();

    if (
        !businessName ||
        !businessType ||
        !university ||
        !location ||
        !contact
    ) {
        alert("Please fill in all the required fields.");
        return;
    }