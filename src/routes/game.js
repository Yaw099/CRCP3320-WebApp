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

// GET /api/game/stats?user_id=123&limit=10
router.get("/stats", async (req, res) => {
  try {
    const rawUserId = req.query.user_id;
    const limit = Number(req.query.limit ?? 10);

    if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
      return res.status(400).json({ error: "limit must be an integer between 1 and 100" });
    }

    // If user_id is omitted, return overall stats across all sessions (useful during dev).
    // If you want “guest stats” specifically, change filter to `user_id IS NULL` when rawUserId is missing.
    let filterSql = "";
    let params = [];
    if (rawUserId !== undefined) {
      const userId = Number(rawUserId);
      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ error: "user_id must be a positive integer" });
      }
      filterSql = "WHERE user_id = $1";
      params = [userId];
    }

    // 1) Totals: games played / wins / losses + win rate
    const totalsQuery = `
      SELECT
        COUNT(*) FILTER (WHERE result IS NOT NULL)                        AS total_games,
        COUNT(*) FILTER (WHERE result = 'win')                            AS wins,
        COUNT(*) FILTER (WHERE result = 'lose')                           AS losses
      FROM game_sessions
      ${filterSql};
    `;
    const totalsRes = await pool.query(totalsQuery, params);
    const totalsRow = totalsRes.rows[0];

    const totalGames = Number(totalsRow.total_games ?? 0);
    const wins = Number(totalsRow.wins ?? 0);
    const losses = Number(totalsRow.losses ?? 0);
    const winRate = totalGames > 0 ? wins / totalGames : 0;

    // 2) Best time per difficulty (wins only)
    const bestTimesQuery = `
      SELECT difficulty, MIN(time_elapsed) AS best_time
      FROM game_sessions
      ${filterSql ? `${filterSql} AND result = 'win'` : "WHERE result = 'win'"}
      GROUP BY difficulty
      ORDER BY difficulty;
    `;
    const bestTimesRes = await pool.query(bestTimesQuery, params);

    // 3) Recent completed history (wins/losses)
    const recentQuery = `
      SELECT id, user_id, difficulty, width, height, mines, result, time_elapsed, moves, created_at
      FROM game_sessions
      ${filterSql ? `${filterSql} AND result IS NOT NULL` : "WHERE result IS NOT NULL"}
      ORDER BY created_at DESC
      LIMIT ${limit};
    `;
    const recentRes = await pool.query(recentQuery, params);

    res.json({
      totals: {
        total_games: totalGames,
        wins,
        losses,
        win_rate: winRate, // decimal (0.0–1.0). If you prefer percent, multiply by 100 on the client.
      },
      best_time_by_difficulty: bestTimesRes.rows.map((r) => ({
        difficulty: r.difficulty,
        best_time: r.best_time === null ? null : Number(r.best_time),
      })),
      recent_history: recentRes.rows,
    });
  } catch (err) {
    console.error("GET /stats error:", err);
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
