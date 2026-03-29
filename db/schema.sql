-- db/schema.sql
-- Minesweeper Arcade schema (idempotent)

BEGIN;

-- 1) Fresh install path (table doesn't exist yet)
CREATE TABLE IF NOT EXISTS game_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  difficulty VARCHAR(16) NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  mines INT NOT NULL,
  seed BIGINT NOT NULL,
  result VARCHAR(8),
  time_elapsed INT,
  moves INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2) Upgrade path (table exists but columns may be missing)
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS user_id INTEGER;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS seed BIGINT;

-- 3) Backfill seed for any existing rows
UPDATE game_sessions
SET seed = FLOOR(RANDOM() * 2147483647)
WHERE seed IS NULL;

-- 4) Enforce NOT NULL after backfill
ALTER TABLE game_sessions
ALTER COLUMN seed SET NOT NULL;

-- 5) Indexes (must come AFTER user_id exists)
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id ON game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_created_at ON game_sessions(created_at);


ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS first_click_x INT NULL,
  ADD COLUMN IF NOT EXISTS first_click_y INT NULL;

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS end_time TIMESTAMP;

COMMIT;