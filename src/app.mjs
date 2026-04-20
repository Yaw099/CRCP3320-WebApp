import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import indexRoutes from "./routes/index.js";
import authRoutes from "./routes/auth.js";
import gameRoutes from "./routes/game.js";

const app = express();
const port = process.env.PORT || 3000;

// Needed in ES modules for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(express.json());

// Serve frontend files from src/public
app.use(express.static(path.join(__dirname, "public")));
app.use("/game", express.static(path.join(__dirname, "game")));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/game", gameRoutes);
app.use("/api", indexRoutes);

// Optional health/root route
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});


// demo  

//http://localhost:3000/api/game/start

// node src/app.mjs

// npm start
// npm run dev

/*

{
  "difficulty": "easy"
}

*/


/*
curl -X POST http://127.0.0.1:3000/api/game/session \
  -H "Content-Type: application/json" \
  -d '{"difficulty":"easy"}'

docker exec -it minesweeper_db psql -U postgres -d minesweeper_arcade
SELECT id, difficulty, seed FROM game_sessions;


curl http://127.0.0.1:3000/api/game/stats
curl "http://127.0.0.1:3000/api/game/stats?user_id=1"


docker exec -i minesweeper_db psql -U postgres -d minesweeper_arcade < src/db/schema.sql
*/