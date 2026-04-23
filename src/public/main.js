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

const openLeaderboardBtn = document.getElementById("open-leaderboard-btn");
const openStatsBtn = document.getElementById("open-stats-btn");
const openAccountBtn = document.getElementById("open-account-btn");

const leaderboardModal = document.getElementById("leaderboard-modal");
const statsModal = document.getElementById("stats-modal");
const accountModal = document.getElementById("account-modal");
const modalOverlay = document.getElementById("modal-overlay");

const customControlsEl = document.getElementById("custom-controls");
const customWidthEl = document.getElementById("custom-width");
const customHeightEl = document.getElementById("custom-height");
const customMinesEl = document.getElementById("custom-mines");

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
    questioned: new Set(),
    firstRevealDone: false,
    elapsedSeconds: 0,
    timerId: null,
    focusX: 0,
    focusY: 0,
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

function updateCustomMineLimit() {
    const width = Number(customWidthEl.value);
    const height = Number(customHeightEl.value);

    if (!Number.isInteger(width) || !Number.isInteger(height)) return;

    const maxMines = Math.max(1, width * height - 9);
    customMinesEl.max = String(maxMines);

    if (Number(customMinesEl.value) > maxMines) {
        customMinesEl.value = String(maxMines);
    }
}

function updateMineCount() {
    const minesLeft = state.mines - state.flagged.size;
    mineCountEl.textContent = `Mines: ${minesLeft}`;

    if (minesLeft < 0) {
        mineCountEl.classList.add("danger");
    } else {
        mineCountEl.classList.remove("danger");
    }
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

function moveFocus(dx, dy) {
    state.focusX = Math.max(0, Math.min(state.width - 1, state.focusX + dx));
    state.focusY = Math.max(0, Math.min(state.height - 1, state.focusY + dy));
    renderBoard();
}

function revealFocusedCell() {
    handleReveal(state.focusX, state.focusY);
}

function flagFocusedCell() {
    handleFlag(state.focusX, state.focusY);
}

function chordFocusedCell() {
    if (state.status !== "playing") return;
    handleChord(state.focusX, state.focusY);
}

function updateCustomControlsVisibility() {
    if (difficultyEl.value === "custom") {
        customControlsEl.classList.remove("hidden");
    } else {
        customControlsEl.classList.add("hidden");
    }
}

function closeAllModals() {
    leaderboardModal.classList.add("hidden");
    statsModal.classList.add("hidden");
    accountModal.classList.add("hidden");
    modalOverlay.classList.add("hidden");
}

function openModal(modalEl) {
    closeAllModals();
    modalEl.classList.remove("hidden");
    modalOverlay.classList.remove("hidden");
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
    state.questioned = new Set();
    state.firstRevealDone = false;
    state.elapsedSeconds = 0;
    state.focusX = 0;
    state.focusY = 0;

    updateTimerDisplay();
    updateMineCount();
    updateMessage();
}

async function startGame() {
    try {
        const difficulty = difficultyEl.value;

        const payload = { difficulty };

        if (difficulty === "custom") {
            const width = Number(customWidthEl.value);
            const height = Number(customHeightEl.value);
            const mines = Number(customMinesEl.value);

            if (!Number.isInteger(width) || width < 5 || width > 50) {
                messageEl.textContent = "Width must be between 5 and 50.";
                return;
            }

            if (!Number.isInteger(height) || height < 5 || height > 40) {
                messageEl.textContent = "Height must be between 5 and 40.";
                return;
            }

            const maxMines = width * height - 9;
            if (!Number.isInteger(mines) || mines < 1 || mines > maxMines) {
                messageEl.textContent = `Mines must be between 1 and ${maxMines}.`;
                return;
            }

            payload.width = width;
            payload.height = height;
            payload.mines = mines;
        }

        const res = await fetch("/api/game/start", {
            method: "POST",
            headers: authHeaders({
                "Content-Type": "application/json",
            }),
            body: JSON.stringify(payload),
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

function getCellSize() {
    if (state.width >= 24 || state.height >= 20) return 24; // hard / large
    if (state.width >= 16 || state.height >= 16) return 30; // medium
    return 36; // easy
}

function renderBoard() {
    boardEl.innerHTML = "";
    const cellSize = getCellSize();
    boardEl.style.gridTemplateColumns = `repeat(${state.width}, ${cellSize}px)`;
    boardEl.style.setProperty("--cell-size", `${cellSize}px`);

    for (let y = 0; y < state.height; y++) {
        for (let x = 0; x < state.width; x++) {
            const cellBtn = document.createElement("button");
            cellBtn.className = "cell";
            cellBtn.type = "button";

            const cellKey = key(x, y);
            const isRevealed = state.revealed.has(cellKey);
            const isFlagged = state.flagged.has(cellKey);
            const isQuestioned = state.questioned.has(cellKey);

            if (x === state.focusX && y === state.focusY) {
                cellBtn.classList.add("focused");
            }

            if (isRevealed && state.board.length) {
                const cell = state.board[y][x];
                cellBtn.classList.add("revealed");

                if (cell.mine) {
                    cellBtn.classList.add("mine");
                    cellBtn.textContent = "*";
                } else if (cell.adj > 0) {
                    cellBtn.textContent = String(cell.adj);
                    cellBtn.classList.add(`adj-${cell.adj}`);
                }
            } else if (isFlagged) {
                cellBtn.classList.add("flagged");
                cellBtn.textContent = "F";
            } else if (isQuestioned) {
                cellBtn.classList.add("questioned");
                cellBtn.textContent = "?";
            }

            cellBtn.addEventListener("click", () => {
                state.focusX = x;
                state.focusY = y;
                handleReveal(x, y);
            });
            cellBtn.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                state.focusX = x;
                state.focusY = y;
                handleFlag(x, y);
            });
            cellBtn.addEventListener("dblclick", () => {
                state.focusX = x;
                state.focusY = y;
                handleChord(x, y);
            });

            boardEl.appendChild(cellBtn);
        }
    }
}

function getNeighborCoords(x, y) {
    const neighbors = [];

    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;

            const nx = x + dx;
            const ny = y + dy;

            if (nx < 0 || nx >= state.width || ny < 0 || ny >= state.height) {
                continue;
            }

            neighbors.push([nx, ny]);
        }
    }

    return neighbors;
}

function countFlaggedNeighbors(x, y) {
    return getNeighborCoords(x, y).filter(([nx, ny]) =>
        state.flagged.has(key(nx, ny))
    ).length;
}

function finishLoss() {
    state.status = "lost";
    stopTimer();
    revealAllMines();
    updateMessage();

    void (async () => {
        await submitCompletedGame("lose");
        await loadStats();
    })();
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

function handleChord(x, y) {
    if (state.status !== "playing") return;
    if (!state.board.length) return;

    const cellKey = key(x, y);
    if (!state.revealed.has(cellKey)) return;

    const cell = state.board[y][x];
    if (cell.mine || cell.adj === 0) return;

    const flaggedCount = countFlaggedNeighbors(x, y);

    if (flaggedCount !== cell.adj) {
        return;
    }

    const neighbors = getNeighborCoords(x, y);

    for (const [nx, ny] of neighbors) {
        const neighborKey = key(nx, ny);

        if (state.flagged.has(neighborKey) || state.revealed.has(neighborKey)) {
            continue;
        }

        const neighborCell = state.board[ny][nx];

        if (neighborCell.mine) {
            finishLoss();
            renderBoard();
            return;
        }

        revealCell(nx, ny);
    }

    checkWin();
    renderBoard();
}

function handleFlag(x, y) {
    if (state.status !== "playing") return;

    const cellKey = key(x, y);
    if (state.revealed.has(cellKey)) return;

    if (state.flagged.has(cellKey)) {
        state.flagged.delete(cellKey);
        state.questioned.add(cellKey);
    } else if (state.questioned.has(cellKey)) {
        state.questioned.delete(cellKey);
    } else {
        state.flagged.add(cellKey);
    }

    updateMineCount();
    renderBoard();
}

function flagAllMines() {
    for (let y = 0; y < state.height; y++) {
        for (let x = 0; x < state.width; x++) {
            const cellKey = key(x, y);
            if (state.board[y][x].mine) {
                state.questioned.delete(cellKey);
                state.flagged.add(cellKey);
            }
        }
    }

    updateMineCount();
}

function revealCell(x, y) {
    const cellKey = key(x, y);

    if (state.revealed.has(cellKey) || state.flagged.has(cellKey)) {
        return;
    }

    state.revealed.add(cellKey);

    const cell = state.board[y][x];

    if (cell.mine) {
        finishLoss();
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
        [-1, 0], [1, 0],
        [-1, 1], [0, 1], [1, 1],
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
        flagAllMines();
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
        ${bestTimes.length
                ? bestTimes.map((row) => `
                <li>${row.difficulty}: ${row.best_time == null ? "--:--" : formatSeconds(row.best_time)}</li>
              `).join("")
                : "<li>No wins yet.</li>"
            }
      </ul>

      <h3>Recent Games</h3>
      ${recent.length
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
        console.log("/api/auth/me response:", data);

        if (!res.ok) {
            clearToken();
            authStatusEl.textContent = "Not signed in";
            return;
        }

        const username =
            data.username ??
            data.user?.username ??
            data.email ??
            data.user?.email ??
            "Signed in";

        authStatusEl.textContent = `Signed in as ${username}`;
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
difficultyEl.addEventListener("change", () => {
    updateCustomControlsVisibility();
    loadLeaderboard();
});
registerBtn.addEventListener("click", register);
loginBtn.addEventListener("click", login);
logoutBtn.addEventListener("click", logout);
openLeaderboardBtn.addEventListener("click", async () => {
    await loadLeaderboard();
    openModal(leaderboardModal);
});

openStatsBtn.addEventListener("click", async () => {
    await loadStats();
    openModal(statsModal);
});

openAccountBtn.addEventListener("click", () => {
    openModal(accountModal);
});

modalOverlay.addEventListener("click", closeAllModals);

document.querySelectorAll(".close-modal-btn").forEach((btn) => {
    btn.addEventListener("click", closeAllModals);
});
customWidthEl.addEventListener("input", updateCustomMineLimit);
customHeightEl.addEventListener("input", updateCustomMineLimit);

document.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName;
    const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        document.activeElement?.isContentEditable;

    if (isTyping) return;

    switch (e.code) {
        case "ArrowUp":
            e.preventDefault();
            moveFocus(0, -1);
            break;
        case "ArrowDown":
            e.preventDefault();
            moveFocus(0, 1);
            break;
        case "ArrowLeft":
            e.preventDefault();
            moveFocus(-1, 0);
            break;
        case "ArrowRight":
            e.preventDefault();
            moveFocus(1, 0);
            break;
        case "Enter":
        case "Space":
            e.preventDefault();
            revealFocusedCell();
            break;
        case "KeyF":
            e.preventDefault();
            flagFocusedCell();
            break;
        case "KeyC":
            e.preventDefault();
            chordFocusedCell();
            break;
    }
});

setToken(data.token);
clearAuthInputs();

updateCustomControlsVisibility();
updateCustomMineLimit();
await loadCurrentUser();
await startGame();
await loadLeaderboard();
await loadStats();

authMessageEl.textContent = "";