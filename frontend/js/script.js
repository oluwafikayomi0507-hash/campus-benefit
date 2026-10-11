function toggleMenu() {
    document.querySelector("nav ul").classList.toggle("show-menu");
}

const navLinks = document.querySelectorAll("nav ul a");

navLinks.forEach(link => {
    link.addEventListener("click", () => {
        document.querySelector("nav ul").classList.remove("show-menu");
    });
});


// =========================
// FLOATING HELP
// =========================

const helpButton = document.getElementById("helpButton");
const helpPopup = document.getElementById("helpPopup");
const helpClose = document.getElementById("helpClose");

helpButton.addEventListener("click", function (event) {
    event.stopPropagation();
    helpPopup.classList.toggle("active");
});

helpClose.addEventListener("click", function (event) {
    event.stopPropagation();

    helpPopup.classList.remove("active");

    // Reset popup to main menu
    helpMenu.style.display = "block";
    aiHelpSection.classList.remove("active");
    supportHelpSection.classList.remove("active");
});


// =========================
// HELP MENU
// =========================

const helpMenu = document.getElementById("helpMenu");

const helpOptions = document.querySelector(".help-options");

const aiHelpOption = document.getElementById("aiHelpOption");
const supportHelpOption = document.getElementById("supportHelpOption");

const aiHelpSection = document.getElementById("aiHelpSection");
const supportHelpSection = document.getElementById("supportHelpSection");

const backFromAi = document.getElementById("backFromAi");
const backFromSupport = document.getElementById("backFromSupport");


// ASK CAMPUS BENEFIT

aiHelpOption.addEventListener("click", function (event) {

    event.preventDefault();
    event.stopPropagation();

    helpMenu.style.display = "none";

    supportHelpSection.classList.remove("active");

    aiHelpSection.classList.add("active");

    aiChatInput.focus();

});


// CONTACT SUPPORT

supportHelpOption.addEventListener("click", function (event) {

    event.preventDefault();
    event.stopPropagation();

    helpMenu.style.display = "none";

    aiHelpSection.classList.remove("active");

    supportHelpSection.classList.add("active");

});


// BACK FROM AI

backFromAi.addEventListener("click", function (event) {

    event.preventDefault();
    event.stopPropagation();

    aiHelpSection.classList.remove("active");

    helpMenu.style.display = "block";

});


// BACK FROM SUPPORT

backFromSupport.addEventListener("click", function (event) {

    event.preventDefault();
    event.stopPropagation();

    supportHelpSection.classList.remove("active");

    helpMenu.style.display = "block";

});


// =========================
// AI CHAT
// =========================

const aiChatForm = document.getElementById("aiChatForm");
const aiChatInput = document.getElementById("aiChatInput");
const aiChatBody = document.querySelector(".ai-chat-body");


if (aiChatForm && aiChatInput && aiChatBody) {

    aiChatForm.addEventListener("submit", function (event) {

        event.preventDefault();
        event.stopPropagation();


        const message = aiChatInput.value.trim();


        if (!message) {
            return;
        }


        // =========================
        // USER MESSAGE
        // =========================

        const userMessage = document.createElement("div");

        userMessage.className = "ai-user-message";

        const userMessageContent = document.createElement("div");
        userMessageContent.className = "ai-user-message-content";
        userMessageContent.textContent = message;
        userMessage.appendChild(userMessageContent);

        aiChatBody.appendChild(userMessage);


        // Clear input
        aiChatInput.value = "";


        // Scroll down
        aiChatBody.scrollTop = aiChatBody.scrollHeight;


        // =========================
        // TYPING MESSAGE
        // =========================

        const typingMessage = document.createElement("div");

        typingMessage.className = "ai-message";

        typingMessage.id = "aiTyping";

        typingMessage.innerHTML = `
            <span class="ai-avatar">🤖</span>

            <div class="ai-message-content">
                Thinking...
            </div>
        `;

        aiChatBody.appendChild(typingMessage);

        aiChatBody.scrollTop = aiChatBody.scrollHeight;


        // =========================
        // AI RESPONSE
        // =========================

        setTimeout(function () {

            const typing = document.getElementById("aiTyping");

            if (typing) {
                typing.remove();
            }


            const aiMessage = document.createElement("div");

            aiMessage.className = "ai-message";

            aiMessage.innerHTML = `
                <span class="ai-avatar">🤖</span>

                <div class="ai-message-content">
                    ${getCampusBenefitResponse(message)}
                </div>
            `;

            aiChatBody.appendChild(aiMessage);

            aiChatBody.scrollTop = aiChatBody.scrollHeight;

        }, 700);

    });

}


// =========================
// AI RESPONSES
// =========================

function getCampusBenefitResponse(message) {

    const question = message.toLowerCase().trim();


    // GREETING

    if (
        question.includes("hello") ||
        question.includes("hi") ||
        question.includes("hey")
    ) {

        return "Hi! 👋 Welcome to Campus Benefit. What would you like help with?";

    }


    // CGPA

    if (
        question.includes("cgpa") ||
        question.includes("gpa")
    ) {

        return "You can use the CGPA Calculator in Academic Tools to calculate and keep track of your academic performance.";

    }


    // SCHOLARSHIP

    if (question.includes("scholarship")) {

        return "You can explore scholarship opportunities through the Opportunities section of Campus Benefit.";

    }


    // INTERNSHIP

    if (question.includes("internship")) {

        return "Check the Internships section under Opportunities for internship opportunities available to students.";

    }


    // COMPETITIONS

    if (question.includes("competition")) {

        return "You can discover student competitions through the Opportunities section.";

    }


    // MARKETPLACE

    if (
        question.includes("marketplace") ||
        question.includes("market place")
    ) {

        return "The Campus Benefit Marketplace is being prepared for student vendors and buyers. More listings will be added as the platform grows.";

    }


    // DEALS

    if (
        question.includes("deal") ||
        question.includes("discount")
    ) {

        return "Check the Deals section for student-friendly deals across food, fashion, printing, beauty and tech.";

    }


    // COURSE PLANNER

    if (
        question.includes("course planner") ||
        question.includes("course")
    ) {

        return "The Course Planner helps you organize your courses and stay on top of your academic workload.";

    }


    // FREELANCE

    if (
        question.includes("freelance") ||
        question.includes("gig")
    ) {

        return "You can explore Freelance & Gigs under Opportunities for student-friendly work and skill-based opportunities.";

    }


    // DEFAULT

    return "I'm still learning 🤖 Try asking me about CGPA, scholarships, internships, competitions, Deals, Marketplace, Course Planner or Freelance & Gigs.";

}


// =========================
// SUPPORT FORM
// =========================

const helpForm = document.getElementById("helpForm");
const helpSuccess = document.getElementById("helpSuccess");

if (helpForm && helpSuccess) {

    helpForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        event.stopPropagation();

        const submitButton = helpForm.querySelector("button[type='submit']");

        submitButton.disabled = true;
        helpSuccess.textContent = "Sending your message...";
        helpSuccess.classList.add("show");

        try {
            const response = await fetch("/api/support/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: document.getElementById("helpType").value,
                    message: document.getElementById("helpMessage").value.trim(),
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "Could not send your message.");

            helpForm.style.display = "none";
            helpSuccess.textContent = result.message;
        } catch (error) {
            helpSuccess.textContent = error.message || "Could not send your message. Please try again.";
        } finally {
            submitButton.disabled = false;
        }
    });

}
