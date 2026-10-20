import { BlurMask, Circle, Group, Rect } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { Easing, type SharedValue, useDerivedValue, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import type { Coord, ShotEvent } from '@shared/engine';
import { colors } from '@/theme';

interface CellFxProps {
  x: number;
  y: number;
  s: number;
  delay?: number;
  reduced?: boolean;
}

function useProgress(duration: number, delay = 0) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.quad) }));
  }, [p, duration, delay]);
  return p;
}

function Particle({ p, cx, cy, angle, dist, r, color, gravity }: { p: SharedValue<number>; cx: number; cy: number; angle: number; dist: number; r: number; color: string; gravity: number }) {
  const x = useDerivedValue(() => cx + Math.cos(angle) * dist * p.value);
  const y = useDerivedValue(() => cy + Math.sin(angle) * dist * p.value + gravity * p.value * p.value);
  const op = useDerivedValue(() => (p.value <= 0 ? 0 : 1 - p.value));
  const rad = useDerivedValue(() => r * (1 - p.value * 0.5));
  return <Circle cx={x} cy={y} r={rad} color={color} opacity={op} />;
}

const DEBRIS = Array.from({ length: 8 }, (_, i) => ({ angle: (Math.PI * 2 * i) / 8 + (i % 2) * 0.3, dist: 0.7 + (i % 3) * 0.25 }));
const DROPS = Array.from({ length: 6 }, (_, i) => ({ angle: -Math.PI / 2 + (i - 2.5) * 0.45, dist: 0.45 + (i % 2) * 0.2 }));

export function Explosion({ x, y, s, delay = 0, reduced, big }: CellFxProps & { big?: boolean }) {
  const cx = (x + 0.5) * s;
  const cy = (y + 0.5) * s;
  const p = useProgress(big ? 800 : 620, delay);
  const flashR = useDerivedValue(() => s * (0.2 + p.value * (big ? 1.1 : 0.8)));
  const flashOp = useDerivedValue(() => (p.value <= 0 ? 0 : Math.max(0, 1 - p.value * 1.6)));
  const fireR = useDerivedValue(() => s * (0.15 + Math.sin(Math.min(1, p.value * 1.4) * Math.PI) * (big ? 0.75 : 0.55)));
  const fireOp = useDerivedValue(() => (p.value <= 0 ? 0 : Math.max(0, 1 - p.value)));
  const smokeR = useDerivedValue(() => s * (0.3 + p.value * (big ? 0.9 : 0.65)));
  const smokeOp = useDerivedValue(() => (p.value < 0.3 ? 0 : 0.55 * (1 - p.value)));
  return (
    <Group>
      <Circle cx={cx} cy={cy - s * 0.1} r={smokeR} color="#3A3F47" opacity={smokeOp}>
        <BlurMask blur={s * 0.15} style="normal" />
      </Circle>
      <Circle cx={cx} cy={cy} r={fireR} color={colors.fireOrange} opacity={fireOp}>
        <BlurMask blur={s * 0.12} style="normal" />
      </Circle>
      <Circle cx={cx} cy={cy} r={flashR} color="#FFF3C4" opacity={flashOp}>
        <BlurMask blur={s * 0.2} style="normal" />
      </Circle>
      {!reduced &&
        DEBRIS.map((d, i) => (
          <Particle key={i} p={p} cx={cx} cy={cy} angle={d.angle} dist={d.dist * s * (big ? 1.3 : 1)} r={s * 0.06} color={i % 2 ? '#2B2B2B' : colors.fireOrange} gravity={s * 0.5} />
        ))}
    </Group>
  );
}

export function Splash({ x, y, s, delay = 0, reduced }: CellFxProps) {
  const cx = (x + 0.5) * s;
  const cy = (y + 0.5) * s;
  const p = useProgress(520, delay);
  const r1 = useDerivedValue(() => s * (0.1 + p.value * 0.55));
  const r2 = useDerivedValue(() => s * (0.05 + Math.max(0, p.value - 0.25) * 0.6));
  const op = useDerivedValue(() => (p.value <= 0 ? 0 : 1 - p.value));
  const plumeR = useDerivedValue(() => s * 0.28 * Math.sin(Math.min(1, p.value * 1.3) * Math.PI));
  return (
    <Group>
      <Circle cx={cx} cy={cy} r={plumeR} color="#E8F4FF" opacity={op}>
        <BlurMask blur={s * 0.08} style="normal" />
      </Circle>
      <Circle cx={cx} cy={cy} r={r1} color={colors.missWhite} style="stroke" strokeWidth={Math.max(1.5, s * 0.06)} opacity={op} />
      <Circle cx={cx} cy={cy} r={r2} color={colors.ocean300} style="stroke" strokeWidth={Math.max(1, s * 0.04)} opacity={op} />
      {!reduced && DROPS.map((d, i) => <Particle key={i} p={p} cx={cx} cy={cy} angle={d.angle} dist={d.dist * s} r={s * 0.05} color="#E8F4FF" gravity={s * 0.6} />)}
    </Group>
  );
}

