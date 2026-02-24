import { Router } from "express";
import { pool } from "../db.mjs";
import crypto from "crypto";

const router = Router();

// Temporary in-memory mock data
const difficulties = [
  { name: "easy", width: 8, height: 8, mines: 10 },
  { name: "medium", width: 16, height: 16, mines: 40 },
  { name: "hard", width: 30, height: 16, mines: 99 }
];

function makeSeed() {
  return crypto.randomInt(0, 2 ** 31);
}

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

router.patch("/sessions/:id/complete", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { result, time_elapsed, moves } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid session id" });
    }

    if (result !== "win" && result !== "lose") {
      return res.status(400).json({ error: "result must be 'win' or 'lose'" });
    }

    if (!Number.isInteger(time_elapsed) || time_elapsed < 0) {
      return res.status(400).json({ error: "time_elapsed must be a non-negative integer" });
    }

    if (!Number.isInteger(moves) || moves < 0) {
      return res.status(400).json({ error: "moves must be a non-negative integer" });
    }

    const dbRes = await pool.query(
      `UPDATE game_sessions
       SET result = $1, time_elapsed = $2, moves = $3
       WHERE id = $4 AND result IS NULL
       RETURNING id, difficulty, width, height, mines, result, time_elapsed, moves, created_at`,
      [result, time_elapsed, moves, id]
    );

    if (dbRes.rowCount === 0) {
      return res.status(404).json({ error: "Session not found or already completed" });
    }

    res.json({ message: "Session completed", session: dbRes.rows[0] });
  } catch (err) {
    console.error("PATCH /sessions/:id/complete error:", err);
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

    const seed = makeSeed();

    const result = await pool.query(
      `INSERT INTO game_sessions (difficulty, width, height, mines, seed)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, difficulty, width, height, mines, seed, created_at`,
      [selected.name, selected.width, selected.height, selected.mines, seed]
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
