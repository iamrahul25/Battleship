import { BlurMask, Canvas, Circle, Group, Line, Picture, Rect, vec } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import { Easing, useDerivedValue, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { type Coord, inBounds, isTargetable, parseKey, type PlacedShip, type SonarResult } from '@shared/engine';
import { useImageGraphics } from '@/art/spriteSet';
import type { ActiveFx } from '@/stores/match';
import { colors, fonts } from '@/theme';
import { type BoardLike, boardPicture } from './boardPicture';
import { ShotFx } from './Fx';
import { Water } from './Water';

export interface BattleGridProps {
  /** Total component size in px (square, including labels). */
  size: number;
  board: BoardLike;
  kind: 'target' | 'own';
  showLabels?: boolean;
  interactive?: boolean;
  onFire?: (c: Coord) => void;
  /** Cells affected by the selected weapon when aimed at `c`. */
  aimPattern?: (c: Coord) => Coord[];
  aimTone?: 'attack' | 'scan';
  sonar?: SonarResult[];
  fx?: ActiveFx | null;
  revealed?: PlacedShip[];
  reducedMotion?: boolean;
}

export const LABEL_RATIO = 0.55;

export function gridGeometry(size: number, cols: number, rows: number, showLabels: boolean) {
  const n = Math.max(cols, rows);
  const cell = showLabels ? size / (n + LABEL_RATIO) : size / n;
  const gutter = showLabels ? cell * LABEL_RATIO : 0;
  return { cell, gutter, gridW: cell * cols, gridH: cell * rows };
}

/** Coordinate label font size that keeps two-digit row numbers on one line inside the gutter. */
export function labelFontSize(cell: number, gutter: number, rows: number, max = 14) {
  const digits = String(rows).length;
  return Math.max(7, Math.min(max, cell * 0.42, gutter / (digits * 0.62)));
}

function Reticle({ c, s, tone }: { c: Coord; s: number; tone: 'attack' | 'scan' }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse]);
  const cx = (c.x + 0.5) * s;
  const cy = (c.y + 0.5) * s;
  const r = useDerivedValue(() => s * (0.34 + pulse.value * 0.08));
  const col = tone === 'scan' ? colors.radarGreen : colors.signalRed;
  const arm = s * 0.5;
  return (
    <Group>
      <Circle cx={cx} cy={cy} r={r} color={col} style="stroke" strokeWidth={2} />
      <Line p1={vec(cx - arm, cy)} p2={vec(cx - s * 0.18, cy)} color={col} strokeWidth={2} />
      <Line p1={vec(cx + s * 0.18, cy)} p2={vec(cx + arm, cy)} color={col} strokeWidth={2} />
      <Line p1={vec(cx, cy - arm)} p2={vec(cx, cy - s * 0.18)} color={col} strokeWidth={2} />
      <Line p1={vec(cx, cy + s * 0.18)} p2={vec(cx, cy + arm)} color={col} strokeWidth={2} />
    </Group>
  );
}

