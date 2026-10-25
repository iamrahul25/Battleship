import { Canvas, Picture } from '@shopify/react-native-skia';
import { type ComponentRef, type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  canPlace,
  canPlaceMine,
  type Coord,
  createBoard,
  createRng,
  fleetInstances,
  inBounds,
  makePlacedShip,
  type ObstacleKind,
  obstacleFields,
  type PlacedShip,
  randomFleet,
  randomMines,
  randomSeed,
  type Rotation,
  type RuleSet,
  sameCoord,
  shapeCells,
  shapeSize,
  shipAt,
  type ShipDef,
  terrainOnly,
  uniqueRotations,
  withMines,
} from '@shared/engine';
import { drawObstacleIcon } from '@/art/obstacles';
import { drawShipShape, shipIconSize } from '@/art/ships';
import { SkiaIcon } from '@/art/SkiaIcon';
import { playSound } from '@/audio/SoundManager';
import { haptic } from '@/platform/haptics';
import { colors, fonts, text } from '@/theme';
import { gridGeometry, labelFontSize } from '../grid/BattleGrid';
import { boardPicture } from '../grid/boardPicture';
import { Water } from '../grid/Water';

interface Props {
  rules: RuleSet;
  /** This player's obstacles; ships can't be placed on them. Mines in here are ignored in favour of `mines`. */
  obstacles?: Record<string, ObstacleKind>;
  size: number;
  ships: PlacedShip[];
  onChange: (ships: PlacedShip[]) => void;
  /** Mines placed on the grid so far. */
  mines: Coord[];
  /** How many mines this player must lay. */
  mineCount: number;
  onMinesChange: (mines: Coord[]) => void;
  disabled?: boolean;
  reducedMotion?: boolean;
}

interface DragBase {
  uid: string;
  /** Pointer offset inside the dragged item, in px. */
  grabX: number;
  grabY: number;
  /** Where the item returns to on an invalid drop (root coords). */
  homeX: number;
  homeY: number;
}

type DragItem =
  | { kind: 'ship'; def: ShipDef; index: number; rotation: Rotation }
  /** `from` is the mine's grid cell, or null when it comes from the dock. */
  | { kind: 'mine'; from: Coord | null };

type DragState = DragBase & DragItem;

const DOCK_SCALE = 0.72;

const shapeSignature = (def: ShipDef, r: Rotation) =>
  shapeCells(def, r)
    .map((c) => `${c.x},${c.y}`)
    .sort()
    .join('|');
const sameShape = (def: ShipDef, a: Rotation, b: Rotation) => shapeSignature(def, a) === shapeSignature(def, b);

const dragSize = (d: DragState) => (d.kind === 'ship' ? shapeSize(d.def, d.rotation) : { width: 1, height: 1 });
const minesWithout = (mines: Coord[], from: Coord | null) => (from ? mines.filter((m) => !sameCoord(m, from)) : mines);

