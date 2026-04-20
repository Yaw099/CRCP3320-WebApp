// src/game/board.js

// Simple deterministic PRNG (Mulberry32)
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function inBounds(x, y, w, h) {
  return x >= 0 && x < w && y >= 0 && y < h;
}

export function generateBoard({ width, height, mines, seed, safeX, safeY }) {
  const cells = width * height;

  const protectedCells = new Set();

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = safeX + dx;
      const ny = safeY + dy;

      if (inBounds(nx, ny, width, height)) {
        protectedCells.add(ny * width + nx);
      }
    }
  }

  const maxMines = cells - protectedCells.size;
  if (mines > maxMines) throw new Error(`Too many mines (max ${maxMines})`);

  const candidates = [];
  for (let i = 0; i < cells; i++) {
    if (!protectedCells.has(i)) candidates.push(i);
  }

  const rand = mulberry32(seed);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const mineSet = new Set(candidates.slice(0, mines));
  const board = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ mine: false, adj: 0 }))
  );

  for (const idx of mineSet) {
    const x = idx % width;
    const y = Math.floor(idx / width);
    board[y][x].mine = true;
  }

  const dirs = [
    [-1, -1], [0, -1], [1, -1],
    [-1,  0],           [1,  0],
    [-1,  1], [0,  1], [1,  1],
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (board[y][x].mine) continue;

      let count = 0;
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (inBounds(nx, ny, width, height) && board[ny][nx].mine) count++;
      }
      board[y][x].adj = count;
    }
  }

  return board;
}

export function key(x, y) {
  return `${x},${y}`;
}