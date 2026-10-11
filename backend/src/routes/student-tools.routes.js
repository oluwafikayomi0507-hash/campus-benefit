const express = require("express");
const pool = require("../config/db");
const requireAuth = require("../middlewares/auth.middleware");

const router = express.Router();
const toolNames = new Set(["planner", "semester-goals"]);
const weekDays = new Set(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);

function cleanList(tool, data) {
  if (!Array.isArray(data) || data.length > 100) return null;
  if (tool === "planner") {
    const sessions = [];
    for (const item of data) {
      if (!item || !weekDays.has(item.day) || typeof item.course !== "string" || typeof item.topic !== "string" || typeof item.time !== "string") return null;
      const course = item.course.trim();
      const topic = item.topic.trim();
      if (!course || course.length > 120 || !topic || topic.length > 300 || !/^\d{2}:\d{2}$/.test(item.time)) return null;
      sessions.push({ day: item.day, course, topic, time: item.time });
    }
    return sessions;
  }

  const goals = [];
  for (const item of data) {
    if (!item || typeof item.title !== "string" || typeof item.description !== "string" || typeof item.date !== "string" || typeof item.completed !== "boolean") return null;
    const title = item.title.trim();
    const description = item.description.trim();
    if (!title || title.length > 180 || !description || description.length > 1000 || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return null;
    goals.push({ title, description, date: item.date, completed: item.completed });
  }
  return goals;
}

router.use(requireAuth);

router.get("/:tool", async (req, res) => {
  const { tool } = req.params;
  if (!toolNames.has(tool)) return res.status(404).json({ message: "Student tool not found." });
  try {
    const result = await pool.query(
      "SELECT data, updated_at FROM student_tool_data WHERE user_id = $1 AND tool_name = $2",
      [req.user.id, tool]
    );
    return res.json({ data: result.rows[0]?.data ?? null, updatedAt: result.rows[0]?.updated_at ?? null });
  } catch (error) {
    console.error("Could not load student tool data:", error.message);
    return res.status(500).json({ message: "Could not load your saved data." });
  }
});

router.put("/:tool", async (req, res) => {
  const { tool } = req.params;
  if (!toolNames.has(tool)) return res.status(404).json({ message: "Student tool not found." });
  const data = cleanList(tool, req.body?.data);
  if (!data) return res.status(400).json({ message: "Check the information and keep the list to 100 items or fewer." });
  try {
    const result = await pool.query(
      `INSERT INTO student_tool_data (user_id, tool_name, data)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (user_id, tool_name)
       DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
       RETURNING updated_at`,
      [req.user.id, tool, JSON.stringify(data)]
    );
    return res.json({ message: "Saved to your account.", updatedAt: result.rows[0].updated_at });
  } catch (error) {
    console.error("Could not save student tool data:", error.message);
    return res.status(500).json({ message: "Could not save your changes." });
  }
});

module.exports = router;
