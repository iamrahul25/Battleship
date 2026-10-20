import { PathOp, type SkCanvas, Skia, type SkPath } from '@shopify/react-native-skia';
import type { Coord, Rotation } from '@shared/engine';
import { colors } from '@/theme';
import { linear, paint, poly, radial, rect, rrect } from './draw';

export interface ShipDrawInput {
  defId: string;
  cells: Coord[];
  rotation: Rotation;
}

export interface ShipDrawOptions {
  sunk?: boolean;
  /** Absolute cells of this ship that have been hit. */
  damaged?: Coord[];
  tint?: 'valid' | 'invalid' | null;
  /** Greyed silhouette (fleet tracker). */
  silhouette?: boolean;
}

function turret(c: SkCanvas, cx: number, cy: number, r: number, facing: 1 | -1, silhouette: boolean) {
  const barrel = paint(silhouette ? colors.steel400 : colors.steel600, { stroke: r * 0.42, cap: 'round' });
  c.drawLine(cx, cy - r * 0.28, cx + facing * r * 1.9, cy - r * 0.28, barrel);
  c.drawLine(cx, cy + r * 0.28, cx + facing * r * 1.9, cy + r * 0.28, barrel);
  c.drawCircle(cx, cy, r, silhouette ? paint(colors.steel400) : radial(cx - r * 0.3, cy - r * 0.3, r * 1.4, [colors.steel100, colors.steel400]));
  c.drawCircle(cx, cy, r, paint(colors.steel600, { stroke: Math.max(0.8, r * 0.18) }));
}

/** Draws a ship hull pointing right in local space: x ∈ [0, len·s], y ∈ [0, s]. */
function drawHull(c: SkCanvas, defId: string, len: number, s: number, silhouette: boolean) {
  const L = len * s;
  const pad = s * 0.12;
  const top = pad;
  const bot = s - pad;
  const mid = s / 2;
  const fill = silhouette ? paint(colors.steel400) : linear(0, top, 0, bot, [colors.steel200, colors.steel400, colors.steel600], [0, 0.45, 1]);
  const outline = paint(colors.navy900, { stroke: Math.max(1, s * 0.05), alpha: 0.7 });
  const deck = paint(colors.steel600, { stroke: Math.max(0.8, s * 0.035), alpha: silhouette ? 0.5 : 0.9 });

  if (defId === 'submarine') {
    const hull = rrect(pad, top + s * 0.08, L - pad * 2, bot - top - s * 0.16, (bot - top) / 2);
    c.drawRRect(hull, silhouette ? paint(colors.steel400) : linear(0, top, 0, bot, ['#6E8095', '#3D4C5F', '#26323F']));
    c.drawRRect(hull, outline);
    const tx = L * 0.55;
    c.drawRRect(rrect(tx - s * 0.32, mid - s * 0.15, s * 0.64, s * 0.3, s * 0.15), paint(silhouette ? colors.steel200 : '#8FA0B4'));
    c.drawLine(pad + s * 0.3, mid, L - pad - s * 0.3, mid, deck);
    return;
  }

  if (defId === 'carrier') {
    const hull = poly([
      [pad, top],
      [L - s * 0.55, top],
      [L - pad, mid - s * 0.12],
      [L - pad, mid + s * 0.12],
      [L - s * 0.55, bot],
      [pad, bot],
    ]);
    c.drawPath(hull, fill);
    c.drawPath(hull, outline);
    // Flight deck with dashed centreline.
    const dash = paint(colors.steel100, { stroke: Math.max(0.8, s * 0.05), alpha: silhouette ? 0.4 : 0.85 });
    for (let x = pad + s * 0.3; x < L - s * 0.7; x += s * 0.42) c.drawLine(x, mid, x + s * 0.2, mid, dash);
    c.drawLine(pad + s * 0.2, top + s * 0.12, L - s * 0.8, top + s * 0.12, deck);
    // Island superstructure.
    c.drawRRect(rrect(L * 0.58, bot - s * 0.34, s * 0.9, s * 0.24, s * 0.05), paint(silhouette ? colors.steel200 : colors.steel600));
    if (!silhouette) c.drawCircle(L * 0.58 + s * 0.6, bot - s * 0.22, s * 0.06, paint(colors.signalRed));
    return;
  }

  // Gun ships: pointed bow, rounded stern, turrets by class.
  const hull = poly([
    [pad + s * 0.15, top],
    [L - s * 0.75, top],
    [L - pad, mid],
    [L - s * 0.75, bot],
    [pad + s * 0.15, bot],
    [pad, bot - s * 0.12],
    [pad, top + s * 0.12],
  ]);
  c.drawPath(hull, fill);
  c.drawPath(hull, outline);
  c.drawLine(pad + s * 0.25, mid, L - s * 0.9, mid, deck);

  const r = s * (defId === 'destroyer' ? 0.17 : 0.2);
  const turrets: { x: number; facing: 1 | -1 }[] =
    defId === 'battleship' || defId === 'dreadnought'
      ? [
          { x: L - s * 1.15, facing: 1 },
          { x: L - s * 1.75, facing: 1 },
          { x: s * 0.75, facing: -1 },
        ]
      : defId === 'cruiser'
        ? [
            { x: L - s * 1.0, facing: 1 },
            { x: s * 0.7, facing: -1 },
          ]
        : [{ x: L - s * 0.85, facing: 1 }];
  // Superstructure between the turrets.
  const sx = defId === 'destroyer' ? s * 0.45 : L * 0.42;
  const sw = defId === 'destroyer' ? s * 0.5 : s * 0.7;
  c.drawRRect(rrect(sx, mid - s * 0.17, sw, s * 0.34, s * 0.06), paint(silhouette ? colors.steel200 : '#9AAABD'));
  c.drawRRect(rrect(sx, mid - s * 0.17, sw, s * 0.34, s * 0.06), paint(colors.steel600, { stroke: Math.max(0.6, s * 0.03) }));
  for (const t of turrets) turret(c, t.x, mid, r, t.facing, silhouette);
}

