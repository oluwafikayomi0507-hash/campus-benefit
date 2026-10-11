const express = require("express");
const pool = require("../config/db");
const requireAuth = require("../middlewares/auth.middleware");

const router = express.Router();
const allowedTypes = new Set(["question", "problem", "suggestion", "complaint"]);

router.post("/messages", requireAuth, async (req, res) => {
  const type = typeof req.body?.type === "string" ? req.body.type.trim().toLowerCase() : "";
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!allowedTypes.has(type) || message.length < 5 || message.length > 3000) {
    return res.status(400).json({ message: "Choose a topic and write a message between 5 and 3,000 characters." });
  }

  try {
    const result = await pool.query(
      `INSERT INTO support_messages (student_id, message_type, message)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [req.user.id, type, message]
    );
    return res.status(201).json({
      message: `Your support message was sent. Reference number: ${result.rows[0].id}.`,
      id: result.rows[0].id,
    });
  } catch (error) {
    console.error("Could not save support message:", error.message);
    return res.status(500).json({ message: "Could not send your message. Please try again." });
  }
});

module.exports = router;
