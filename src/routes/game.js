import { Router } from "express";
import { pool } from "../db.mjs";

const router = Router();

// Temporary in-memory mock data
const difficulties = [
  { name: "easy", width: 8, height: 8, mines: 10 },
  { name: "medium", width: 16, height: 16, mines: 40 },
  { name: "hard", width: 30, height: 16, mines: 99 }
];

router.get("/difficulties", (req, res) => {
  res.json(difficulties);
});

router.get("/sessions", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, difficulty, width, height, mines, result, time_elapsed, moves, created_at
       FROM game_sessions
       ORDER BY created_at DESC
       LIMIT 10`
    );

    res.json({ sessions: result.rows });
  } catch (err) {
    console.error("GET /sessions error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/start", async (req, res) => {
  try {
    const { difficulty } = req.body;

    const selected = difficulties.find((d) => d.name === difficulty);

    if (!selected) {
      return res.status(400).json({ error: "Invalid difficulty" });
    }

    const result = await pool.query(
      `INSERT INTO game_sessions (difficulty, width, height, mines)
       VALUES ($1, $2, $3, $4)
       RETURNING id, difficulty, width, height, mines, created_at`,
      [selected.name, selected.width, selected.height, selected.mines]
    );

    res.json({
      message: "Game session created",
      session: result.rows[0],
    });
  } catch (err) {
    console.error("POST /start error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
