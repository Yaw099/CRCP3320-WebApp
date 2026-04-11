import "dotenv/config";
import express from 'express';
import indexRoutes from "./routes/index.js";
import gameRoutes from "./routes/game.js";
import authRoutes from './routes/auth.js';
import { pool } from "./db.mjs";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// const r = await pool.query("SELECT current_database() AS db, inet_server_addr() AS addr, inet_server_port() AS port");
// console.log("DB:", r.rows[0]);

// Mount routes
app.use('/api/auth', authRoutes);
app.use("/", indexRoutes);
app.use("/api/game", gameRoutes);




app.listen(port, () => {
  console.log(`Minesweeper Arcade backend running on http://localhost:${port}`);
});

export default app;


//  http://localhost:3000/api/game/start

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