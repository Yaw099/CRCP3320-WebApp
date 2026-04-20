import { generateBoard, key } from "/game/board.mjs";

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const difficultyEl = document.getElementById("difficulty");
const newGameBtn = document.getElementById("new-game");

const state = {
  sessionId: null,
  width: 0,
  height: 0,
  mines: 0,
  seed: null,
  status: "ready",
  board: [],
  revealed: new Set(),
  flagged: new Set(),
  firstRevealDone: false,
};

function resetState(session) {
  state.sessionId = session.id;
  state.width = session.width;
  state.height = session.height;
  state.mines = session.mines;
  state.seed = Number(session.seed);
  state.status = "playing";
  state.board = [];
  state.revealed = new Set();
  state.flagged = new Set();
  state.firstRevealDone = false;

  statusEl.textContent = "Status: Playing";
}

async function startGame() {
  try {
    const difficulty = difficultyEl.value;
    console.log("Starting game with difficulty:", difficulty);

    const res = await fetch("/api/game/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ difficulty }),
    });

    console.log("Response status:", res.status);

    const data = await res.json();
    console.log("Response data:", data);

    if (!res.ok) {
      statusEl.textContent = `Error: ${data.error || "Could not start game"}`;
      return;
    }

    resetState(data.session);
    renderBoard();
  } catch (err) {
    console.error("startGame error:", err);
    statusEl.textContent = "Error: Could not start game";
  }
}

function renderBoard() {
  boardEl.innerHTML = "";
  boardEl.style.gridTemplateColumns = `repeat(${state.width}, 32px)`;

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const cellBtn = document.createElement("button");
      cellBtn.className = "cell";

      const cellKey = key(x, y);
      const isRevealed = state.revealed.has(cellKey);
      const isFlagged = state.flagged.has(cellKey);

      if (isRevealed && state.board.length) {
        const cell = state.board[y][x];
        cellBtn.classList.add("revealed");

        if (cell.mine) {
          cellBtn.classList.add("mine");
          cellBtn.textContent = "*";
        } else if (cell.adj > 0) {
          cellBtn.textContent = String(cell.adj);
        }
      } else if (isFlagged) {
        cellBtn.classList.add("flagged");
        cellBtn.textContent = "F";
      }

      cellBtn.addEventListener("click", () => handleReveal(x, y));
      cellBtn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        handleFlag(x, y);
      });

      boardEl.appendChild(cellBtn);
    }
  }
}

function handleReveal(x, y) {
  if (state.status !== "playing") return;

  const cellKey = key(x, y);

  if (state.flagged.has(cellKey) || state.revealed.has(cellKey)) {
    return;
  }

  if (!state.firstRevealDone) {
    state.board = generateBoard({
      width: state.width,
      height: state.height,
      mines: state.mines,
      seed: state.seed,
      safeX: x,
      safeY: y,
    });
    state.firstRevealDone = true;
  }

  revealCell(x, y);
  checkWin();
  renderBoard();
}

function handleFlag(x, y) {
  if (state.status !== "playing") return;

  const cellKey = key(x, y);

  if (state.revealed.has(cellKey)) return;

  if (state.flagged.has(cellKey)) {
    state.flagged.delete(cellKey);
  } else {
    state.flagged.add(cellKey);
  }

  renderBoard();
}

function revealCell(x, y) {
  const cellKey = key(x, y);

  if (state.revealed.has(cellKey) || state.flagged.has(cellKey)) {
    return;
  }

  state.revealed.add(cellKey);

  const cell = state.board[y][x];

  if (cell.mine) {
    state.status = "lost";
    statusEl.textContent = "Status: Lost";
    revealAllMines();
    return;
  }

  if (cell.adj === 0) {
    floodReveal(x, y);
  }
}

function floodReveal(startX, startY) {
  const queue = [[startX, startY]];
  const dirs = [
    [-1, -1], [0, -1], [1, -1],
    [-1,  0],          [1,  0],
    [-1,  1], [0,  1], [1,  1],
  ];

  while (queue.length > 0) {
    const [x, y] = queue.shift();

    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;

      if (nx < 0 || nx >= state.width || ny < 0 || ny >= state.height) {
        continue;
      }

      const neighborKey = key(nx, ny);

      if (state.revealed.has(neighborKey) || state.flagged.has(neighborKey)) {
        continue;
      }

      state.revealed.add(neighborKey);

      const neighbor = state.board[ny][nx];

      if (!neighbor.mine && neighbor.adj === 0) {
        queue.push([nx, ny]);
      }
    }
  }
}

function revealAllMines() {
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (state.board[y][x].mine) {
        state.revealed.add(key(x, y));
      }
    }
  }
}

function checkWin() {
  const totalCells = state.width * state.height;
  const safeCells = totalCells - state.mines;

  if (state.revealed.size === safeCells) {
    state.status = "won";
    statusEl.textContent = "Status: Won";
  }
}

newGameBtn.addEventListener("click", startGame);

startGame();