import { Canvas, Picture } from '@shopify/react-native-skia';
import { type ComponentRef, useCallback, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  canPlace,
  type Coord,
  createBoard,
  createRng,
  fleetInstances,
  inBounds,
  makePlacedShip,
  type PlacedShip,
  randomFleet,
  randomSeed,
  type Rotation,
  type RuleSet,
  shapeSize,
  shipAt,
  type ShipDef,
} from '@shared/engine';
import { drawShipIcon } from '@/art/ships';
import { SkiaIcon } from '@/art/SkiaIcon';
import { playSound } from '@/audio/SoundManager';
import { haptic } from '@/platform/haptics';
import { colors, fonts, text } from '@/theme';
import { gridGeometry } from '../grid/BattleGrid';
import { boardPicture } from '../grid/boardPicture';
import { Water } from '../grid/Water';

interface Props {
  rules: RuleSet;
  size: number;
  ships: PlacedShip[];
  onChange: (ships: PlacedShip[]) => void;
  disabled?: boolean;
  reducedMotion?: boolean;
}

interface DragState {
  uid: string;
  def: ShipDef;
  index: number;
  rotation: Rotation;
  /** Pointer offset inside the ship, in px. */
  grabX: number;
  grabY: number;
  /** Where the ship returns to on an invalid drop (root coords). */
  homeX: number;
  homeY: number;
}

const DOCK_SCALE = 0.72;