function FireLoops({ cells, s, animate }: { cells: Coord[]; s: number; animate: boolean }) {
  const flicker = useSharedValue(0);
  useEffect(() => {
    if (animate) flicker.value = withRepeat(withTiming(1, { duration: 420, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [animate, flicker]);
  const op = useDerivedValue(() => 0.55 + flicker.value * 0.35);
  const r = useDerivedValue(() => s * (0.16 + flicker.value * 0.05));
  if (!cells.length) return null;
  return (
    <Group opacity={op}>
      {cells.map((c) => (
        <Circle key={`${c.x},${c.y}`} cx={(c.x + 0.5) * s + s * 0.1} cy={(c.y + 0.5) * s - s * 0.12} r={r} color={colors.fireOrange}>
          <BlurMask blur={s * 0.08} style="normal" />
        </Circle>
      ))}
    </Group>
  );
}

function BattleGridImpl({
  size,
  board,
  kind,
  showLabels = true,
  interactive = false,
  onFire,
  aimPattern,
  aimTone = 'attack',
  sonar,
  fx,
  revealed,
  reducedMotion = false,
}: BattleGridProps) {
  const { cell: s, gutter, gridW, gridH } = gridGeometry(size, board.width, board.height, showLabels);
  const [hoverCell, setHover] = useState<Coord | null>(null);

  const imageGraphics = useImageGraphics();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const picture = useMemo(() => boardPicture(board, s, { revealed }), [board, s, revealed, imageGraphics]);
  const fireCells = useMemo(
    () =>
      Object.keys(board.shots)
        .filter((k) => board.shots[k] === 'hit')
        .map(parseKey),
    [board.shots],
  );

  const toCell = (x: number, y: number): Coord | null => {
    const c = { x: Math.floor(x / s), y: Math.floor(y / s) };
    return inBounds(board, c) ? c : null;
  };

  const fireAt = (x: number, y: number) => {
    const c = toCell(x, y);
    if (c && onFire) onFire(c);
  };

  // A pan only activates on a move event, so a perfectly still tap fails it;
  // the competing tap gesture catches those touches.
  const pan = usePanGesture({
    enabled: interactive,
    minDistance: 0,
    runOnJS: true,
    onBegin: (e) => setHover(toCell(e.x, e.y)),
    onUpdate: (e) => setHover(toCell(e.x, e.y)),
    onFinalize: (e) => {
      setHover(null);
      if (!e.canceled) fireAt(e.x, e.y);
    },
  });
  const tap = useTapGesture({
    enabled: interactive,
    maxDuration: 10_000,
    runOnJS: true,
    onActivate: (e) => fireAt(e.x, e.y),
  });
  const gesture = useCompetingGestures(pan, tap);

  const hover = interactive ? hoverCell : null;
  const aimCells = hover && aimPattern ? aimPattern(hover) : hover ? [hover] : [];
  const hoverValid = hover ? isTargetable(board, hover) || aimTone === 'scan' || aimCells.length > 1 : false;

  const letters = Array.from({ length: board.width }, (_, i) => String.fromCharCode(65 + i));
  const numbers = Array.from({ length: board.height }, (_, i) => String(i + 1));
  const labelSize = labelFontSize(s, gutter, board.height);

  return (
    <View style={{ width: gutter + gridW, height: gutter + gridH }}>
      {showLabels && (
        <>
          <View style={[styles.row, { left: gutter, height: gutter, width: gridW }]} pointerEvents="none">
            {letters.map((l) => (
              <Text key={l} style={[styles.label, { width: s, fontSize: labelSize, lineHeight: gutter }]}>
                {l}
              </Text>
            ))}
          </View>
          <View style={[styles.col, { top: gutter, width: gutter, height: gridH }]} pointerEvents="none">
            {numbers.map((n) => (
              <Text key={n} numberOfLines={1} style={[styles.label, { height: s, lineHeight: s, fontSize: labelSize, width: gutter }]}>
                {n}
              </Text>
            ))}
          </View>
        </>
      )}
      <GestureDetector gesture={gesture}>
        <View style={[styles.grid, { left: gutter, top: gutter, width: gridW, height: gridH }]}>
          <Canvas style={{ width: gridW, height: gridH }}>
            <Water width={gridW} height={gridH} tone={kind === 'own' ? 1 : 0} animate={!reducedMotion} />
            <Picture picture={picture} />
            <FireLoops cells={fireCells} s={s} animate={!reducedMotion} />
            {(sonar ?? []).map((r, i) => {
              const xs = r.area.map((c) => c.x);
              const ys = r.area.map((c) => c.y);
              const x0 = Math.min(...xs) * s;
              const y0 = Math.min(...ys) * s;
              return (
                <Rect
                  key={i}
                  x={x0 + 2}
                  y={y0 + 2}
                  width={(Math.max(...xs) + 1) * s - x0 - 4}
                  height={(Math.max(...ys) + 1) * s - y0 - 4}
                  color={colors.radarGreen}
                  style="stroke"
                  strokeWidth={1.5}
                  opacity={0.55}
                />
              );
            })}
            {aimCells.map((c) => (
              <Rect
                key={`aim${c.x},${c.y}`}
                x={c.x * s + 1}
                y={c.y * s + 1}
                width={s - 2}
                height={s - 2}
                color={aimTone === 'scan' ? colors.radarGreen : hoverValid ? colors.signalRed : colors.steel400}
                opacity={0.28}
              />
            ))}
            {hover && <Reticle c={hover} s={s} tone={aimTone} />}
            {fx && (
              <ShotFx
                key={`${fx.id}-${fx.stage}`}
                event={fx.event}
                stage={fx.stage}
                s={s}
                cols={board.width}
                rows={board.height}
                flightMs={fx.flightMs}
                fromTop={kind === 'own'}
                reduced={reducedMotion}
              />
            )}
          </Canvas>
          {(sonar ?? []).map((r, i) => {
            const xs = r.area.map((c) => c.x);
            const ys = r.area.map((c) => c.y);
            const cx = ((Math.min(...xs) + Math.max(...xs) + 1) / 2) * s;
            const cy = ((Math.min(...ys) + Math.max(...ys) + 1) / 2) * s;
            const d = Math.max(18, s * 0.7);
            return (
              <View key={i} pointerEvents="none" style={[styles.sonarBadge, { left: cx - d / 2, top: cy - d / 2, width: d, height: d, borderRadius: d / 2 }]}>
                <Text style={[styles.sonarText, { fontSize: d * 0.55 }]}>{r.shipCellsFound}</Text>
              </View>
            );
          })}
        </View>
      </GestureDetector>
    </View>
  );
}

export const BattleGrid = memo(BattleGridImpl);

const styles = StyleSheet.create({
  row: { position: 'absolute', top: 0, flexDirection: 'row' },
  col: { position: 'absolute', left: 0 },
  label: { fontFamily: fonts.bodyBold, color: colors.steel400, textAlign: 'center' },
  grid: { position: 'absolute', borderRadius: 4, overflow: 'hidden' },
  sonarBadge: {
    position: 'absolute',
    backgroundColor: 'rgba(10,22,40,0.85)',
    borderWidth: 2,
    borderColor: colors.radarGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sonarText: { fontFamily: fonts.heading, color: colors.radarGreen },
});
