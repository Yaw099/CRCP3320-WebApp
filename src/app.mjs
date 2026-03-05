import "dotenv/config";
import express from 'express';
import indexRoutes from "./routes/index.js";
import gameRoutes from "./routes/game.js";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Mount routes
app.use("/", indexRoutes);
app.use("/api/game", gameRoutes);

app.listen(port, () => {
  console.log(`Minesweeper Arcade backend running on http://localhost:${port}`);
});


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
*/