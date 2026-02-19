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
