CREATE TABLE IF NOT EXISTS game_sessions (
  id SERIAL PRIMARY KEY,
  difficulty VARCHAR(16) NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  mines INT NOT NULL,
  result VARCHAR(8),
  time_elapsed INT,
  moves INT,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE game_sessions
ADD COLUMN IF NOT EXISTS seed BIGINT;

UPDATE game_sessions
SET seed = FLOOR(RANDOM() * 2147483647)
WHERE seed IS NULL;

ALTER TABLE game_sessions
ALTER COLUMN seed SET NOT NULL;