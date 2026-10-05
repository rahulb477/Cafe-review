"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/Button";
import {
  generatePuzzle,
  conflicts,
  isComplete,
  type Grid,
  type Difficulty,
  type Puzzle,
} from "@/lib/sudoku";

const difficulties: Difficulty[] = ["Easy", "Medium", "Hard"];

export default function SudokuPage() {
  const [difficulty, setDifficulty] = useState<Difficulty>("Easy");
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [grid, setGrid] = useState<Grid>([]);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [won, setWon] = useState(false);

  const newGame = useCallback((d: Difficulty) => {
    const p = generatePuzzle(d);
    setPuzzle(p);
    setGrid(p.puzzle.map((r) => [...r]));
    setSelected(null);
    setWon(false);
  }, []);

  // Puzzles are random, so generate after mount (avoids SSR hydration mismatch).
  useEffect(() => {
    const id = requestAnimationFrame(() => newGame(difficulty));
    return () => cancelAnimationFrame(id);
  }, [difficulty, newGame]);

  const bad = useMemo(() => (grid.length ? conflicts(grid) : []), [grid]);

  const reset = () => {
    if (!puzzle) return;
    setGrid(puzzle.puzzle.map((r) => [...r]));
    setSelected(null);
    setWon(false);
  };

  const place = (num: number) => {
    if (!selected || !puzzle) return;
    const [r, c] = selected;
    if (puzzle.fixed[r][c]) return;
    const next = grid.map((row) => [...row]);
    next[r][c] = num;
    setGrid(next);
    if (isComplete(next) && conflicts(next).every((row) => row.every((b) => !b))) {
      setWon(true);
    }
  };

  if (!puzzle || grid.length === 0) {
    return (
      <div className="flex min-h-full flex-col">
        <ScreenHeader title="Play Sudoku" backPath="/" />
        <div className="flex flex-1 items-center justify-center text-muted">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title="Play Sudoku" backPath="/" />

      <div className="px-4 pt-2">
        {/* difficulty */}
        <div className="flex gap-1 rounded-2xl bg-secondary p-1">
          {difficulties.map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              aria-pressed={difficulty === d}
              className={`press flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
                difficulty === d ? "bg-primary text-canvas shadow" : "text-primary-mid"
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {won && (
          <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-700 animate-pop-in">
            🎉 Solved it! Great job. Start a New Game for more.
          </div>
        )}

        {/* board */}
        <div className="mt-4 overflow-hidden rounded-xl border-2 border-primary bg-primary">
          <div className="grid grid-cols-9">
            {grid.map((row, r) =>
              row.map((val, c) => {
                const isSel = selected?.[0] === r && selected?.[1] === c;
                const inLine =
                  selected && (selected[0] === r || selected[1] === c);
                const fixed = puzzle.fixed[r][c];
                const conflict = bad[r]?.[c];
                const thickRight = c % 3 === 2 && c !== 8;
                const thickBottom = r % 3 === 2 && r !== 8;
                return (
                  <button
                    key={`${r}-${c}`}
                    onClick={() => setSelected([r, c])}
                    className={`relative aspect-square text-[clamp(14px,4.4vw,19px)] font-semibold transition-colors ${
                      isSel
                        ? "bg-accent/40"
                        : inLine
                          ? "bg-accent/10"
                          : "bg-surface"
                    } ${
                      conflict
                        ? "text-red-500"
                        : fixed
                          ? "text-primary"
                          : "text-primary-mid"
                    }`}
                    style={{
                      borderRight: `${thickRight ? 2 : 0.5}px solid ${
                        thickRight ? "var(--brand-primary)" : "color-mix(in srgb, var(--brand-primary) 22%, transparent)"
                      }`,
                      borderBottom: `${thickBottom ? 2 : 0.5}px solid ${
                        thickBottom ? "var(--brand-primary)" : "color-mix(in srgb, var(--brand-primary) 22%, transparent)"
                      }`,
                    }}
                  >
                    {val !== 0 ? val : ""}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* number pad */}
        <div className="mt-4 grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button
              key={n}
              onClick={() => place(n)}
              disabled={!selected || puzzle.fixed[selected[0]][selected[1]]}
              className="press aspect-square rounded-xl bg-surface text-lg font-bold text-primary shadow-sm disabled:opacity-40"
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => place(0)}
            disabled={!selected || puzzle.fixed[selected[0]][selected[1]]}
            aria-label="Erase"
            className="press aspect-square rounded-xl bg-secondary text-lg font-bold text-primary-mid disabled:opacity-40"
          >
            ⌫
          </button>
        </div>

        <div className="mt-4 flex gap-3 pb-6">
          <Button variant="secondary" full onClick={reset}>
            Reset
          </Button>
          <Button full onClick={() => newGame(difficulty)}>
            New Game
          </Button>
        </div>
      </div>
    </div>
  );
}
