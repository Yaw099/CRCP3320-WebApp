import { Router } from "express";
import { pool } from "../db.mjs";
import crypto from "crypto";
import { generateBoard, key as cellKey } from "../game/board.mjs";
import optionalAuth from "../middleware/optionalAuth.js";
import requireAuth from "../middleware/requireAuth.js";


const router = Router();
const sessionState = new Map();

// Temporary in-memory mock data
const difficulties = [
  { name: "easy", width: 8, height: 8, mines: 10 },
  { name: "medium", width: 16, height: 16, mines: 40 },
  { name: "hard", width: 30, height: 16, mines: 99 }
];

async function getSessionById(id) {
  const dbRes = await pool.query(
    `SELECT id, user_id, width, height, mines, seed, result, first_click_x, first_click_y, created_at
     FROM game_sessions
     WHERE id = $1`,
    [id]
  );
  return dbRes.rowCount ? dbRes.rows[0] : null;
}

function canAccessSession(req, session) {
  if (session.user_id === null) return true; // guest session
  if (!req.user) return false;
  return req.user.id === session.user_id;
}

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
        win_rate: winRate, // decimal (0.0–1.0).
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

router.get("/my-stats", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Number(req.query.limit ?? 10);

    if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
      return res.status(400).json({ error: "limit must be an integer between 1 and 100" });
    }

    const totalsRes = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE result IS NOT NULL) AS total_games,
         COUNT(*) FILTER (WHERE result = 'win') AS wins,
         COUNT(*) FILTER (WHERE result = 'lose') AS losses
       FROM game_sessions
       WHERE user_id = $1`,
      [userId]
    );

    const bestTimesRes = await pool.query(
      `SELECT difficulty, MIN(time_elapsed) AS best_time
       FROM game_sessions
       WHERE user_id = $1 AND result = 'win'
       GROUP BY difficulty
       ORDER BY difficulty`,
      [userId]
    );

    const recentRes = await pool.query(
      `SELECT id, user_id, difficulty, width, height, mines, result, time_elapsed, moves, created_at
       FROM game_sessions
       WHERE user_id = $1 AND result IS NOT NULL
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    const totalsRow = totalsRes.rows[0];
    const totalGames = Number(totalsRow.total_games ?? 0);
    const wins = Number(totalsRow.wins ?? 0);
    const losses = Number(totalsRow.losses ?? 0);

    res.json({
      totals: {
        total_games: totalGames,
        wins,
        losses,
        win_rate: totalGames > 0 ? wins / totalGames : 0,
      },
      best_time_by_difficulty: bestTimesRes.rows.map((r) => ({
        difficulty: r.difficulty,
        best_time: r.best_time === null ? null : Number(r.best_time),
      })),
      recent_history: recentRes.rows,
    });
  } catch (err) {
    console.error("GET /my-stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/sessions/:id/complete", optionalAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { result, moves } = req.body ?? {};

    if (!req.body) {
      return res.status(400).json({ error: "Request body is required" });
    }

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid session id" });
    }

    if (result !== "win" && result !== "lose") {
      return res.status(400).json({ error: "result must be 'win' or 'lose'" });
    }

    if (!Number.isInteger(moves) || moves < 0) {
      return res.status(400).json({ error: "moves must be a non-negative integer" });
    }

    const s = await getSessionById(id);
    if (!s) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (!canAccessSession(req, s)) {
      return res.status(403).json({ error: "Forbidden: session belongs to another user" });
    }

    const dbRes = await pool.query(
      `UPDATE game_sessions
       SET result = $1,
           moves = $2,
           end_time = NOW(),
           time_elapsed = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at))))
       WHERE id = $3 AND result IS NULL
       RETURNING id, user_id, difficulty, width, height, mines, result, time_elapsed, moves, created_at, end_time`,
      [result, moves, id]
    );

    if (dbRes.rowCount === 0) {
      return res.status(404).json({ error: "Session not found or already completed" });
    }

    res.json({
      message: "Session completed",
      session: dbRes.rows[0],
    });
  } catch (err) {
    console.error("PATCH /sessions/:id/complete error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


router.post("/start", optionalAuth, async (req, res) => {
  try {
    const { difficulty } = req.body;

    const selected = difficulties.find((d) => d.name === difficulty);

    if (!selected) {
      return res.status(400).json({ error: "Invalid difficulty" });
    }

    const userId = req.user?.id ?? null;
    const seed = makeSeed();

    const result = await pool.query(
      `INSERT INTO game_sessions (user_id, difficulty, width, height, mines, seed)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, difficulty, width, height, mines, seed, created_at`,
      [userId, selected.name, selected.width, selected.height, selected.mines, seed]
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


router.get("/sessions/:id/board", optionalAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const safeX = Number(req.query.safe_x);
    const safeY = Number(req.query.safe_y);

    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid session id" });
    if (!Number.isInteger(safeX) || !Number.isInteger(safeY)) {
      return res.status(400).json({ error: "safe_x and safe_y must be integers" });
    }

    const dbRes = await pool.query(
      `SELECT id, user_id, width, height, mines, seed
       FROM game_sessions
       WHERE id = $1`,
      [id]
    );
    if (dbRes.rowCount === 0) return res.status(404).json({ error: "Session not found" });

    const s = dbRes.rows[0];

    if (!canAccessSession(req, s)) {
      return res.status(403).json({ error: "Forbidden: session belongs to another user" });
    }

    const board = generateBoard({
      width: s.width,
      height: s.height,
      mines: s.mines,
      seed: Number(s.seed),
      safeX,
      safeY,
    });

    // For now, return the full board including mines (debug).
    res.json({ session_id: s.id, safe: { x: safeX, y: safeY }, board });
  } catch (err) {
    console.error("GET /sessions/:id/board error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/leaderboard", async (req, res) => {
  try {
    const { difficulty, limit = "10" } = req.query;

    if (!difficulty || !difficulties.some((d) => d.name === difficulty)) {
      return res.status(400).json({
        error: "difficulty must be one of: easy, medium, hard",
      });
    }

    const parsedLimit = Number(limit);

    if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
      return res.status(400).json({
        error: "limit must be a positive integer",
      });
    }

    const safeLimit = Math.min(parsedLimit, 100);

    const dbRes = await pool.query(
      `SELECT 
        gs.id,
        gs.user_id,
        u.username,
        gs.difficulty,
        gs.time_elapsed,
        gs.moves,
        gs.created_at
      FROM game_sessions gs
      LEFT JOIN users u ON gs.user_id = u.id
      WHERE gs.difficulty = $1
        AND gs.result = 'win'
        AND gs.time_elapsed IS NOT NULL
        AND gs.moves IS NOT NULL
      ORDER BY gs.time_elapsed ASC, gs.moves ASC, gs.created_at ASC
      LIMIT $2`,
      [difficulty, safeLimit]
    );

    const leaderboard = dbRes.rows.map((row, index) => ({
      rank: index + 1,
      id: row.id,
      user_id: row.user_id,
      username: row.username ?? null,
      difficulty: row.difficulty,
      time_elapsed: row.time_elapsed,
      moves: row.moves,
      created_at: row.created_at,
    }));

    res.json({
      difficulty,
      limit: safeLimit,
      total_results: leaderboard.length,
      leaderboard,
    });
  } catch (err) {
    console.error("GET /leaderboard error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/sessions/:id/reveal", optionalAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const x = Number(req.body?.x);
    const y = Number(req.body?.y);

    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid session id" });
    if (!Number.isInteger(x) || !Number.isInteger(y)) return res.status(400).json({ error: "x and y must be integers" });

    // Load session config + first click
    const dbRes = await pool.query(
      `SELECT id, user_id, width, height, mines, seed, result, first_click_x, first_click_y
       FROM game_sessions
       WHERE id = $1`,
      [id]
    );
    if (dbRes.rowCount === 0) return res.status(404).json({ error: "Session not found" });

    const s = dbRes.rows[0];

    if (!canAccessSession(req, s)) {
      return res.status(403).json({ error: "Forbidden: session belongs to another user" });
    }

    // block further play
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
      // Optional: immediately mark DB as lose 
      await pool.query(
        `UPDATE game_sessions
        SET result = 'lose',
            end_time = NOW(),
            time_elapsed = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at)))),
            moves = $2
        WHERE id = $1 AND result IS NULL`,
        [id, st.moves]
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
        `UPDATE game_sessions
        SET result = 'win',
            end_time = NOW(),
            time_elapsed = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at)))),
            moves = $2
        WHERE id = $1 AND result IS NULL`,
        [id, st.moves]
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


router.post("/sessions/:id/flag", optionalAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const x = Number(req.body?.x);
    const y = Number(req.body?.y);

    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid session id" });
    if (!Number.isInteger(x) || !Number.isInteger(y)) return res.status(400).json({ error: "x and y must be integers" });

    const dbRes = await pool.query(
      `SELECT id, user_id, width, height, result
       FROM game_sessions
       WHERE id = $1`,
      [id]
    );
    if (dbRes.rowCount === 0) return res.status(404).json({ error: "Session not found" });

    const s = dbRes.rows[0];

    if (!canAccessSession(req, s)) {
      return res.status(403).json({ error: "Forbidden: session belongs to another user" });
    }

    // block further actions
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




/*
node src/app.mjs

Example cURL commands:

curl http://127.0.0.1:3000/

curl http://127.0.0.1:3000/api/game/difficulties

curl -X POST "http://127.0.0.1:3000/api/game/start" \
  -H "Content-Type: application/json" \
  -d '{"difficulty":"easy"}'


curl -X POST "http://127.0.0.1:3000/api/game/sessions/ID/reveal" \
  -H "Content-Type: application/json" \
  -d '{"x":0,"y":0}'


curl -X POST "http://127.0.0.1:3000/api/game/sessions/ID/flag" \
  -H "Content-Type: application/json" \
  -d '{"x":1,"y":1}'


curl -X PATCH "http://127.0.0.1:3000/api/game/sessions/ID/complete" \
  -H "Content-Type: application/json" \
  -d '{"result":"win","moves":10}'


curl "http://127.0.0.1:3000/api/game/leaderboard?difficulty=easy&limit=10"


curl "http://127.0.0.1:3000/api/game/stats?user_id=1&limit=10"


curl "http://127.0.0.1:3000/api/game/leaderboard?difficulty=invalid"

eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MywidXNlcm5hbWUiOiJ1c2VyMSIsImlhdCI6MTc3NTg2OTc0MiwiZXhwIjoxNzc1ODczMzQyfQ.agiO1yWlRgFxuCoTKekPHE7ATTIgExq4xwtvDQGeVTQ

eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NCwidXNlcm5hbWUiOiJ1c2VyMiIsImlhdCI6MTc3NTg2OTc2NCwiZXhwIjoxNzc1ODczMzY0fQ.YSeGu8dXAs6klnYGdjQleb6f8CAs8AAOpskdqK4t24g


Demo 4:


Register new user:

curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"demo1","email":"demo1@example.com","password":"Password123!"}'

Login and get token:

curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo1@example.com","password":"Password123!"}'

TOKEN=""

Verify Login:

curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"


Create session:

curl -X POST http://localhost:3000/api/game/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"difficulty":"easy"}'

SESSION_ID=

Complete session:

curl -X PATCH http://localhost:3000/api/game/sessions/$SESSION_ID/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"result":"win","moves":18}'


Create a second session:

curl -X POST http://localhost:3000/api/game/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"difficulty":"easy"}'

  curl -X PATCH http://localhost:3000/api/game/sessions/$SESSION_ID/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"result":"loss","moves":7}'


Leaderboard:

curl "http://localhost:3000/api/game/leaderboard?difficulty=easy&limit=10"


Player stats:

curl http://localhost:3000/api/game/stats \
  -H "Authorization: Bearer $TOKEN"



Auth Protection:

curl -X POST http://localhost:3000/api/game/start \
  -H "Content-Type: application/json" \
  -d '{"difficulty":"easy"}'


curl http://localhost:3000/api/auth/me

*/