export function PlacementEditor({ rules, size, ships, onChange, disabled, reducedMotion }: Props) {
  const { cell: s, gutter, gridW, gridH } = gridGeometry(size, rules.grid.width, rules.grid.height, true);
  const [rootW, setRootW] = useState(size);
  const rootRef = useRef<ComponentRef<typeof View>>(null);
  /** Window position of the root view; dock gestures report window coordinates. */
  const rootOrigin = useRef({ x: 0, y: 0 });
  const measureRoot = () =>
    rootRef.current?.measureInWindow((x, y) => {
      rootOrigin.current = { x, y };
    });
  const gridStart = useRef({ x: 0, y: 0 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hover, setHover] = useState<{ origin: Coord; valid: boolean } | null>(null);

  const fx = useSharedValue(0);
  const fy = useSharedValue(0);
  const lift = useSharedValue(0);
  const shake = useSharedValue(0);

  const gridX = (rootW - size) / 2 + gutter;
  const gridY = gutter;
  // Room for the hint plus two rows of dock ships, so the grid doesn't jump as ships leave the dock.
  const dockMinHeight = 26 + 2 * (s * DOCK_SCALE + 18) + 12;

  const instances = useMemo(() => fleetInstances(rules), [rules]);
  const placedUids = new Set(ships.map((sh) => sh.uid));
  const unplaced = instances.filter((i) => !placedUids.has(i.uid));

  const board = useMemo(() => ({ ...createBoard(rules.grid.width, rules.grid.height), ships }), [rules, ships]);
  const ghost = useMemo(() => {
    if (!drag || !hover) return null;
    return { ship: makePlacedShip(drag.def, drag.index, hover.origin, drag.rotation), valid: hover.valid };
  }, [drag, hover]);
  const picture = useMemo(
    () => boardPicture(board, s, { ghost, hiddenShipUid: drag?.uid ?? null }),
    [board, s, ghost, drag?.uid],
  );

  const doShake = useCallback(() => {
    playSound('invalid');
    haptic('error');
    if (!reducedMotion) shake.set(withSequence(withTiming(-8, { duration: 50 }), withTiming(8, { duration: 60 }), withTiming(-5, { duration: 50 }), withTiming(0, { duration: 50 })));
  }, [reducedMotion, shake]);

  const originFor = (d: DragState, px: number, py: number): Coord => ({
    x: Math.round((px - d.grabX - gridX) / s),
    y: Math.round((py - d.grabY - gridY) / s),
  });

  const evaluate = (d: DragState, px: number, py: number) => {
    const origin = originFor(d, px, py);
    const others = { ...board, ships: ships.filter((sh) => sh.uid !== d.uid) };
    const { width, height } = shapeSize(d.def, d.rotation);
    const nearGrid =
      origin.x > -width && origin.y > -height && origin.x < rules.grid.width && origin.y < rules.grid.height;
    if (!nearGrid) return null;
    return { origin, valid: canPlace(others, d.def, origin, d.rotation, rules, d.uid) };
  };

  const startDrag = (d: DragState, px: number, py: number) => {
    if (disabled) return;
    fx.set(px - d.grabX);
    fy.set(py - d.grabY);
    lift.set(withSpring(1, { damping: 14, stiffness: 300 }));
    setDrag(d);
    setHover(evaluate(d, px, py));
    playSound('pickup');
    haptic('light');
  };

  const moveDrag = (px: number, py: number) => {
    if (!drag) return;
    fx.set(px - drag.grabX);
    fy.set(py - drag.grabY);
    const next = evaluate(drag, px, py);
    setHover((prev) =>
      prev?.origin.x === next?.origin.x && prev?.origin.y === next?.origin.y && prev?.valid === next?.valid ? prev : next,
    );
  };

  const commit = (d: DragState, origin: Coord | null) => {
    if (origin) {
      onChange([...ships.filter((sh) => sh.uid !== d.uid), makePlacedShip(d.def, d.index, origin, d.rotation)]);
    }
    setDrag(null);
    setHover(null);
    lift.set(0);
  };

  const endDrag = (px: number, py: number) => {
    if (!drag) return;
    const d = drag;
    const res = evaluate(d, px, py);
    lift.set(withTiming(0, { duration: 150 }));
    if (res?.valid) {
      playSound('drop');
      haptic('light');
      const tx = gridX + res.origin.x * s;
      const ty = gridY + res.origin.y * s;
      fx.set(withTiming(tx, { duration: 110 }));
      fy.set(withTiming(ty, { duration: 110 }, () => scheduleOnRN(commit, d, res.origin)));
    } else {
      doShake();
      fx.set(withSpring(d.homeX, { damping: 18 }));
      fy.set(withSpring(d.homeY, { damping: 18 }, () => scheduleOnRN(commit, d, null)));
    }
  };

  const rotateShip = (ship: PlacedShip) => {
    const inst = instances.find((i) => i.uid === ship.uid);
    if (!inst) return;
    const nextRot: Rotation = ship.rotation === 0 || ship.rotation === 180 ? 90 : 0;
    const others = { ...board, ships: ships.filter((sh) => sh.uid !== ship.uid) };
    const { width, height } = shapeSize(inst.def, nextRot);
    // Try in place first, then nudge back inside the grid.
    const candidates = [
      ship.origin,
      { x: Math.min(ship.origin.x, rules.grid.width - width), y: Math.min(ship.origin.y, rules.grid.height - height) },
    ];
    const fit = candidates.find((o) => canPlace(others, inst.def, o, nextRot, rules, ship.uid));
    if (!fit) return doShake();
    playSound('rotate');
    haptic('light');
    onChange([...others.ships, makePlacedShip(inst.def, inst.index, fit, nextRot)]);
  };

  const autoPlace = (uid: string) => {
    const inst = instances.find((i) => i.uid === uid);
    if (!inst || disabled) return;
    for (let y = 0; y < rules.grid.height; y++)
      for (let x = 0; x < rules.grid.width; x++)
        for (const rot of [0, 90] as Rotation[])
          if (canPlace(board, inst.def, { x, y }, rot, rules)) {
            playSound('drop');
            onChange([...ships, makePlacedShip(inst.def, inst.index, { x, y }, rot)]);
            return;
          }
    doShake();
  };

  // ---- Grid gestures (ships drawn inside the canvas) ----
  const cellFromLocal = (x: number, y: number): Coord | null => {
    const c = { x: Math.floor(x / s), y: Math.floor(y / s) };
    return inBounds(board, c) ? c : null;
  };

  const gridPan = usePanGesture({
    enabled: !disabled,
    minDistance: 6,
    runOnJS: true,
    onBegin: (e) => {
      gridStart.current = { x: e.x, y: e.y };
    },
    onActivate: (e) => {
      const { x: sx, y: sy } = gridStart.current;
      const c = cellFromLocal(sx, sy);
      const ship = c ? shipAt(ships, c) : undefined;
      const inst = ship && instances.find((i) => i.uid === ship.uid);
      if (!ship || !inst) return;
      const minX = Math.min(...ship.cells.map((cc) => cc.x));
      const minY = Math.min(...ship.cells.map((cc) => cc.y));
      const d: DragState = {
        uid: ship.uid,
        def: inst.def,
        index: inst.index,
        rotation: ship.rotation,
        grabX: sx - minX * s,
        grabY: sy - minY * s,
        homeX: gridX + minX * s,
        homeY: gridY + minY * s,
      };
      startDrag(d, gridX + e.x, gridY + e.y);
    },
    onUpdate: (e) => moveDrag(gridX + e.x, gridY + e.y),
    onDeactivate: (e) => endDrag(gridX + e.x, gridY + e.y),
  });
  const gridTap = useTapGesture({
    enabled: !disabled,
    runOnJS: true,
    onActivate: (e) => {
      const c = cellFromLocal(e.x, e.y);
      const ship = c ? shipAt(ships, c) : undefined;
      if (ship) rotateShip(ship);
    },
  });
  const gridGesture = useCompetingGestures(gridPan, gridTap);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: fx.value }, { translateY: fy.value }, { scale: 1 + lift.value * 0.08 }],
    shadowOpacity: lift.value * 0.5,
  }));
  const gridStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const floatW = drag ? shapeSize(drag.def, drag.rotation).width * s : 0;
  const floatH = drag ? shapeSize(drag.def, drag.rotation).height * s : 0;

  return (
    <View
      ref={rootRef}
      style={styles.root}
      onLayout={(e: LayoutChangeEvent) => {
        setRootW(e.nativeEvent.layout.width);
        measureRoot();
      }}
    >
      <Animated.View style={[{ width: size, height: gutter + gridH, alignSelf: 'center' }, gridStyle]}>
        <View style={[styles.labelsRow, { left: gutter, height: gutter }]} pointerEvents="none">
          {Array.from({ length: rules.grid.width }, (_, i) => (
            <Text key={i} style={[styles.label, { width: s, lineHeight: gutter }]}>
              {String.fromCharCode(65 + i)}
            </Text>
          ))}
        </View>
        <View style={[styles.labelsCol, { top: gutter, width: gutter }]} pointerEvents="none">
          {Array.from({ length: rules.grid.height }, (_, i) => (
            <Text key={i} style={[styles.label, { height: s, lineHeight: s, width: gutter }]}>
              {i + 1}
            </Text>
          ))}
        </View>
        <GestureDetector gesture={gridGesture}>
          <View style={[styles.grid, { left: gutter, top: gutter, width: gridW, height: gridH }]}>
            <Canvas style={{ width: gridW, height: gridH }}>
              <Water width={gridW} height={gridH} tone={1} animate={!reducedMotion} />
              <Picture picture={picture} />
            </Canvas>
          </View>
        </GestureDetector>
      </Animated.View>

      <View style={[styles.dock, { minHeight: dockMinHeight }]}>
        {unplaced.length === 0 ? (
          <Text style={[text.caption, styles.dockHint]}>Fleet deployed. Tap a ship to rotate, drag to move.</Text>
        ) : (
          <Text style={[text.caption, styles.dockHint]}>Drag ships onto the grid · tap to auto-place</Text>
        )}
        <View style={styles.dockItems}>
          {unplaced.map((inst) => (
            <DockShip
              key={inst.uid}
              def={inst.def}
              s={s}
              hidden={drag?.uid === inst.uid}
              disabled={disabled}
              onBegin={measureRoot}
              onTap={() => autoPlace(inst.uid)}
              onStart={(local, abs) => {
                const o = rootOrigin.current;
                startDrag(
                  {
                    uid: inst.uid,
                    def: inst.def,
                    index: inst.index,
                    rotation: 0,
                    grabX: local.x / DOCK_SCALE,
                    grabY: local.y / DOCK_SCALE,
                    homeX: abs.x - local.x - o.x,
                    homeY: abs.y - local.y - o.y,
                  },
                  abs.x - o.x,
                  abs.y - o.y,
                );
              }}
              onMove={(ax, ay) => moveDrag(ax - rootOrigin.current.x, ay - rootOrigin.current.y)}
              onEnd={(ax, ay) => endDrag(ax - rootOrigin.current.x, ay - rootOrigin.current.y)}
            />
          ))}
        </View>
      </View>

      {drag && (
        <Animated.View pointerEvents="none" style={[styles.floating, { width: floatW, height: floatH }, floatStyle]}>
          <SkiaIcon
            cacheKey={`float:${drag.def.id}:${drag.def.cells.length}:${drag.rotation}:${Math.round(s)}`}
            width={floatW}
            height={floatH}
            draw={(c) => drawShipIcon(c, drag.def.id, drag.def.cells.length, s, { vertical: drag.rotation === 90 || drag.rotation === 270 })}
          />
        </Animated.View>
      )}
    </View>
  );
}

