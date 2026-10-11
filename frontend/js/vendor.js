const vendorForm = document.querySelector(".vendor-form");

if (vendorForm) {
  vendorForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submission = {
      businessName: document.querySelector("#business-name").value.trim(),
      businessType: document.querySelector("#business-type").value.trim(),
      university: document.querySelector("#university").value.trim(),
      location: document.querySelector("#location").value.trim(),
      contact: document.querySelector("#contact").value.trim(),
      social: document.querySelector("#social").value.trim(),
      description: document.querySelector("#description").value.trim(),
    };

    if (
      !submission.businessName ||
      !submission.businessType ||
      !submission.university ||
      !submission.location ||
      !submission.contact
    ) {
      alert("Please fill in all the required fields.");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      window.location.replace("login.html");
      return;
    }

    const submitButton = vendorForm.querySelector(".vendor-submit");
    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";

    try {
      const response = await fetch(
        "/api/vendor-submissions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(submission),
        }
      );

      const result = await response.json();

      if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.replace("login.html");
        return;
      }

      if (!response.ok) {
        throw new Error(result.message || "Could not submit the business.");
      }

      alert("Your business submission was received for review.");
      vendorForm.reset();
    } catch (error) {
      console.error("Could not submit vendor form:", error);
      alert(
        error.message || "Could not submit your business. Check that the backend server is running and try again."
      );
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Submit Your Business";
    }
  });
}
