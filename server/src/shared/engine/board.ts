import type { Board, CellState, Coord, PlacedShip } from './types';

export const key = (c: Coord) => `${c.x},${c.y}`;

export function parseKey(k: string): Coord {
  const [x, y] = k.split(',').map(Number);
  return { x, y };
}

export function createBoard(width: number, height: number): Board {
  return { width, height, ships: [], shots: {} };
}

export function inBounds(dims: { width: number; height: number }, c: Coord): boolean {
  return Number.isInteger(c.x) && Number.isInteger(c.y) && c.x >= 0 && c.y >= 0 && c.x < dims.width && c.y < dims.height;
}

export function cellAt(board: { shots: Record<string, CellState> }, c: Coord): CellState {
  return board.shots[key(c)] ?? 'unknown';
}

const ORTHO = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const ALL8 = [...ORTHO, { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }];

export function neighbours4(dims: { width: number; height: number }, c: Coord): Coord[] {
  return ORTHO.map((d) => ({ x: c.x + d.x, y: c.y + d.y })).filter((n) => inBounds(dims, n));
}

export function neighbours8(dims: { width: number; height: number }, c: Coord): Coord[] {
  return ALL8.map((d) => ({ x: c.x + d.x, y: c.y + d.y })).filter((n) => inBounds(dims, n));
}

export function shipAt(ships: PlacedShip[], c: Coord): PlacedShip | undefined {
  return ships.find((s) => s.cells.some((p) => p.x === c.x && p.y === c.y));
}

export function allCells(dims: { width: number; height: number }): Coord[] {
  const out: Coord[] = [];
  for (let y = 0; y < dims.height; y++) for (let x = 0; x < dims.width; x++) out.push({ x, y });
  return out;
}

export function isTargetable(board: { shots: Record<string, CellState> }, c: Coord): boolean {
  return cellAt(board, c) === 'unknown';
}

/** Unfired cells that can still be targeted. */
export function legalTargets(board: { width: number; height: number; shots: Record<string, CellState> }): Coord[] {
  return allCells(board).filter((c) => isTargetable(board, c));
}

export function isShipSunk(ship: PlacedShip): boolean {
  return ship.hits >= ship.cells.length;
}

export function isFleetSunk(board: Board): boolean {
  return board.ships.length > 0 && board.ships.every(isShipSunk);
}

export function coordLabel(c: Coord): string {
  return `${String.fromCharCode(65 + c.x)}${c.y + 1}`;
}

export const sameCoord = (a: Coord, b: Coord) => a.x === b.x && a.y === b.y;

export function cloneBoard(board: Board): Board {
  return {
    width: board.width,
    height: board.height,
    ships: board.ships.map((s) => ({ ...s, origin: { ...s.origin }, cells: s.cells.map((c) => ({ ...c })) })),
    shots: { ...board.shots },
  };
}
