import { generateBoard, key } from "/game/board.mjs";

const boardEl = document.getElementById("board");
const messageEl = document.getElementById("message");
const difficultyEl = document.getElementById("difficulty");
const timerEl = document.getElementById("timer");
const mineCountEl = document.getElementById("mine-count");
const newGameBtn = document.getElementById("new-game");

const leaderboardEl = document.getElementById("leaderboard");
const statsEl = document.getElementById("stats");

const authStatusEl = document.getElementById("auth-status");
const authMessageEl = document.getElementById("auth-message");
const usernameInput = document.getElementById("auth-username");
const emailInput = document.getElementById("auth-email");
const passwordInput = document.getElementById("auth-password");
const registerBtn = document.getElementById("register-btn");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");

const state = {
  sessionId: null,
  width: 0,
  height: 0,
  mines: 0,
  seed: null,
  status: "ready", // ready | playing | won | lost
  board: [],
  revealed: new Set(),
  flagged: new Set(),
  firstRevealDone: false,
  elapsedSeconds: 0,
  timerId: null,
};

function getToken() {
  return localStorage.getItem("token");
}

function setToken(token) {
  localStorage.setItem("token", token);
}

function clearToken() {
  localStorage.removeItem("token");
}

function authHeaders(extra = {}) {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

function formatSeconds(totalSeconds) {
  if (totalSeconds == null || Number.isNaN(Number(totalSeconds))) return "--:--";
  const n = Number(totalSeconds);
  const minutes = Math.floor(n / 60);
  const seconds = n % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateMineCount() {
  const minesLeft = state.mines - state.flagged.size;
  mineCountEl.textContent = `Mines: ${minesLeft}`;
}

function updateTimerDisplay() {
  timerEl.textContent = `Time: ${formatSeconds(state.elapsedSeconds)}`;
}

function updateMessage() {
  if (state.status === "won") {
    messageEl.textContent = `You won in ${formatSeconds(state.elapsedSeconds)}!`;
  } else if (state.status === "lost") {
    messageEl.textContent = `Game over after ${formatSeconds(state.elapsedSeconds)}.`;
  } else {
    messageEl.textContent = "";
  }
}

function stopTimer() {
  if (state.timerId !== null) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function startTimer() {
  if (state.timerId !== null) return;

  state.timerId = setInterval(() => {
    state.elapsedSeconds += 1;
    updateTimerDisplay();
  }, 1000);
}

function clearAuthInputs() {
  usernameInput.value = "";
  emailInput.value = "";
  passwordInput.value = "";
}

function resetState(session) {
  stopTimer();

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
  state.elapsedSeconds = 0;

  updateTimerDisplay();
  updateMineCount();
  updateMessage();
}

async function startGame() {
  try {
    const difficulty = difficultyEl.value;

    const res = await fetch("/api/game/start", {
      method: "POST",
      headers: authHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ difficulty }),
    });

    const data = await res.json();

    if (!res.ok) {
      messageEl.textContent = `Error: ${data.error || "Could not start game"}`;
      return;
    }

    resetState(data.session);
    renderBoard();
    await loadLeaderboard();
  } catch (err) {
    console.error("startGame error:", err);
    messageEl.textContent = "Error: Could not start game";
  }
}

function renderBoard() {
  boardEl.innerHTML = "";
  boardEl.style.gridTemplateColumns = `repeat(${state.width}, 32px)`;

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const cellBtn = document.createElement("button");
      cellBtn.className = "cell";
      cellBtn.type = "button";

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
  if (state.flagged.has(cellKey) || state.revealed.has(cellKey)) return;

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
    startTimer();
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

  updateMineCount();
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
    stopTimer();
    revealAllMines();
    updateMessage();
    void loadLeaderboard();
    void loadStats();
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

      const neighbor = state.board[ny][nx];
      if (neighbor.mine) continue;

      state.revealed.add(neighborKey);

      if (neighbor.adj === 0) {
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

async function submitCompletedGame(result) {
  if (!state.sessionId) return;

  try {
    await fetch(`/api/game/sessions/${state.sessionId}/complete`, {
      method: "PATCH",
      headers: authHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        result,
        moves: state.revealed.size + state.flagged.size,
      }),
    });
  } catch (err) {
    console.error("submitCompletedGame error:", err);
  }
}

function checkWin() {
  const totalCells = state.width * state.height;
  const safeCells = totalCells - state.mines;

  if (state.status === "playing" && state.revealed.size === safeCells) {
    state.status = "won";
    stopTimer();
    updateMessage();
    void submitCompletedGame("win");
    void loadLeaderboard();
    void loadStats();
  }
}

async function loadLeaderboard() {
  try {
    const difficulty = difficultyEl.value;
    const res = await fetch(
      `/api/game/leaderboard?difficulty=${encodeURIComponent(difficulty)}&limit=10`
    );
    const data = await res.json();

    if (!res.ok) {
      leaderboardEl.innerHTML = `<p>${data.error || "Could not load leaderboard."}</p>`;
      return;
    }

    if (!data.leaderboard || data.leaderboard.length === 0) {
      leaderboardEl.innerHTML = "<p>No scores yet.</p>";
      return;
    }

    leaderboardEl.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>User</th>
            <th>Time</th>
            <th>Moves</th>
          </tr>
        </thead>
        <tbody>
          ${data.leaderboard.map((row) => `
            <tr>
              <td>${row.rank}</td>
              <td>${row.username ?? "Guest"}</td>
              <td>${formatSeconds(row.time_elapsed)}</td>
              <td>${row.moves}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error("loadLeaderboard error:", err);
    leaderboardEl.innerHTML = "<p>Could not load leaderboard.</p>";
  }
}

async function loadStats() {
  try {
    const endpoint = getToken()
      ? "/api/game/my-stats?limit=10"
      : "/api/game/stats?limit=10";

    const res = await fetch(endpoint, {
      headers: authHeaders(),
    });

    const data = await res.json();

    if (!res.ok) {
      statsEl.innerHTML = `<p>${data.error || "Could not load stats."}</p>`;
      return;
    }

    const t = data.totals ?? { total_games: 0, wins: 0, losses: 0, win_rate: 0 };
    const bestTimes = data.best_time_by_difficulty ?? [];
    const recent = data.recent_history ?? [];

    statsEl.innerHTML = `
      <p>Total Games: ${t.total_games}</p>
      <p>Wins: ${t.wins}</p>
      <p>Losses: ${t.losses}</p>
      <p>Win Rate: ${(Number(t.win_rate) * 100).toFixed(1)}%</p>

      <h3>Best Times</h3>
      <ul>
        ${
          bestTimes.length
            ? bestTimes.map((row) => `
                <li>${row.difficulty}: ${row.best_time == null ? "--:--" : formatSeconds(row.best_time)}</li>
              `).join("")
            : "<li>No wins yet.</li>"
        }
      </ul>

      <h3>Recent Games</h3>
      ${
        recent.length
          ? `
            <table>
              <thead>
                <tr>
                  <th>Difficulty</th>
                  <th>Result</th>
                  <th>Time</th>
                  <th>Moves</th>
                </tr>
              </thead>
              <tbody>
                ${recent.map((row) => `
                  <tr>
                    <td>${row.difficulty}</td>
                    <td>${row.result}</td>
                    <td>${row.time_elapsed == null ? "--:--" : formatSeconds(row.time_elapsed)}</td>
                    <td>${row.moves ?? "-"}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          `
          : "<p>No completed games yet.</p>"
      }
    `;
  } catch (err) {
    console.error("loadStats error:", err);
    statsEl.innerHTML = "<p>Could not load stats.</p>";
  }
}

async function loadCurrentUser() {
  const token = getToken();

  if (!token) {
    authStatusEl.textContent = "Not signed in";
    return;
  }

  try {
    const res = await fetch("/api/auth/me", {
      headers: authHeaders(),
    });

    const data = await res.json();

    if (!res.ok) {
      clearToken();
      authStatusEl.textContent = "Not signed in";
      return;
    }

    authStatusEl.textContent = `Signed in as ${data.username}`;
  } catch (err) {
    console.error("loadCurrentUser error:", err);
    authStatusEl.textContent = "Not signed in";
  }
}

async function register() {
  try {
    const username = usernameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      authMessageEl.textContent = data.error || "Register failed";
      return;
    }

    authMessageEl.textContent = "Account created. You can now log in.";
    clearAuthInputs();
  } catch (err) {
    console.error("register error:", err);
    authMessageEl.textContent = "Register failed";
  }
}

async function login() {
  try {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      authMessageEl.textContent = data.error || "Login failed";
      return;
    }

    setToken(data.token);
    authMessageEl.textContent = "Signed in";
    clearAuthInputs();

    await loadCurrentUser();
    await loadStats();
    await loadLeaderboard();
  } catch (err) {
    console.error("login error:", err);
    authMessageEl.textContent = "Login failed";
  }
}

async function logout() {
  clearToken();
  authStatusEl.textContent = "Not signed in";
  authMessageEl.textContent = "Signed out";

  await loadStats();
}

newGameBtn.addEventListener("click", startGame);
difficultyEl.addEventListener("change", loadLeaderboard);
registerBtn.addEventListener("click", register);
loginBtn.addEventListener("click", login);
logoutBtn.addEventListener("click", logout);

await loadCurrentUser();
await startGame();
await loadLeaderboard();
await loadStats();