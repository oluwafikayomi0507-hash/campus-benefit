const addGoalButton = document.querySelector(".add-goal");
const goalsList = document.querySelector(".goals-list");
const goalsStatus = document.querySelector("#goals-sync-status");
const goalsToken = localStorage.getItem("token");

function readLocalGoals() {
  try {
    const saved = JSON.parse(localStorage.getItem("semesterGoals") || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}

let goals = readLocalGoals();
let goalsSaveQueue = Promise.resolve();

function setGoalsStatus(text) {
  if (goalsStatus) goalsStatus.textContent = text;
}

function cacheGoals() {
  localStorage.setItem("semesterGoals", JSON.stringify(goals));
}

function saveGoals() {
  cacheGoals();
  setGoalsStatus("Saving to your account...");
  const snapshot = JSON.stringify(goals);
  goalsSaveQueue = goalsSaveQueue.then(async () => {
    const response = await fetch("/api/student-tools/semester-goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${goalsToken}` },
      body: JSON.stringify({ data: JSON.parse(snapshot) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Could not save your goals.");
    setGoalsStatus("Saved to your account.");
  }).catch((error) => {
    setGoalsStatus(`${error.message} Your copy is still saved in this browser.`);
  });
}

function displayGoals() {
  goalsList.replaceChildren();
  if (!goals.length) {
    const empty = document.createElement("div");
    empty.className = "empty-goals";
    empty.append(document.createElement("span"), document.createElement("h3"), document.createElement("p"));
    empty.querySelector("span").textContent = "🎯";
    empty.querySelector("h3").textContent = "No goals yet";
    empty.querySelector("p").textContent = "Add your first semester goal and start working towards it.";
    goalsList.append(empty);
    return;
  }

  goals.forEach((goal, index) => {
    const card = document.createElement("div");
    card.className = `goal-item${goal.completed ? " completed" : ""}`;
    const title = document.createElement("h3");
    title.textContent = goal.title;
    const description = document.createElement("p");
    description.textContent = goal.description;
    const target = document.createElement("small");
    target.textContent = `Target: ${goal.date}`;
    const actions = document.createElement("div");
    actions.className = "goal-actions";
    const complete = document.createElement("button");
    complete.type = "button";
    complete.className = "complete-goal";
    complete.textContent = goal.completed ? "Completed ✓" : "Mark Complete";
    complete.addEventListener("click", () => {
      goals[index].completed = !goals[index].completed;
      displayGoals();
      saveGoals();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-goal";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => {
      goals.splice(index, 1);
      displayGoals();
      saveGoals();
    });
    actions.append(complete, remove);
    card.append(title, description, target, actions);
    goalsList.append(card);
  });
}

function createGoalForm() {
  const form = document.createElement("div");
  form.className = "goal-form";
  form.innerHTML = `<h3>Add Semester Goal</h3>
    <input type="text" class="goal-title" placeholder="Goal title" maxlength="180">
    <textarea class="goal-description" placeholder="What do you want to achieve?" maxlength="1000"></textarea>
    <input type="date" class="goal-date">
    <div class="goal-form-buttons"><button type="button" class="save-goal">Add Goal</button><button type="button" class="cancel-goal">Cancel</button></div>`;
  document.querySelector(".goals-card").prepend(form);
  form.querySelector(".cancel-goal").addEventListener("click", () => form.remove());
  form.querySelector(".save-goal").addEventListener("click", () => {
    const title = form.querySelector(".goal-title").value.trim();
    const description = form.querySelector(".goal-description").value.trim();
    const date = form.querySelector(".goal-date").value;
    if (!title || !description || !date) return window.alert("Please complete all the fields.");
    goals.push({ title, description, date, completed: false });
    form.remove();
    displayGoals();
    saveGoals();
  });
}

addGoalButton.addEventListener("click", createGoalForm);

async function loadGoals() {
  addGoalButton.disabled = true;
  setGoalsStatus("Loading your goals...");
  try {
    const response = await fetch("/api/student-tools/semester-goals", { headers: { Authorization: `Bearer ${goalsToken}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Could not load your goals.");
    if (Array.isArray(result.data)) {
      goals = result.data;
      cacheGoals();
      setGoalsStatus("Your account goals are loaded.");
    } else if (goals.length) {
      setGoalsStatus("Moving your existing goals to your account...");
      saveGoals();
    } else {
      setGoalsStatus("Your goals will be saved to your account.");
    }
  } catch (error) {
    setGoalsStatus(`${error.message} Your browser copy is still available.`);
  } finally {
    displayGoals();
    addGoalButton.disabled = false;
  }
}

displayGoals();
if (goalsToken) loadGoals();
else setGoalsStatus("Sign in to save your goals to your account.");
