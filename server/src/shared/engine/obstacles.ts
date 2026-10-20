import { allCells, key, neighbours4 } from './board';
import type { Rng } from './rng';
import type { Board, Coord, ObstacleKind, ObstacleLevel, RuleSet } from './types';

export const OBSTACLE_KINDS: ObstacleKind[] = ['rock', 'island', 'reef', 'mine'];

/** Obstacles per 100 board cells, by kind. Each island is a 2–3 cell cluster. */
const DENSITY: Record<Exclude<ObstacleLevel, 'none'>, Record<ObstacleKind, number>> = {
  few: { rock: 2, island: 1, reef: 1, mine: 1 },
  many: { rock: 3, island: 2, reef: 3, mine: 2 },
};

/** How many of each obstacle a board gets (islands count clusters, not cells). */
export function obstacleCounts(rules: Pick<RuleSet, 'grid' | 'obstacles'>): Record<ObstacleKind, number> {
  const level = rules.obstacles ?? 'none';
  const area = rules.grid.width * rules.grid.height;
  const counts = { rock: 0, island: 0, reef: 0, mine: 0 };
  if (level === 'none') return counts;
  for (const kind of OBSTACLE_KINDS) counts[kind] = Math.max(1, Math.round((DENSITY[level][kind] * area) / 100));
  return counts;
}

/** Random obstacle layout for one board. Empty when the rules have no obstacles. */
export function generateObstacles(rules: Pick<RuleSet, 'grid' | 'obstacles'>, rng: Rng): Record<string, ObstacleKind> {
  const counts = obstacleCounts(rules);
  const dims = rules.grid;
  const out: Record<string, ObstacleKind> = {};
  const free = (c: Coord) => !out[key(c)];

  for (let i = 0; i < counts.island; i++) {
    const start = rng.pick(allCells(dims).filter(free));
    if (!start) break;
    const size = 2 + rng.int(2);
    const cluster = [start];
    const inCluster = (c: Coord) => cluster.some((p) => p.x === c.x && p.y === c.y);
    while (cluster.length < size) {
      const options = cluster.flatMap((c) => neighbours4(dims, c)).filter((c) => free(c) && !inCluster(c));
      if (!options.length) break;
      cluster.push(rng.pick(options));
    }
    for (const c of cluster) out[key(c)] = 'island';
  }

  for (const kind of ['rock', 'reef', 'mine'] as const) {
    for (let i = 0; i < counts[kind]; i++) {
      const cells = allCells(dims).filter(free);
      if (!cells.length) break;
      out[key(rng.pick(cells))] = kind;
    }
  }
  return out;
}

/** Board fields for an obstacle map, omitted entirely when there are none. */
export function obstacleFields(obstacles: Record<string, ObstacleKind> | undefined): Pick<Board, 'obstacles'> {
  return obstacles && Object.keys(obstacles).length ? { obstacles } : {};
}

/** What the enemy may see: everything but untriggered mines (all of it once revealed). */
export function visibleObstacles(board: Pick<Board, 'obstacles' | 'shots'>, reveal: boolean): Record<string, ObstacleKind> {
  const out: Record<string, ObstacleKind> = {};
  for (const [k, kind] of Object.entries(board.obstacles ?? {})) {
    if (reveal || kind !== 'mine' || board.shots[k] === 'miss') out[k] = kind;
  }
  return out;
}
