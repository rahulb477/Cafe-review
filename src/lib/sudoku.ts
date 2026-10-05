export type Grid = number[][]; // 0 = empty
export type Difficulty = "Easy" | "Medium" | "Hard";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function isSafe(grid: Grid, row: number, col: number, num: number): boolean {
  for (let x = 0; x < 9; x++) {
    if (grid[row][x] === num || grid[x][col] === num) return false;
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (grid[br + r][bc + c] === num) return false;
    }
  }
  return true;
}

function fill(grid: Grid): boolean {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (grid[row][col] === 0) {
        for (const num of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
          if (isSafe(grid, row, col, num)) {
            grid[row][col] = num;
            if (fill(grid)) return true;
            grid[row][col] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

function emptyGrid(): Grid {
  return Array.from({ length: 9 }, () => Array<number>(9).fill(0));
}

export function generateSolved(): Grid {
  const g = emptyGrid();
  fill(g);
  return g;
}

const holesByDifficulty: Record<Difficulty, number> = {
  Easy: 38,
  Medium: 48,
  Hard: 56,
};

export interface Puzzle {
  puzzle: Grid;
  solution: Grid;
  fixed: boolean[][];
}

export function generatePuzzle(difficulty: Difficulty): Puzzle {
  const solution = generateSolved();
  const puzzle = solution.map((r) => [...r]);
  let holes = holesByDifficulty[difficulty];
  const cells = shuffle(
    Array.from({ length: 81 }, (_, i) => [Math.floor(i / 9), i % 9] as [number, number])
  );
  for (const [r, c] of cells) {
    if (holes <= 0) break;
    if (puzzle[r][c] !== 0) {
      puzzle[r][c] = 0;
      holes--;
    }
  }
  const fixed = puzzle.map((row) => row.map((v) => v !== 0));
  return { puzzle, solution, fixed };
}

export function isComplete(grid: Grid): boolean {
  return grid.every((row) => row.every((v) => v !== 0));
}

export function conflicts(grid: Grid): boolean[][] {
  const bad = Array.from({ length: 9 }, () => Array<boolean>(9).fill(false));
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = grid[r][c];
      if (v === 0) continue;
      grid[r][c] = 0;
      if (!isSafe(grid, r, c, v)) bad[r][c] = true;
      grid[r][c] = v;
    }
  }
  return bad;
}
