const addCourseButton = document.querySelector(".add-course");
const removeCourseButton = document.querySelector(".remove-course");
const calculateButton = document.querySelector(".calculate-cgpa");

addCourseButton.addEventListener("click", () => {
    const courseRow = document.querySelector(".course-row");
    const newCourse = courseRow.cloneNode(true);

    newCourse.querySelector('input[type="text"]').value = "";
    newCourse.querySelector('input[type="number"]').value = "";
    newCourse.querySelector("select").value = "";

    courseRow.parentNode.insertBefore(newCourse, addCourseButton);
});

removeCourseButton.addEventListener("click", () => {
    const allCourses = document.querySelectorAll(".course-row");

    if (allCourses.length > 1) {
        allCourses[allCourses.length - 1].remove();
    } else {
        alert("You need at least one course.");
    }
});

calculateButton.addEventListener("click", () => {
    const courses = document.querySelectorAll(".course-row");

    let totalPoints = 0;
    let totalUnits = 0;

    for (const course of courses) {
        const courseName = course.querySelector('input[type="text"]').value.trim();
        const units = Number(
            course.querySelector('input[type="number"]').value
        );
        const grade = course.querySelector("select").value;

        if (!courseName || !units || grade === "") {
            alert("Please complete all course details.");
            return;
        }

        totalPoints += units * Number(grade);
        totalUnits += units;
    }

    const cgpa = totalPoints / totalUnits;

    document.querySelector("#cgpa-value").textContent =
        cgpa.toFixed(2);
});