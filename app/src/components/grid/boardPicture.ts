import type { SkCanvas } from '@shopify/react-native-skia';
import { type CellState, type Coord, key, type ObstacleKind, type PlacedShip } from '@shared/engine';
import { paint, radial, record } from '@/art/draw';
import { drawObstacles } from '@/art/obstacles';
import { drawShip } from '@/art/ships';
import { colors } from '@/theme';

export interface BoardLike {
  width: number;
  height: number;
  shots: Record<string, CellState>;
  ships: PlacedShip[];
  obstacles?: Record<string, ObstacleKind>;
}

export interface BoardPictureOptions {
  /** Ships revealed at game end that were never sunk (drawn without the sunk overlay). */
  revealed?: PlacedShip[];
  /** Ships currently being placed: drawn with validity tint. */
  ghost?: { ship: PlacedShip; valid: boolean } | null;
  hiddenShipUid?: string | null;
}

function drawGrid(c: SkCanvas, cols: number, rows: number, s: number) {
  const line = paint(colors.ocean300, { stroke: 1, alpha: 0.28 });
  for (let i = 1; i < cols; i++) c.drawLine(i * s, 0, i * s, rows * s, line);
  for (let j = 1; j < rows; j++) c.drawLine(0, j * s, cols * s, j * s, line);
  c.drawRect({ x: 0.75, y: 0.75, width: cols * s - 1.5, height: rows * s - 1.5 }, paint(colors.ocean300, { stroke: 1.5, alpha: 0.7 }));
}

export function drawMiss(c: SkCanvas, cx: number, cy: number, s: number) {
  const r = s * 0.2;
  const p = paint(colors.missWhite, { stroke: Math.max(1.5, s * 0.08), cap: 'round' });
  c.drawCircle(cx, cy, s * 0.32, paint(colors.missWhite, { stroke: 1, alpha: 0.18 }));
  c.drawLine(cx - r, cy - r, cx + r, cy + r, p);
  c.drawLine(cx - r, cy + r, cx + r, cy - r, p);
}

export function drawHitPeg(c: SkCanvas, cx: number, cy: number, s: number) {
  c.drawCircle(cx, cy, s * 0.46, radial(cx, cy, s * 0.46, ['rgba(229,57,53,0.55)', 'rgba(229,57,53,0)']));
  c.drawCircle(cx, cy, s * 0.21, radial(cx - s * 0.06, cy - s * 0.06, s * 0.26, ['#FF7A70', colors.signalRed, colors.signalRedDark]));
  c.drawCircle(cx - s * 0.06, cy - s * 0.07, s * 0.05, paint('#FFFFFF', { alpha: 0.7 }));
}

function damagedCells(ship: PlacedShip, shots: Record<string, CellState>): Coord[] {
  return ship.cells.filter((cell) => {
    const st = shots[key(cell)];
    return st === 'hit' || st === 'sunk';
  });
}

const isSunk = (ship: PlacedShip, shots: Record<string, CellState>) =>
  ship.cells.length > 0 && (ship.hits >= ship.cells.length || ship.cells.every((cell) => shots[key(cell)] === 'sunk'));

export function boardPicture(board: BoardLike, s: number, opts: BoardPictureOptions = {}) {
  const W = board.width * s;
  const H = board.height * s;
  return record(W, H, (c) => {
    drawGrid(c, board.width, board.height, s);
    drawObstacles(c, board.obstacles, board.shots, s);

    for (const k of Object.keys(board.shots)) {
      if (board.shots[k] !== 'knownEmpty') continue;
      const [x, y] = k.split(',').map(Number);
      c.drawCircle((x + 0.5) * s, (y + 0.5) * s, s * 0.07, paint(colors.steel400, { alpha: 0.45 }));
    }

    const revealedUids = new Set((opts.revealed ?? []).map((r) => r.uid));
    const ships = [...board.ships, ...(opts.revealed ?? []).filter((r) => !board.ships.some((b) => b.uid === r.uid))];
    for (const ship of ships) {
      if (ship.uid === opts.hiddenShipUid) continue;
      const sunk = isSunk(ship, board.shots);
      if (revealedUids.has(ship.uid) && !sunk) c.saveLayer(paint('#FFFFFF', { alpha: 0.75 }));
      drawShip(c, ship, s, 0, 0, { sunk, damaged: damagedCells(ship, board.shots) });
      if (revealedUids.has(ship.uid) && !sunk) c.restore();
    }

    if (opts.ghost) drawShip(c, opts.ghost.ship, s, 0, 0, { tint: opts.ghost.valid ? 'valid' : 'invalid' });

    for (const k of Object.keys(board.shots)) {
      const st = board.shots[k];
      const [x, y] = k.split(',').map(Number);
      const cx = (x + 0.5) * s;
      const cy = (y + 0.5) * s;
      if (st === 'miss' && board.obstacles?.[k] !== 'mine') drawMiss(c, cx, cy, s);
      else if (st === 'hit' || st === 'sunk') drawHitPeg(c, cx, cy, s * (st === 'sunk' ? 0.8 : 1));
    }
  });
}
