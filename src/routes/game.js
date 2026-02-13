import { Router } from "express";

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

router.post("/start", (req, res) => {
  const { difficulty } = req.body;

  const selected = difficulties.find(d => d.name === difficulty);

  if (!selected) {
    return res.status(400).json({ error: "Invalid difficulty" });
  }

  res.json({
    message: "Game session created (mock)",
    settings: selected,
    sessionId: Date.now()
  });
});

export default router;
