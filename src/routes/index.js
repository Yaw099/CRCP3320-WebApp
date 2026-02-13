import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  res.json({
    name: "Minesweeper Arcade API",
    status: "running",
    version: "0.1.0",
    message: "Welcome to the backend service."
  });
});

export default router;