function DockShip({
  def,
  s,
  hidden,
  disabled,
  onBegin,
  onTap,
  onStart,
  onMove,
  onEnd,
}: {
  def: ShipDef;
  s: number;
  hidden: boolean;
  disabled?: boolean;
  onBegin: () => void;
  onTap: () => void;
  /** `local` is the press point inside the dock ship; `abs` is the same point in window coordinates. */
  onStart: (local: Coord, abs: Coord) => void;
  onMove: (absX: number, absY: number) => void;
  onEnd: (absX: number, absY: number) => void;
}) {
  const start = useRef({ local: { x: 0, y: 0 }, abs: { x: 0, y: 0 } });
  const len = def.cells.length;
  const w = len * s * DOCK_SCALE;
  const h = s * DOCK_SCALE;
  const pan = usePanGesture({
    enabled: !disabled,
    minDistance: 4,
    runOnJS: true,
    onBegin: (e) => {
      start.current = { local: { x: e.x, y: e.y }, abs: { x: e.absoluteX, y: e.absoluteY } };
      onBegin();
    },
    onActivate: () => onStart(start.current.local, start.current.abs),
    onUpdate: (e) => onMove(e.absoluteX, e.absoluteY),
    onDeactivate: (e) => onEnd(e.absoluteX, e.absoluteY),
  });
  const tap = useTapGesture({ enabled: !disabled, runOnJS: true, onActivate: onTap });
  const gesture = useCompetingGestures(pan, tap);
  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[styles.dockShip, { opacity: hidden ? 0.15 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={`${def.name}, ${len} cells`}
      >
        <SkiaIcon cacheKey={`dock:${def.id}:${len}:${Math.round(h)}`} width={w} height={h} draw={(c) => drawShipIcon(c, def.id, len, h)} />
        <Text style={styles.dockLabel}>
          {def.name} · {len}
        </Text>
      </View>
    </GestureDetector>
  );
}

export function randomPlacement(rules: RuleSet) {
  return randomFleet(rules, createRng(randomSeed()));
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  labelsRow: { position: 'absolute', top: 0, flexDirection: 'row' },
  labelsCol: { position: 'absolute', left: 0 },
  label: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.steel400, textAlign: 'center' },
  grid: { position: 'absolute', borderRadius: 4, overflow: 'hidden' },
  dock: { marginTop: 14 },
  dockHint: { textAlign: 'center', marginBottom: 8 },
  dockItems: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  dockShip: { alignItems: 'flex-start', padding: 0 },
  dockLabel: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.steel400, marginTop: 2 },
  floating: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 100,
    shadowColor: '#000',
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
});
