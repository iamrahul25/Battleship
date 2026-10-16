import { cellAt, inBounds, isShipSunk, key, neighbours8, sameCoord } from './board';
import type { Board, Coord, RuleSet, ShotResult, SonarResult } from './types';

export interface ResolvedShot {
  board: Board;
  result: ShotResult;
  knownEmpty: Coord[];
}

/**
 * Resolves one shot on a board (pure). Caller must ensure the cell is in bounds and unfired.
 * On sunk, the whole ship is marked `sunk` and, without touching ships, its halo `knownEmpty`.
 */
export function resolveShot(board: Board, coord: Coord, rules: Pick<RuleSet, 'allowTouching'>): ResolvedShot {
  const shots = { ...board.shots };
  const shipIndex = board.ships.findIndex((s) => s.cells.some((c) => sameCoord(c, coord)));
  if (shipIndex === -1) {
    shots[key(coord)] = 'miss';
    return { board: { ...board, shots }, result: { coord, result: 'miss' }, knownEmpty: [] };
  }

  const ships = board.ships.slice();
  const ship = { ...ships[shipIndex], hits: ships[shipIndex].hits + 1 };
  ships[shipIndex] = ship;
  shots[key(coord)] = 'hit';

  const knownEmpty: Coord[] = [];
  if (isShipSunk(ship)) {
    for (const c of ship.cells) shots[key(c)] = 'sunk';
    if (!rules.allowTouching) {
      for (const c of ship.cells) {
        for (const n of neighbours8(board, c)) {
          if (cellAt({ shots }, n) === 'unknown') {
            shots[key(n)] = 'knownEmpty';
            knownEmpty.push(n);
          }
        }
      }
    }
    return {
      board: { ...board, ships, shots },
      result: { coord, result: 'sunk', shipUid: ship.uid, ship: { ...ship, cells: ship.cells.map((c) => ({ ...c })) } },
      knownEmpty,
    };
  }
  return { board: { ...board, ships, shots }, result: { coord, result: 'hit', shipUid: ship.uid }, knownEmpty };
}

/** Counts every ship cell (hit or not) inside the scanned cells. */
export function resolveSonar(board: Board, area: Coord[]): SonarResult {
  const inArea = area.filter((c) => inBounds(board, c));
  const shipCells = new Set(board.ships.flatMap((s) => s.cells.map(key)));
  return { area: inArea, shipCellsFound: inArea.filter((c) => shipCells.has(key(c))).length };
}