export function ShellFlight({ to, s, cols, rows, duration, fromTop }: { to: Coord; s: number; cols: number; rows: number; duration: number; fromTop: boolean }) {
  const p = useProgress(duration);
  const sx = (cols * s) / 2;
  const sy = fromTop ? -s : rows * s + s;
  const tx = (to.x + 0.5) * s;
  const ty = (to.y + 0.5) * s;
  const arc = rows * s * 0.22;
  const pos = (t: number) => {
    'worklet';
    return { x: sx + (tx - sx) * t, y: sy + (ty - sy) * t - Math.sin(Math.PI * t) * arc };
  };
  const hx = useDerivedValue(() => pos(p.value).x);
  const hy = useDerivedValue(() => pos(p.value).y);
  const t1x = useDerivedValue(() => pos(Math.max(0, p.value - 0.06)).x);
  const t1y = useDerivedValue(() => pos(Math.max(0, p.value - 0.06)).y);
  const t2x = useDerivedValue(() => pos(Math.max(0, p.value - 0.12)).x);
  const t2y = useDerivedValue(() => pos(Math.max(0, p.value - 0.12)).y);
  const r = useDerivedValue(() => s * (0.1 + Math.sin(Math.PI * p.value) * 0.08));
  return (
    <Group>
      <Circle cx={t2x} cy={t2y} r={s * 0.07} color={colors.fireOrange} opacity={0.25} />
      <Circle cx={t1x} cy={t1y} r={s * 0.09} color={colors.fireOrange} opacity={0.45} />
      <Circle cx={hx} cy={hy} r={r} color="#FFE7A8">
        <BlurMask blur={2} style="solid" />
      </Circle>
    </Group>
  );
}

export function SonarSweep({ center, s, cols, rows }: { center: Coord; s: number; cols: number; rows: number }) {
  const p = useProgress(900);
  const x0 = Math.max(0, center.x - 1) * s;
  const y0 = Math.max(0, center.y - 1) * s;
  const x1 = Math.min(cols, center.x + 2) * s;
  const y1 = Math.min(rows, center.y + 2) * s;
  const cx = (center.x + 0.5) * s;
  const cy = (center.y + 0.5) * s;
  const ring = useDerivedValue(() => s * 0.2 + p.value * s * 1.8);
  const op = useDerivedValue(() => 1 - p.value);
  const fillOp = useDerivedValue(() => 0.25 * Math.sin(Math.PI * p.value));
  return (
    <Group>
      <Rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} color={colors.radarGreen} opacity={fillOp} />
      <Group clip={{ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }}>
        <Circle cx={cx} cy={cy} r={ring} color={colors.radarGreen} style="stroke" strokeWidth={3} opacity={op} />
      </Group>
    </Group>
  );
}

/** A jet streaking along the strike line, with its shadow on the water. */
export function AirstrikeFlight({ cells, s, duration }: { cells: Coord[]; s: number; duration: number }) {
  const p = useProgress(duration);
  const first = cells[0];
  const last = cells[cells.length - 1];
  const vertical = first.x === last.x && first.y !== last.y;
  const dx = vertical ? 0 : 1;
  const dy = vertical ? 1 : 0;
  const sx = (first.x + 0.5 - dx * 2) * s;
  const sy = (first.y + 0.5 - dy * 2) * s;
  const ex = (last.x + 0.5 + dx * 2) * s;
  const ey = (last.y + 0.5 + dy * 2) * s;
  const at = (t: number, axis: 'x' | 'y') => {
    'worklet';
    return axis === 'x' ? sx + (ex - sx) * t : sy + (ey - sy) * t;
  };
  const hx = useDerivedValue(() => at(p.value, 'x'));
  const hy = useDerivedValue(() => at(p.value, 'y'));
  const shx = useDerivedValue(() => at(p.value, 'x') + s * 0.35);
  const shy = useDerivedValue(() => at(p.value, 'y') + s * 0.45);
  const t1x = useDerivedValue(() => at(Math.max(0, p.value - 0.05), 'x'));
  const t1y = useDerivedValue(() => at(Math.max(0, p.value - 0.05), 'y'));
  const t2x = useDerivedValue(() => at(Math.max(0, p.value - 0.11), 'x'));
  const t2y = useDerivedValue(() => at(Math.max(0, p.value - 0.11), 'y'));
  return (
    <Group>
      <Circle cx={shx} cy={shy} r={s * 0.22} color="#000" opacity={0.25}>
        <BlurMask blur={s * 0.1} style="normal" />
      </Circle>
      <Circle cx={t2x} cy={t2y} r={s * 0.08} color="#E8F4FF" opacity={0.3} />
      <Circle cx={t1x} cy={t1y} r={s * 0.11} color="#E8F4FF" opacity={0.5} />
      <Circle cx={hx} cy={hy} r={s * 0.17} color="#D8DEE6">
        <BlurMask blur={2} style="solid" />
      </Circle>
    </Group>
  );
}