function bounds(cells: Coord[]) {
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

const isStraight = (cells: Coord[]) => cells.every((c) => c.x === cells[0].x) || cells.every((c) => c.y === cells[0].y);

const DIRS: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** Rounded cell blocks bridged to their neighbours, merged into one outline. */
function cellsOutline(cells: Coord[], s: number, ox: number, oy: number, inset: number, radius: number): SkPath {
  const has = new Set(cells.map((c) => `${c.x},${c.y}`));
  const pieces: SkPath[] = [];
  for (const cell of cells) {
    const x = ox + cell.x * s;
    const y = oy + cell.y * s;
    pieces.push(Skia.PathBuilder.Make().addRRect(rrect(x + inset, y + inset, s - inset * 2, s - inset * 2, radius)).detach());
    if (has.has(`${cell.x + 1},${cell.y}`)) pieces.push(Skia.PathBuilder.Make().addRect(rect(x + s / 2, y + inset, s, s - inset * 2)).detach());
    if (has.has(`${cell.x},${cell.y + 1}`)) pieces.push(Skia.PathBuilder.Make().addRect(rect(x + inset, y + s / 2, s - inset * 2, s)).detach());
  }
  return pieces.reduce((acc, p) => Skia.Path.MakeFromOp(acc, p, PathOp.Union) ?? acc);
}

/** Polyomino hull (T/L/Z): one merged deck, turrets on the arm ends, bridge at the bends. */
function drawShapedHull(c: SkCanvas, cells: Coord[], s: number, ox: number, oy: number, silhouette: boolean) {
  const b = bounds(cells);
  const pad = s * 0.12;
  const hull = cellsOutline(cells, s, ox, oy, pad, s * 0.3);
  const top = oy + b.minY * s;
  const bot = oy + (b.maxY + 1) * s;
  c.drawPath(hull, silhouette ? paint(colors.steel400) : linear(0, top, 0, bot, [colors.steel200, colors.steel400, colors.steel600], [0, 0.45, 1]));
  c.drawPath(hull, paint(colors.navy900, { stroke: Math.max(1, s * 0.05), alpha: 0.7 }));

  const has = new Set(cells.map((cc) => `${cc.x},${cc.y}`));
  const center = (cc: Coord) => [ox + (cc.x + 0.5) * s, oy + (cc.y + 0.5) * s] as const;
  const deck = paint(colors.steel600, { stroke: Math.max(0.8, s * 0.035), alpha: silhouette ? 0.5 : 0.9 });
  for (const cell of cells) {
    const [cx, cy] = center(cell);
    for (const [dx, dy] of DIRS.slice(0, 2)) {
      if (has.has(`${cell.x + dx},${cell.y + dy}`)) c.drawLine(cx, cy, cx + dx * s, cy + dy * s, deck);
    }
  }

  const r = s * 0.2;
  for (const cell of cells) {
    const [cx, cy] = center(cell);
    const links = DIRS.filter(([dx, dy]) => has.has(`${cell.x + dx},${cell.y + dy}`));
    if (links.length === 1) {
      const [dx, dy] = links[0];
      const angle = dx === 1 ? 180 : dx === -1 ? 0 : dy === 1 ? 270 : 90;
      c.save();
      c.translate(cx, cy);
      c.rotate(angle, 0, 0);
      turret(c, -s * 0.08, 0, r, 1, silhouette);
      c.restore();
    } else if (links.length >= 3 || (links.length === 2 && links[0][0] !== -links[1][0])) {
      const w = s * 0.5;
      c.drawRRect(rrect(cx - w / 2, cy - w / 2, w, w, s * 0.08), paint(silhouette ? colors.steel200 : '#9AAABD'));
      c.drawRRect(rrect(cx - w / 2, cy - w / 2, w, w, s * 0.08), paint(colors.steel600, { stroke: Math.max(0.6, s * 0.03) }));
      c.drawCircle(cx, cy, s * 0.11, paint(silhouette ? colors.steel400 : colors.steel600));
      if (!silhouette && links.length >= 3) c.drawCircle(cx + w * 0.3, cy - w * 0.3, s * 0.05, paint(colors.signalRed));
    } else {
      c.drawRRect(rrect(cx - s * 0.14, cy - s * 0.14, s * 0.28, s * 0.28, s * 0.04), paint(silhouette ? colors.steel200 : '#8FA0B4'));
    }
  }
}

/**
 * Draws a ship in board space. `ox`/`oy` is the pixel origin of cell (0,0), `s` the cell size.
 */
export function drawShip(c: SkCanvas, ship: ShipDrawInput, s: number, ox: number, oy: number, opts: ShipDrawOptions = {}) {
  if (!ship.cells.length) return;
  const b = bounds(ship.cells);

  if (isStraight(ship.cells)) {
    const horizontal = b.maxX - b.minX >= b.maxY - b.minY;
    const len = horizontal ? b.maxX - b.minX + 1 : b.maxY - b.minY + 1;
    const flipped = ship.rotation === 180 || ship.rotation === 270;
    c.save();
    c.translate(ox + b.minX * s, oy + b.minY * s);
    if (!horizontal) {
      c.translate(s, 0);
      c.rotate(90, 0, 0);
    }
    if (flipped) {
      c.translate(len * s, s);
      c.scale(-1, -1);
    }
    drawHull(c, ship.defId, len, s, !!opts.silhouette);
    c.restore();
  } else {
    drawShapedHull(c, ship.cells, s, ox, oy, !!opts.silhouette);
  }

  for (const d of opts.damaged ?? []) {
    const cx = ox + (d.x + 0.5) * s;
    const cy = oy + (d.y + 0.5) * s;
    c.drawCircle(cx, cy, s * 0.36, radial(cx, cy, s * 0.36, ['#1A1A1A', 'rgba(40,20,10,0.85)', 'rgba(0,0,0,0)'], [0, 0.55, 1]));
  }

  if (opts.sunk || opts.tint) {
    const box = cellsOutline(ship.cells, s, ox, oy, s * 0.06, s * 0.2);
    if (opts.sunk) {
      c.drawPath(box, paint('#05080D', { alpha: 0.55 }));
      c.drawPath(box, paint(colors.signalRed, { stroke: Math.max(1.5, s * 0.07) }));
    } else if (opts.tint) {
      const col = opts.tint === 'valid' ? colors.radarGreen : colors.signalRed;
      c.drawPath(box, paint(col, { alpha: 0.28 }));
      c.drawPath(box, paint(col, { stroke: Math.max(1.5, s * 0.06) }));
    }
  }
}

/** Pixel size of a ship shape (cells normalized to start at 0,0) drawn with cell size `s`. */
export function shipIconSize(cells: Coord[], s: number) {
  const b = bounds(cells);
  return { width: (b.maxX + 1) * s, height: (b.maxY + 1) * s };
}

/** Ship of any shape drawn standalone; `cells` are normalized to start at (0,0). */
export function drawShipShape(c: SkCanvas, defId: string, cells: Coord[], rotation: Rotation, s: number, opts: ShipDrawOptions = {}) {
  drawShip(c, { defId, cells, rotation }, s, 0, 0, opts);
  if (opts.sunk) {
    // Red strike-through for the fleet tracker.
    const { width, height } = shipIconSize(cells, s);
    const strike = paint(colors.signalRed, { stroke: Math.max(1.5, s * 0.1), cap: 'round' });
    if (height > width) c.drawLine(s * 0.15, s * 0.2, width - s * 0.15, height - s * 0.2, strike);
    else c.drawLine(s * 0.2, height - s * 0.15, width - s * 0.2, s * 0.15, strike);
  }
}

/** Straight ship drawn standalone (illustrations), horizontal or vertical. */
export function drawShipIcon(c: SkCanvas, defId: string, len: number, s: number, opts: ShipDrawOptions & { vertical?: boolean } = {}) {
  const cells = Array.from({ length: len }, (_, i) => (opts.vertical ? { x: 0, y: i } : { x: i, y: 0 }));
  drawShipShape(c, defId, cells, opts.vertical ? 90 : 0, s, opts);
}
