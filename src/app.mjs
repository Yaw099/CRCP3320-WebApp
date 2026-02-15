import express from 'express';
import indexRoutes from "./routes/index.js";
import gameRoutes from "./routes/game.js";

const app = express();
const port = 3000;

app.use(express.json());

// Mount routes
app.use("/", indexRoutes);
app.use("/api/game", gameRoutes);

app.listen(port, () => {
  console.log(`Minesweeper Arcade backend running on http://localhost:${port}`);
});


//  http://localhost:3000/api/game/start

/*

{
  "difficulty": "easy"
}

*/