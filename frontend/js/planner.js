const addStudyButton = document.querySelector(".add-study");
const calendar = document.querySelector(".calendar");
const clearScheduleButton = document.querySelector(".clear-schedule");
const plannerStatus = document.querySelector("#planner-sync-status");
const plannerToken = localStorage.getItem("token");

function readLocalSessions() {
  try {
    const saved = JSON.parse(localStorage.getItem("studySessions") || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}

let studySessions = readLocalSessions();
let saveQueue = Promise.resolve();

function setPlannerStatus(text) {
  if (plannerStatus) plannerStatus.textContent = text;
}

function cacheSessions() {
  localStorage.setItem("studySessions", JSON.stringify(studySessions));
}

function saveSessions() {
  cacheSessions();
  setPlannerStatus("Saving to your account...");
  const snapshot = JSON.stringify(studySessions);
  saveQueue = saveQueue.then(async () => {
    const response = await fetch("/api/student-tools/planner", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${plannerToken}` },
      body: JSON.stringify({ data: JSON.parse(snapshot) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Could not save your schedule.");
    setPlannerStatus("Saved to your account.");
  }).catch((error) => {
    setPlannerStatus(`${error.message} Your copy is still saved in this browser.`);
  });
}

function displaySessions() {
  document.querySelectorAll(".study-session").forEach((session) => session.remove());
  studySessions.forEach((sessionData, index) => {
    const dayBox = [...document.querySelectorAll(".day")].find((day) => day.querySelector("h3")?.textContent === sessionData.day);
    if (!dayBox) return;
    const session = document.createElement("div");
    session.classList.add("study-session");
    const course = document.createElement("strong");
    course.textContent = sessionData.course;
    const topic = document.createElement("span");
    topic.textContent = sessionData.topic;
    const time = document.createElement("small");
    time.textContent = sessionData.time;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-session";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      studySessions.splice(index, 1);
      displaySessions();
      saveSessions();
    });
    session.append(course, topic, time, remove);
    dayBox.append(session);
  });
}

function createSessionForm() {
  const form = document.createElement("div");
  form.classList.add("study-form");
  form.innerHTML = `<h3>Add Study Session</h3>
    <select class="study-day"><option value="">Select Day</option><option>Monday</option><option>Tuesday</option><option>Wednesday</option><option>Thursday</option><option>Friday</option><option>Saturday</option><option>Sunday</option></select>
    <input type="text" class="study-course" placeholder="Course name" maxlength="120">
    <input type="text" class="study-topic" placeholder="Topic to study" maxlength="300">
    <input type="time" class="study-time">
    <div class="form-buttons"><button type="button" class="save-session">Add Session</button><button type="button" class="cancel-session">Cancel</button></div>`;
  document.querySelector(".planner-card").prepend(form);
  form.querySelector(".cancel-session").addEventListener("click", () => form.remove());
  form.querySelector(".save-session").addEventListener("click", () => {
    const day = form.querySelector(".study-day").value;
    const course = form.querySelector(".study-course").value.trim();
    const topic = form.querySelector(".study-topic").value.trim();
    const time = form.querySelector(".study-time").value;
    if (!day || !course || !topic || !time) return window.alert("Please complete all the fields.");
    studySessions.push({ day, course, topic, time });
    form.remove();
    displaySessions();
    saveSessions();
  });
}

addStudyButton.addEventListener("click", createSessionForm);
clearScheduleButton.addEventListener("click", () => {
  if (!studySessions.length) return window.alert("There are no study sessions to clear.");
  if (!window.confirm("Are you sure you want to clear your entire schedule?")) return;
  studySessions = [];
  displaySessions();
  saveSessions();
});

async function loadSessions() {
  addStudyButton.disabled = true;
  clearScheduleButton.disabled = true;
  setPlannerStatus("Loading your schedule...");
  try {
    const response = await fetch("/api/student-tools/planner", { headers: { Authorization: `Bearer ${plannerToken}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Could not load your schedule.");
    if (Array.isArray(result.data)) {
      studySessions = result.data;
      cacheSessions();
      setPlannerStatus("Your account schedule is loaded.");
    } else if (studySessions.length) {
      setPlannerStatus("Moving your existing schedule to your account...");
      saveSessions();
    } else {
      setPlannerStatus("Your schedule will be saved to your account.");
    }
  } catch (error) {
    setPlannerStatus(`${error.message} Your browser copy is still available.`);
  } finally {
    displaySessions();
    addStudyButton.disabled = false;
    clearScheduleButton.disabled = false;
  }
}

if (plannerToken) loadSessions();
else setPlannerStatus("Sign in to save your schedule to your account.");