export function PlacementEditor({
  rules,
  obstacles,
  size,
  ships,
  onChange,
  mines,
  mineCount,
  onMinesChange,
  disabled,
  reducedMotion,
}: Props) {
  const { cell: s, gutter, gridW, gridH } = gridGeometry(size, rules.grid.width, rules.grid.height, true);
  const labelSize = labelFontSize(s, gutter, rules.grid.height, 12);
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
  const instances = useMemo(() => fleetInstances(rules), [rules]);
  // Room for the hint plus two rows of dock ships, so the grid doesn't jump as ships leave the dock.
  const dockRowCells = Math.max(1, ...rules.fleet.map((d) => shapeSize(d, 0).height));
  const dockMinHeight = 26 + 2 * (dockRowCells * s * DOCK_SCALE + 18) + 12;
  const placedUids = new Set(ships.map((sh) => sh.uid));
  const unplaced = instances.filter((i) => !placedUids.has(i.uid));
  const dockMines = Array.from({ length: Math.max(0, mineCount - mines.length) }, (_, i) => `mine#${i}`);

  const terrain = useMemo(() => terrainOnly(obstacles), [obstacles]);
  const board = useMemo(
    () => ({ ...createBoard(rules.grid.width, rules.grid.height), ...obstacleFields(withMines(terrain, mines)), ships }),
    [rules, terrain, mines, ships],
  );
  const draggedMine = drag?.kind === 'mine' ? drag.from : null;
  const shownBoard = useMemo(
    () => (draggedMine ? { ...board, ...obstacleFields(withMines(terrain, minesWithout(mines, draggedMine))) } : board),
    [board, terrain, mines, draggedMine],
  );
  const ghost = useMemo(() => {
    if (drag?.kind !== 'ship' || !hover) return null;
    return { ship: makePlacedShip(drag.def, drag.index, hover.origin, drag.rotation), valid: hover.valid };
  }, [drag, hover]);
  const mineGhost = useMemo(
    () => (drag?.kind === 'mine' && hover ? { coord: hover.origin, valid: hover.valid } : null),
    [drag, hover],
  );
  const hiddenShipUid = drag?.kind === 'ship' ? drag.uid : null;
  const picture = useMemo(
    () => boardPicture(shownBoard, s, { ghost, mineGhost, hiddenShipUid }),
    [shownBoard, s, ghost, mineGhost, hiddenShipUid],
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
    const { width, height } = dragSize(d);
    const nearGrid =
      origin.x > -width && origin.y > -height && origin.x < rules.grid.width && origin.y < rules.grid.height;
    if (!nearGrid) return null;
    if (d.kind === 'mine') {
      const others = { ...board, ...obstacleFields(withMines(terrain, minesWithout(mines, d.from))) };
      return { origin, valid: canPlaceMine(others, origin) };
    }
    const others = { ...board, ships: ships.filter((sh) => sh.uid !== d.uid) };
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
      if (d.kind === 'ship') onChange([...ships.filter((sh) => sh.uid !== d.uid), makePlacedShip(d.def, d.index, origin, d.rotation)]);
      else onMinesChange([...minesWithout(mines, d.from), origin]);
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
    const others = { ...board, ships: ships.filter((sh) => sh.uid !== ship.uid) };
    // Cycle through the distinct orientations, skipping any that don't fit here.
    const rotations = uniqueRotations(inst.def);
    const start = Math.max(0, rotations.findIndex((r) => sameShape(inst.def, r, ship.rotation)));
    for (let step = 1; step < rotations.length; step++) {
      const nextRot = rotations[(start + step) % rotations.length];
      const { width, height } = shapeSize(inst.def, nextRot);
      // Try in place first, then nudge back inside the grid.
      const candidates = [
        ship.origin,
        { x: Math.min(ship.origin.x, rules.grid.width - width), y: Math.min(ship.origin.y, rules.grid.height - height) },
      ];
      const fit = candidates.find((o) => canPlace(others, inst.def, o, nextRot, rules, ship.uid));
      if (fit) {
        playSound('rotate');
        haptic('light');
        onChange([...others.ships, makePlacedShip(inst.def, inst.index, fit, nextRot)]);
        return;
      }
    }
    doShake();
  };

  const autoPlace = (uid: string) => {
    const inst = instances.find((i) => i.uid === uid);
    if (!inst || disabled) return;
    for (let y = 0; y < rules.grid.height; y++)
      for (let x = 0; x < rules.grid.width; x++)
        for (const rot of uniqueRotations(inst.def))
          if (canPlace(board, inst.def, { x, y }, rot, rules)) {
            playSound('drop');
            onChange([...ships, makePlacedShip(inst.def, inst.index, { x, y }, rot)]);
            return;
          }
    doShake();
  };

  const autoPlaceMine = () => {
    if (disabled) return;
    const [spot] = randomMines(board, 1, createRng(randomSeed()));
    if (!spot) return doShake();
    playSound('drop');
    onMinesChange([...mines, spot]);
  };

  // ---- Grid gestures (ships and mines drawn inside the canvas) ----
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
      if (!c) return;
      const mine = mines.find((m) => sameCoord(m, c));
      if (mine) {
        startDrag(
          {
            kind: 'mine',
            uid: `mine@${mine.x},${mine.y}`,
            from: mine,
            grabX: sx - mine.x * s,
            grabY: sy - mine.y * s,
            homeX: gridX + mine.x * s,
            homeY: gridY + mine.y * s,
          },
          gridX + e.x,
          gridY + e.y,
        );
        return;
      }
      const ship = shipAt(ships, c);
      const inst = ship && instances.find((i) => i.uid === ship.uid);
      if (!ship || !inst) return;
      const minX = Math.min(...ship.cells.map((cc) => cc.x));
      const minY = Math.min(...ship.cells.map((cc) => cc.y));
      startDrag(
        {
          kind: 'ship',
          uid: ship.uid,
          def: inst.def,
          index: inst.index,
          rotation: ship.rotation,
          grabX: sx - minX * s,
          grabY: sy - minY * s,
          homeX: gridX + minX * s,
          homeY: gridY + minY * s,
        },
        gridX + e.x,
        gridY + e.y,
      );
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

  const floatW = drag ? dragSize(drag).width * s : 0;
  const floatH = drag ? dragSize(drag).height * s : 0;

  /** Starts a drag from a dock item; `local` is the press point inside it, `abs` the same point in window coords. */
  const dockStart = (uid: string, item: DragItem, local: Coord, abs: Coord) => {
    const o = rootOrigin.current;
    startDrag(
      {
        ...item,
        uid,
        grabX: local.x / DOCK_SCALE,
        grabY: local.y / DOCK_SCALE,
        homeX: abs.x - local.x - o.x,
        homeY: abs.y - local.y - o.y,
      },
      abs.x - o.x,
      abs.y - o.y,
    );
  };
  const dockMove = (ax: number, ay: number) => moveDrag(ax - rootOrigin.current.x, ay - rootOrigin.current.y);
  const dockEnd = (ax: number, ay: number) => endDrag(ax - rootOrigin.current.x, ay - rootOrigin.current.y);

  const allPlaced = unplaced.length === 0 && dockMines.length === 0;
  const hint = allPlaced
    ? mineCount > 0
      ? 'All set. Tap a ship to rotate, drag ships or mines to move.'
      : 'Fleet deployed. Tap a ship to rotate, drag to move.'
    : mineCount > 0
      ? 'Drag ships and mines onto the grid · tap to auto-place'
      : 'Drag ships onto the grid · tap to auto-place';
  const dockUnit = s * DOCK_SCALE;

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
            <Text key={i} style={[styles.label, { width: s, lineHeight: gutter, fontSize: labelSize }]}>
              {String.fromCharCode(65 + i)}
            </Text>
          ))}
        </View>
        <View style={[styles.labelsCol, { top: gutter, width: gutter }]} pointerEvents="none">
          {Array.from({ length: rules.grid.height }, (_, i) => (
            <Text key={i} numberOfLines={1} style={[styles.label, { height: s, lineHeight: s, width: gutter, fontSize: labelSize }]}>
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
        <Text style={[text.caption, styles.dockHint]}>{hint}</Text>
        <View style={styles.dockItems}>
          {unplaced.map((inst) => {
            const len = inst.def.cells.length;
            const cells = shapeCells(inst.def, 0);
            const { width: w, height: h } = shipIconSize(cells, dockUnit);
            return (
              <DockItem
                key={inst.uid}
                label={`${inst.def.name} · ${len}`}
                accessibilityLabel={`${inst.def.name}, ${len} cells`}
                hidden={drag?.uid === inst.uid}
                disabled={disabled}
                onBegin={measureRoot}
                onTap={() => autoPlace(inst.uid)}
                onStart={(local, abs) =>
                  dockStart(inst.uid, { kind: 'ship', def: inst.def, index: inst.index, rotation: 0 }, local, abs)
                }
                onMove={dockMove}
                onEnd={dockEnd}
              >
                <SkiaIcon
                  cacheKey={`dock:${inst.def.id}:${len}:${Math.round(dockUnit)}`}
                  width={w}
                  height={h}
                  draw={(c) => drawShipShape(c, inst.def.id, cells, 0, dockUnit)}
                />
              </DockItem>
            );
          })}
          {dockMines.map((uid) => (
            <DockItem
              key={uid}
              label="Mine"
              accessibilityLabel="Mine"
              hidden={drag?.uid === uid}
              disabled={disabled}
              onBegin={measureRoot}
              onTap={autoPlaceMine}
              onStart={(local, abs) => dockStart(uid, { kind: 'mine', from: null }, local, abs)}
              onMove={dockMove}
              onEnd={dockEnd}
            >
              <SkiaIcon
                cacheKey={`dock:mine:${Math.round(dockUnit)}`}
                width={dockUnit}
                height={dockUnit}
                draw={(c) => drawObstacleIcon(c, 'mine', dockUnit)}
              />
            </DockItem>
          ))}
        </View>
      </View>

      {drag && (
        <Animated.View pointerEvents="none" style={[styles.floating, { width: floatW, height: floatH }, floatStyle]}>
          {drag.kind === 'ship' ? (
            <SkiaIcon
              cacheKey={`float:${drag.def.id}:${drag.def.cells.length}:${drag.rotation}:${Math.round(s)}`}
              width={floatW}
              height={floatH}
              draw={(c) => drawShipShape(c, drag.def.id, shapeCells(drag.def, drag.rotation), drag.rotation, s)}
            />
          ) : (
            <SkiaIcon cacheKey={`float:mine:${Math.round(s)}`} width={s} height={s} draw={(c) => drawObstacleIcon(c, 'mine', s)} />
          )}
        </Animated.View>
      )}
    </View>
  );
}

function DockItem({
  label,
  accessibilityLabel,
  hidden,
  disabled,
  onBegin,
  onTap,
  onStart,
  onMove,
  onEnd,
  children,
}: {
  label: string;
  accessibilityLabel: string;
  hidden: boolean;
  disabled?: boolean;
  onBegin: () => void;
  onTap: () => void;
  /** `local` is the press point inside the dock item; `abs` is the same point in window coordinates. */
  onStart: (local: Coord, abs: Coord) => void;
  onMove: (absX: number, absY: number) => void;
  onEnd: (absX: number, absY: number) => void;
  children: ReactNode;
}) {
  const start = useRef({ local: { x: 0, y: 0 }, abs: { x: 0, y: 0 } });
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
      <View style={[styles.dockShip, { opacity: hidden ? 0.15 : 1 }]} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
        {children}
        <Text style={styles.dockLabel}>{label}</Text>
      </View>
    </GestureDetector>
  );
}

/** Random fleet around the terrain, then `mineCount` mines in the remaining open water. */
export function randomPlacement(rules: RuleSet, obstacles?: Record<string, ObstacleKind>, mineCount = 0) {
  const rng = createRng(randomSeed());
  const terrain = terrainOnly(obstacles);
  const ships = randomFleet(rules, rng, { obstacles: terrain });
  const mines = randomMines({ ...createBoard(rules.grid.width, rules.grid.height), obstacles: terrain, ships }, mineCount, rng);
  return { ships, mines };
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
