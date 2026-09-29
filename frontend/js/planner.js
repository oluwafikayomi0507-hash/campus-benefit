const addStudyButton = document.querySelector(".add-study");
const calendar = document.querySelector(".calendar");
const clearScheduleButton = document.querySelector(".clear-schedule");

let studySessions = JSON.parse(localStorage.getItem("studySessions")) || [];

function displaySessions() {
    document.querySelectorAll(".study-session").forEach(session => {
        session.remove();
    });

    studySessions.forEach((sessionData, index) => {

        const days = document.querySelectorAll(".day");

        days.forEach(dayBox => {

            const heading = dayBox.querySelector("h3");

            if (heading.textContent === sessionData.day) {

                const session = document.createElement("div");

                session.classList.add("study-session");

                session.innerHTML = `
                    <strong>${sessionData.course}</strong>
                    <span>${sessionData.topic}</span>
                    <small>${sessionData.time}</small>

                    <button type="button" class="delete-session">
                        Remove
                    </button>
                `;

                dayBox.appendChild(session);

                session.querySelector(".delete-session").addEventListener("click", () => {

                    studySessions.splice(index, 1);

                    localStorage.setItem(
                        "studySessions",
                        JSON.stringify(studySessions)
                    );

                    displaySessions();
                });
            }
        });
    });
}


addStudyButton.addEventListener("click", () => {

    const form = document.createElement("div");

    form.classList.add("study-form");

    form.innerHTML = `
        <h3>Add Study Session</h3>

        <select class="study-day">
            <option value="">Select Day</option>
            <option value="Monday">Monday</option>
            <option value="Tuesday">Tuesday</option>
            <option value="Wednesday">Wednesday</option>
            <option value="Thursday">Thursday</option>
            <option value="Friday">Friday</option>
            <option value="Saturday">Saturday</option>
            <option value="Sunday">Sunday</option>
        </select>

        <input
            type="text"
            class="study-course"
            placeholder="Course name"
        >

        <input
            type="text"
            class="study-topic"
            placeholder="Topic to study"
        >

        <input
            type="time"
            class="study-time"
        >

        <div class="form-buttons">

            <button type="button" class="save-session">
                Add Session
            </button>

            <button type="button" class="cancel-session">
                Cancel
            </button>

        </div>
    `;

    document.querySelector(".planner-card").prepend(form);


    form.querySelector(".cancel-session").addEventListener("click", () => {
        form.remove();
    });


    form.querySelector(".save-session").addEventListener("click", () => {

        const day = form.querySelector(".study-day").value;
        const course = form.querySelector(".study-course").value.trim();
        const topic = form.querySelector(".study-topic").value.trim();
        const time = form.querySelector(".study-time").value;

        if (!day || !course || !topic || !time) {
            alert("Please complete all the fields.");
            return;
        }

        studySessions.push({
            day: day,
            course: course,
            topic: topic,
            time: time
        });

        localStorage.setItem(
            "studySessions",
            JSON.stringify(studySessions)
        );

        form.remove();

        displaySessions();
    });
});


displaySessions();

clearScheduleButton.addEventListener("click", () => {

    if (studySessions.length === 0) {
        alert("There are no study sessions to clear.");
        return;
    }

    const confirmClear = confirm(
        "Are you sure you want to clear your entire schedule?"
    );

    if (!confirmClear) return;

    studySessions = [];

    localStorage.removeItem("studySessions");

    displaySessions();
});