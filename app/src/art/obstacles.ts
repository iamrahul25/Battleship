import type { SkCanvas } from '@shopify/react-native-skia';
import type { ObstacleKind } from '@shared/engine';
import { colors } from '@/theme';
import { linear, paint, poly, radial, rrect } from './draw';

/** Stable pseudo-random value in [0, 1) per cell, so rocks keep their shape across redraws. */
function jitter(x: number, y: number, i: number) {
  const v = Math.sin(x * 127.1 + y * 311.7 + i * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

function drawRock(c: SkCanvas, x: number, y: number, s: number) {
  const cx = (x + 0.5) * s;
  const cy = (y + 0.5) * s;
  const pts: [number, number][] = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + jitter(x, y, i) * 0.4;
    const r = s * (0.3 + jitter(x, y, i + 10) * 0.1);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85]);
  }
  const rock = poly(pts);
  c.drawCircle(cx, cy + s * 0.04, s * 0.42, paint('#BFE3F2', { alpha: 0.18 }));
  c.drawPath(rock, radial(cx - s * 0.1, cy - s * 0.12, s * 0.45, ['#AEB6BF', '#6E7782', '#3D444D']));
  c.drawPath(rock, paint(colors.navy950, { stroke: Math.max(1, s * 0.04), alpha: 0.8 }));
  c.drawLine(cx - s * 0.12, cy - s * 0.05, cx + s * 0.05, cy + s * 0.08, paint('#3D444D', { stroke: Math.max(0.8, s * 0.03), alpha: 0.7 }));
}

type IslandLayer = 'shallows' | 'sand' | 'trees';

function drawIsland(c: SkCanvas, x: number, y: number, s: number, has: (x: number, y: number) => boolean, layer: IslandLayer) {
  const px = x * s;
  const py = y * s;
  const pad = s * 0.08;
  // Sand runs into neighbouring island cells so clusters read as one landmass.
  const left = has(x - 1, y) ? 0 : pad;
  const right = has(x + 1, y) ? 0 : pad;
  const top = has(x, y - 1) ? 0 : pad;
  const bottom = has(x, y + 1) ? 0 : pad;
  const w = s - left - right;
  const h = s - top - bottom;
  if (layer === 'shallows') {
    const g = s * 0.05;
    c.drawRRect(rrect(px + left - g, py + top - g, w + g * 2, h + g * 2, s * 0.32), paint('#7FD3E6', { alpha: 0.35 }));
  } else if (layer === 'sand') {
    c.drawRRect(rrect(px + left, py + top, w, h, s * 0.26), linear(0, py, 0, py + s, ['#F0DDA4', '#D9BC72', '#B8964F']));
  } else {
    const cx = px + s * 0.5;
    const cy = py + s * 0.5;
    c.drawCircle(cx - s * 0.1, cy + s * 0.04, s * 0.17, paint('#1F6B38'));
    c.drawCircle(cx + s * 0.08, cy - s * 0.06, s * 0.19, paint('#2F8F4E'));
    c.drawCircle(cx + s * 0.02, cy - s * 0.12, s * 0.08, paint('#5FBF6E'));
  }
}

function drawReef(c: SkCanvas, x: number, y: number, s: number) {
  const px = x * s;
  const py = y * s;
  c.drawRRect(rrect(px + s * 0.08, py + s * 0.08, s * 0.84, s * 0.84, s * 0.3), paint('#3FD0C9', { alpha: 0.28 }));
  c.drawRRect(rrect(px + s * 0.08, py + s * 0.08, s * 0.84, s * 0.84, s * 0.3), paint('#7FE8E1', { stroke: Math.max(0.8, s * 0.03), alpha: 0.55 }));
  const coral = ['#FF8A65', '#F06292', '#FFB74D'];
  for (let i = 0; i < 5; i++) {
    const cx = px + s * (0.22 + jitter(x, y, i) * 0.56);
    const cy = py + s * (0.22 + jitter(x, y, i + 5) * 0.56);
    c.drawCircle(cx, cy, s * (0.05 + jitter(x, y, i + 9) * 0.04), paint(coral[i % coral.length], { alpha: 0.9 }));
  }
}

function drawMine(c: SkCanvas, x: number, y: number, s: number, triggered: boolean) {
  const cx = (x + 0.5) * s;
  const cy = (y + 0.5) * s;
  const r = s * 0.22;
  if (triggered) {
    c.drawCircle(cx, cy, s * 0.42, radial(cx, cy, s * 0.42, ['rgba(20,10,5,0.85)', 'rgba(60,25,10,0.5)', 'rgba(0,0,0,0)'], [0, 0.6, 1]));
    c.drawCircle(cx, cy, s * 0.3, paint(colors.signalRed, { stroke: Math.max(1.2, s * 0.05), alpha: 0.9 }));
  } else {
    c.drawCircle(cx, cy, s * 0.45, radial(cx, cy, s * 0.45, ['rgba(255,90,70,0.35)', 'rgba(255,90,70,0.12)', 'rgba(255,90,70,0)'], [0, 0.6, 1]));
  }
  const spike = paint(triggered ? '#5A3A2A' : '#8A949F', { stroke: Math.max(1, s * 0.06), cap: 'round' });
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    const len = triggered && i % 3 === 0 ? 1.15 : 1.5;
    c.drawLine(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(a) * r * len, cy + Math.sin(a) * r * len, spike);
  }
  c.drawCircle(cx, cy, r, radial(cx - r * 0.35, cy - r * 0.35, r * 1.4, triggered ? ['#6B4A3A', '#2A1A12'] : ['#A3ADB8', '#3A424C']));
  c.drawCircle(cx, cy, r * 0.28, paint(triggered ? colors.fireOrange : colors.signalRed));
}

/**
 * Draws every obstacle on a board in board space. A mine whose cell has been shot is drawn detonated.
 */
export function drawObstacles(c: SkCanvas, obstacles: Record<string, ObstacleKind> | undefined, shots: Record<string, string>, s: number) {
  if (!obstacles) return;
  const has = (x: number, y: number) => obstacles[`${x},${y}`] === 'island';
  const entries = Object.entries(obstacles).map(([k, kind]) => {
    const [x, y] = k.split(',').map(Number);
    return { k, kind, x, y };
  });
  const islands = entries.filter((e) => e.kind === 'island');
  for (const layer of ['shallows', 'sand', 'trees'] as const) {
    for (const e of islands) drawIsland(c, e.x, e.y, s, has, layer);
  }
  for (const e of entries) {
    if (e.kind === 'rock') drawRock(c, e.x, e.y, s);
    else if (e.kind === 'reef') drawReef(c, e.x, e.y, s);
    else if (e.kind === 'mine') drawMine(c, e.x, e.y, s, shots[e.k] === 'miss');
  }
}

/** Single obstacle drawn in a 1×1 cell at the origin (legend icons). */
export function drawObstacleIcon(c: SkCanvas, kind: ObstacleKind, s: number) {
  drawObstacles(c, { '0,0': kind }, {}, s);
}
