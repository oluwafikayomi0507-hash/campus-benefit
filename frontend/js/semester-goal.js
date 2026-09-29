const addGoalButton = document.querySelector(".add-goal");
const goalsList = document.querySelector(".goals-list");

let goals = JSON.parse(localStorage.getItem("semesterGoals")) || [];

function displayGoals() {

    goalsList.innerHTML = "";

    if (goals.length === 0) {

        goalsList.innerHTML = `
            <div class="empty-goals">
                <span>🎯</span>

                <h3>No goals yet</h3>

                <p>
                    Add your first semester goal and start working towards it.
                </p>
            </div>
        `;

        return;
    }

    goals.forEach((goal, index) => {

        const goalCard = document.createElement("div");

        goalCard.classList.add("goal-item");

        goalCard.innerHTML = `
            <h3>${goal.title}</h3>

            <p>${goal.description}</p>

            <small>Target: ${goal.date}</small>

            <div class="goal-actions">

                <button type="button" class="complete-goal">
                    ${goal.completed ? "Completed ✓" : "Mark Complete"}
                </button>

                <button type="button" class="delete-goal">
                    Delete
                </button>

            </div>
        `;

        if (goal.completed) {
            goalCard.classList.add("completed");
        }

        goalsList.appendChild(goalCard);


        goalCard.querySelector(".complete-goal").addEventListener("click", () => {

            goals[index].completed = !goals[index].completed;

            localStorage.setItem(
                "semesterGoals",
                JSON.stringify(goals)
            );

            displayGoals();
        });


        goalCard.querySelector(".delete-goal").addEventListener("click", () => {

            goals.splice(index, 1);

            localStorage.setItem(
                "semesterGoals",
                JSON.stringify(goals)
            );

            displayGoals();
        });

    });
}


addGoalButton.addEventListener("click", () => {

    const form = document.createElement("div");

    form.classList.add("goal-form");

    form.innerHTML = `
        <h3>Add Semester Goal</h3>

        <input
            type="text"
            class="goal-title"
            placeholder="Goal title"
        >

        <textarea
            class="goal-description"
            placeholder="What do you want to achieve?"
        ></textarea>

        <input
            type="date"
            class="goal-date"
        >

        <div class="goal-form-buttons">

            <button type="button" class="save-goal">
                Add Goal
            </button>

            <button type="button" class="cancel-goal">
                Cancel
            </button>

        </div>
    `;

    document.querySelector(".goals-card").prepend(form);


    form.querySelector(".cancel-goal").addEventListener("click", () => {
        form.remove();
    });


    form.querySelector(".save-goal").addEventListener("click", () => {

        const title = form.querySelector(".goal-title").value.trim();
        const description = form.querySelector(".goal-description").value.trim();
        const date = form.querySelector(".goal-date").value;

        if (!title || !description || !date) {
            alert("Please complete all the fields.");
            return;
        }

        goals.push({
            title: title,
            description: description,
            date: date,
            completed: false
        });

        localStorage.setItem(
            "semesterGoals",
            JSON.stringify(goals)
        );

        form.remove();

        displayGoals();
    });

});


displayGoals();