/** A torpedo running along its track with a foaming wake. */
export function TorpedoRun({ path, s, duration }: { path: Coord[]; s: number; duration: number }) {
  const p = useProgress(duration);
  const first = path[0];
  const last = path[path.length - 1];
  const step = path.length > 1 ? { x: Math.sign(path[1].x - first.x), y: Math.sign(path[1].y - first.y) } : { x: 0, y: 0 };
  const sx = (first.x + 0.5 - step.x * 0.6) * s;
  const sy = (first.y + 0.5 - step.y * 0.6) * s;
  const ex = (last.x + 0.5) * s;
  const ey = (last.y + 0.5) * s;
  const hx = useDerivedValue(() => sx + (ex - sx) * p.value);
  const hy = useDerivedValue(() => sy + (ey - sy) * p.value);
  const wakeW = useDerivedValue(() => Math.max(1, Math.abs(ex - sx) * p.value) + (step.y ? s * 0.22 : 0));
  const wakeH = useDerivedValue(() => Math.max(1, Math.abs(ey - sy) * p.value) + (step.x ? s * 0.22 : 0));
  const wakeX = useDerivedValue(() => (step.x < 0 ? hx.value : sx) - (step.y ? s * 0.11 : 0));
  const wakeY = useDerivedValue(() => (step.y < 0 ? hy.value : sy) - (step.x ? s * 0.11 : 0));
  return (
    <Group>
      <Rect x={wakeX} y={wakeY} width={wakeW} height={wakeH} color="#E8F4FF" opacity={0.35}>
        <BlurMask blur={s * 0.08} style="normal" />
      </Rect>
      <Circle cx={hx} cy={hy} r={s * 0.16} color="#1E2228" />
      <Circle cx={hx} cy={hy} r={s * 0.07} color={colors.signalRed} />
    </Group>
  );
}

/** Plays the animation for one shot event on the board it landed on. */
export function ShotFx({
  event,
  stage,
  s,
  cols,
  rows,
  flightMs,
  fromTop,
  reduced,
}: {
  event: ShotEvent;
  stage: 'flight' | 'impact';
  s: number;
  cols: number;
  rows: number;
  flightMs: number;
  fromTop: boolean;
  reduced: boolean;
}) {
  if (event.weaponId === 'sonar') return <SonarSweep center={event.target} s={s} cols={cols} rows={rows} />;
  if (stage === 'flight') {
    if (reduced) return null;
    if (event.weaponId === 'torpedo' && event.path?.length) return <TorpedoRun path={event.path} s={s} duration={flightMs} />;
    if (event.weaponId === 'airstrike' && event.results.length) {
      return <AirstrikeFlight cells={event.results.map((r) => r.coord)} s={s} duration={flightMs} />;
    }
    const targets = event.weaponId === 'barrage' ? event.results.map((r) => r.coord) : [event.target];
    return (
      <Group>
        {targets.map((to, i) => (
          <ShellFlight key={i} to={to} s={s} cols={cols} rows={rows} duration={flightMs} fromTop={fromTop} />
        ))}
      </Group>
    );
  }
  const staggered = event.weaponId === 'artillery' || event.weaponId === 'airstrike' || event.weaponId === 'barrage';
  const items: { c: Coord; kind: 'hit' | 'miss' | 'sunk'; delay: number }[] = [];
  event.results.forEach((r, i) => {
    const base = staggered ? i * 90 : 0;
    if (r.result === 'sunk' && r.ship) {
      r.ship.cells.forEach((c, j) => items.push({ c, kind: 'sunk', delay: base + j * 110 }));
    } else items.push({ c: r.coord, kind: r.obstacle === 'mine' ? 'hit' : r.result, delay: base });
  });
  return (
    <Group>
      {items.map((it, i) =>
        it.kind === 'miss' ? (
          <Splash key={i} x={it.c.x} y={it.c.y} s={s} delay={it.delay} reduced={reduced} />
        ) : (
          <Explosion key={i} x={it.c.x} y={it.c.y} s={s} delay={it.delay} reduced={reduced} big={it.kind === 'sunk'} />
        ),
      )}
    </Group>
  );
}