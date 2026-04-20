# Minesweeper Arcade (Full-Stack Web App)

Overview
-
Minesweeper Arcade is a full-stack web application that allows users to play Minesweeper in the browser and persist gameplay data (users, sessions, scores, and statistics) in a PostgreSQL database. The system consists of a web client (front end) and a server (backend API) with a relational database. The application will support multiple difficulty presets and optional custom boards, and will provide basic leaderboards and player statistics.

# Assumptions and Scope

In scope:
-

A playable Minesweeper experience in a browser UI

A backend API for game session management, score submission, and retrieving statistics/leaderboards

PostgreSQL persistence for users and game results

Basic authentication (session-based or token-based)

Deployment-ready configuration (local + cloud)

# Out of scope (unless time permits):

Multiplayer modes

Complex anti-cheat beyond basic validation

Social features (friends, chat, messaging)

Mobile-native application (responsive web is acceptable)

Functional Requirements (FR)
-

- [x] FR1 – Server and API Availability
The system shall provide a backend web server that responds to HTTP requests and exposes a versioned API (e.g., /api/*).

- [x] FR2 – Difficulty Configuration
The system shall support predefined Minesweeper difficulties (easy, medium, hard) including width, height, and mine count.
FR2.1 The system shall allow the client to retrieve difficulty configurations via an API endpoint.

- [x] FR3 – Start Game Session
The system shall allow a user (authenticated or guest) to start a new game session.
    - [x] FR3.1 The system shall create a unique session identifier for each game.
    - [x] FR3.2 The system shall return the game settings (and a reproducible seed, if used).

- [x] FR4 – Minesweeper Board Generation
The system shall generate a Minesweeper board that places mines and computes adjacency counts.
    - [x] FR4.1 The system shall ensure the first click is not a mine (standard Minesweeper behavior).
    - [x] FR4.2 The system shall support deterministic board generation using a seed (optional but recommended).

- [x] FR5 – Core Gameplay Interactions
The system shall allow the user to interact with the board using:
    - [x] FR5.1 Reveal a tile
    - [x] FR5.2 Flag/unflag a tile
    - [x] FR5.3 Auto-reveal neighbors when a 0-adjacent tile is revealed
    - [x] FR5.4 Detect win condition (all non-mine tiles revealed)
    - [x] FR5.5 Detect loss condition (mine revealed)

- [x] FR6 – Game Timer and Move Tracking
The system shall track elapsed time for each session.
    - [x] FR6.1 The system shall track move count (or actions such as reveal/flag) per session.

- [x] FR7 – End Game Session and Save Result
The system shall allow the client to submit a completed game result (win/loss, time, difficulty, and session id).
    - [x] FR7.1 The system shall store game session results in PostgreSQL.
    - [x] FR7.2 The system shall reject invalid submissions (e.g., unknown session id, missing fields).

- [ ] FR8 – User Accounts and Authentication
The system shall allow users to register and log in.
    - [x] FR8.1 The system shall securely store passwords (hashed + salted).
    - [x] FR8.2 The system shall support logout.
    - [x] FR8.3 The system shall associate saved results with a user account when logged in.

- [x] FR9 – Leaderboards
The system shall provide leaderboards filtered by difficulty.
    - [x] FR9.1 The system shall rank by best completion time (and optionally tie-break using moves).
    - [x] FR9.2 The system shall limit results (e.g., top 10 / top 25).

- [x] FR10 – Player Statistics
The system shall provide player stats such as:
    - [x] FR10.1 total games played, wins, losses
    - [x] FR10.2 win rate
    - [x] FR10.3 best time per difficulty
    - [x] FR10.4 recent game history list

- [ ] FR11 – Front-End UI Requirements
The system shall provide a web UI for playing Minesweeper.
    - [ ] FR11.1 The UI shall render the grid and update in response to user actions.
    - [ ] FR11.2 The UI shall display timer, mine count, and game status (playing/won/lost).
    - [ ] FR11.3 The UI shall allow selecting difficulty and starting a new game.
    - [ ] FR11.4 The UI shall display basic results and allow viewing leaderboards and stats.

- [ ] FR12 – Deployment Support
The system shall provide documentation and configuration to run locally and deploy to a cloud host.
    - [ ] FR12.1 The system shall use environment variables for secrets and database connection strings.

Non-Functional Requirements (NFR)
-

- [ ] NFR1 – Usability
The UI should be intuitive for a first-time user and match common Minesweeper controls (left click reveal, right click flag, or equivalent UI buttons for accessibility).

- [ ] NFR2 – Performance
For standard board sizes, the UI should update responsively and API calls should return quickly under normal use.

- [ ] NFR3 – Reliability
The backend should handle invalid inputs gracefully with clear HTTP status codes and JSON error messages.

- [ ] NFR4 – Security
Passwords must be stored using a secure hash (e.g., bcrypt). Secrets (DB URL, tokens) must not be committed to GitHub. Use environment variables and .gitignore.

- [ ] NFR5 – Maintainability
The codebase should follow consistent structure and naming conventions. Major functionality should be separated into modules (routes, services, db). The repository should maintain a clear commit history reflecting incremental progress.

- [ ] NFR6 – Portability
The application should be runnable on a new machine with documented setup steps. Docker support is recommended but not required.

- [ ] NFR7 – Observability
The backend should log key events (startup, request errors) and provide a health endpoint for deployment validation.

Data Requirements (Database)
-
Core entities (expected tables):

* users: id, username/email, password_hash, created_at

* game_sessions: id, user_id nullable, difficulty, width, height, mines, seed, start_time, end_time, time_elapsed, moves, result

* optional: leaderboard view/query based on stored sessions

Acceptance Criteria (Iteration-level)
-

Minimum viable (to be considered “complete”):

* Playable Minesweeper UI (win/loss detection)

* Backend API exists and runs

* PostgreSQL persistence for sessions/results

* At least one leaderboard and one user stats view

* Clear README with run/test instructions and environment setup

Stretch goals:
-
* Custom board sizes

* Seeded daily challenge mode

* Themes and accessibility options

* Replay or simple verification logic to reduce cheating