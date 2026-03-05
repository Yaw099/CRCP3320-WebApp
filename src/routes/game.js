import { Router } from "express";
import { pool } from "../db.mjs";
import crypto from "crypto";
import { generateBoard, key as cellKey } from "../game/board.mjs";

const router = Router();
const sessionState = new Map();
const flags_count = st.flagged.size;
const mines_remaining = Math.max(0, Number(s.mines) - flags_count);

// Temporary in-memory mock data
const difficulties = [
  { name: "easy", width: 8, height: 8, mines: 10 },
  { name: "medium", width: 16, height: 16, mines: 40 },
  { name: "hard", width: 30, height: 16, mines: 99 }
];

function inBounds(x, y, w, h) {
  return x >= 0 && x < w && y >= 0 && y < h;
}

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


router.get("/sessions/:id/board", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const safeX = Number(req.query.safe_x);
    const safeY = Number(req.query.safe_y);

    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid session id" });
    if (!Number.isInteger(safeX) || !Number.isInteger(safeY)) {
      return res.status(400).json({ error: "safe_x and safe_y must be integers" });
    }

    const dbRes = await pool.query(
      `SELECT id, width, height, mines, seed
       FROM game_sessions
       WHERE id = $1`,
      [id]
    );
    if (dbRes.rowCount === 0) return res.status(404).json({ error: "Session not found" });

    const s = dbRes.rows[0];

    const board = generateBoard({
      width: s.width,
      height: s.height,
      mines: s.mines,
      seed: Number(s.seed),
      safeX,
      safeY,
    });

    // For now we return the full board including mines (debug).
    // Later, for real gameplay, you will NOT send mines to the client.
    res.json({ session_id: s.id, safe: { x: safeX, y: safeY }, board });
  } catch (err) {
    console.error("GET /sessions/:id/board error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


router.post("/sessions/:id/reveal", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const x = Number(req.body?.x);
    const y = Number(req.body?.y);

    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid session id" });
    if (!Number.isInteger(x) || !Number.isInteger(y)) return res.status(400).json({ error: "x and y must be integers" });

    // Load session config + first click
    const dbRes = await pool.query(
      `SELECT id, width, height, mines, seed, result, first_click_x, first_click_y
       FROM game_sessions
       WHERE id = $1`,
      [id]
    );
    if (dbRes.rowCount === 0) return res.status(404).json({ error: "Session not found" });

    const s = dbRes.rows[0];

    // If you treat "result" as completed, block further play
    if (s.result !== null) {
      return res.status(409).json({ error: "Session already completed", result: s.result });
    }

    if (!inBounds(x, y, s.width, s.height)) {
      return res.status(400).json({ error: "Move out of bounds" });
    }

    // Initialize or get in-memory state
    let st = sessionState.get(id);
    if (!st) {
      st = { revealed: new Set(), flagged: new Set(), moves: 0, status: "playing" };
      sessionState.set(id, st);
    }

    if (st.status !== "playing") {
      return res.status(409).json({ error: "Game is not in playing state", status: st.status });
    }

    const k = cellKey(x, y);
    if (st.flagged.has(k)) {
      // common behavior: clicking a flag does nothing
      return res.json({ status: st.status, moves: st.moves, revealed: [], message: "Tile is flagged" });
    }

    // If first click not set, set it now (Option A)
    let safeX = s.first_click_x;
    let safeY = s.first_click_y;

    if (!Number.isInteger(safeX) || !Number.isInteger(safeY)) {
      await pool.query(
        `UPDATE game_sessions
         SET first_click_x = $1, first_click_y = $2
         WHERE id = $3`,
        [x, y, id]
      );
      safeX = x;
      safeY = y;
    }

    // Regenerate truth board deterministically from seed + safe cell
    const board = generateBoard({
      width: s.width,
      height: s.height,
      mines: s.mines,
      seed: Number(s.seed),
      safeX,
      safeY,
    });

    // If already revealed, no-op but still return
    if (st.revealed.has(k)) {
      return res.json({ status: st.status, moves: st.moves, revealed: [] });
    }

    st.moves += 1;

    // Loss check
    if (board[y][x].mine) {
      st.status = "lost";
      // Optional: immediately mark DB as lose (if you want server-authoritative results)
      await pool.query(
        `UPDATE game_sessions SET result = 'lose' WHERE id = $1 AND result IS NULL`,
        [id]
      );
      return res.json({ status: st.status, moves: st.moves, revealed: [{ x, y, adj: null }], hit_mine: true });
    }

    // Reveal with flood-fill when adj == 0 (FR5.3)
    const revealedNow = [];
    const queue = [[x, y]];

    while (queue.length) {
      const [cx, cy] = queue.shift();
      const ck = cellKey(cx, cy);
      if (st.revealed.has(ck)) continue;
      if (st.flagged.has(ck)) continue;

      st.revealed.add(ck);
      const adj = board[cy][cx].adj;
      revealedNow.push({ x: cx, y: cy, adj });

      if (adj === 0) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx, ny = cy + dy;
            if (!inBounds(nx, ny, s.width, s.height)) continue;
            const nk = cellKey(nx, ny);
            if (!st.revealed.has(nk) && !st.flagged.has(nk)) {
              queue.push([nx, ny]);
            }
          }
        }
      }
    }

    // Win check (FR5.4)
    const totalCells = s.width * s.height;
    const safeCells = totalCells - s.mines;
    if (st.revealed.size >= safeCells) {
      st.status = "won";
      await pool.query(
        `UPDATE game_sessions SET result = 'win' WHERE id = $1 AND result IS NULL`,
        [id]
      );
    }

    return res.json({
      status: st.status,
      moves: st.moves,
      revealed: revealedNow,
      hit_mine: false,
    });
  } catch (err) {
    console.error("POST /sessions/:id/reveal error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


router.post("/sessions/:id/flag", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const x = Number(req.body?.x);
    const y = Number(req.body?.y);

    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid session id" });
    if (!Number.isInteger(x) || !Number.isInteger(y)) return res.status(400).json({ error: "x and y must be integers" });

    const dbRes = await pool.query(
      `SELECT id, width, height, result
       FROM game_sessions
       WHERE id = $1`,
      [id]
    );
    if (dbRes.rowCount === 0) return res.status(404).json({ error: "Session not found" });

    const s = dbRes.rows[0];

    // If you use DB result as “final,” block further actions
    if (s.result !== null) {
      return res.status(409).json({ error: "Session already completed", result: s.result });
    }

    if (!inBounds(x, y, s.width, s.height)) {
      return res.status(400).json({ error: "Out of bounds" });
    }

    let st = sessionState.get(id);
    if (!st) {
      st = { revealed: new Set(), flagged: new Set(), moves: 0, status: "playing" };
      sessionState.set(id, st);
    }

    if (st.status !== "playing") {
      return res.status(409).json({ error: "Game is not in playing state", status: st.status });
    }

    const k = cellKey(x, y);

    // Can't flag revealed tiles
    if (st.revealed.has(k)) {
      return res.json({ status: st.status, moves: st.moves, x, y, flagged: false, message: "Already revealed" });
    }

    // Toggle
    if (st.flagged.has(k)) st.flagged.delete(k);
    else st.flagged.add(k);

    st.moves += 1;

    return res.json({
      status: st.status,
      moves: st.moves,
      x,
      y,
      flagged: st.flagged.has(k),
    });
  } catch (err) {
    console.error("POST /sessions/:id/flag error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


export default router;
