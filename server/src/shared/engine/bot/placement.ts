import { key, neighbours8 } from '../board';
import { randomFleet } from '../placement';
import type { Rng } from '../rng';
import type { ObstacleKind, PlacedShip, RuleSet } from '../types';
import type { Difficulty } from './common';

/** Sum over ship pairs of the (capped) Chebyshev gap between them: higher = more spread out. */
export function spreadScore(ships: PlacedShip[]): number {
  let score = 0;
  for (let i = 0; i < ships.length; i++) {
    for (let j = i + 1; j < ships.length; j++) {
      let min = Infinity;
      for (const a of ships[i].cells)
        for (const b of ships[j].cells) min = Math.min(min, Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)));
      score += Math.min(min, 4);
    }
  }
  return score;
}

export function layoutSignature(ships: PlacedShip[]): string {
  return ships
    .map((s) => `${s.defId}@${key(s.origin)}/${s.rotation}`)
    .sort()
    .join(';');
}

let lastHardSignature: string | null = null;

export function botPlaceFleet(
  difficulty: Difficulty,
  rules: RuleSet,
  rng: Rng,
  obstacles?: Record<string, ObstacleKind>,
): PlacedShip[] {
  if (difficulty === 'easy') return randomFleet(rules, rng, { obstacles });

  if (difficulty === 'medium') {
    let best: PlacedShip[] = randomFleet(rules, rng, { obstacles });
    let bestScore = spreadScore(best);
    for (let i = 0; i < 5; i++) {
      const f = randomFleet(rules, rng, { obstacles });
      const s = spreadScore(f);
      if (s > bestScore) {
        best = f;
        bestScore = s;
      }
    }
    return best;
  }

  // Hard: mix edge placements, spread ships out, never repeat the previous layout.
  const { width, height } = rules.grid;
  const edgeWeight = 0.5 + rng.next(); // vary edge bias game to game
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidates: PlacedShip[][] = [];
    for (let i = 0; i < 4; i++) {
      candidates.push(
        randomFleet(rules, rng, {
          obstacles,
          weight: (cand, placed, board) => {
            const edgeCells = cand.cells.filter((c) => c.x === 0 || c.y === 0 || c.x === width - 1 || c.y === height - 1).length;
            const near = new Set(placed.flatMap((p) => p.cells.flatMap((c) => neighbours8(board, c).map(key))));
            const crowd = cand.cells.filter((c) => near.has(key(c))).length;
            return 1 + edgeWeight * (edgeCells / cand.cells.length) - 0.15 * crowd;
          },
        }),
      );
    }
    candidates.sort((a, b) => spreadScore(b) - spreadScore(a));
    const pick = candidates[rng.int(2)];
    const sig = layoutSignature(pick);
    if (sig !== lastHardSignature) {
      lastHardSignature = sig;
      return pick;
    }
  }
  return randomFleet(rules, rng, { obstacles });
}
