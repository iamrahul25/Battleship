import { Canvas, Circle, Group, Line, LinearGradient, Picture, Rect, SweepGradient, useClock, vec } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { paint, record } from '@/art/draw';
import { drawShipIcon } from '@/art/ships';
import { useImageGraphics } from '@/art/spriteSet';
import { colors } from '@/theme';
import { Water } from '../grid/Water';

/** Full-bleed animated sea with a battleship sailing in (Home / Splash). */
export function SeaBackground({ width, height, animate = true, ship = true }: { width: number; height: number; animate?: boolean; ship?: boolean }) {
  const clock = useClock();
  const sail = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (animate) sail.value = withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) });
  }, [animate, sail]);

  const cell = Math.min(46, width / 9);
  const len = 4;
  const imageGraphics = useImageGraphics();
  const shipPic = useMemo(
    () =>
      record(len * cell, cell, (c) => {
        drawShipIcon(c, 'battleship', len, cell);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cell, imageGraphics],
  );
  const wake = useMemo(
    () =>
      record(width, cell * 2, (c) => {
        const p = paint('#CFE8FF', { stroke: 2, alpha: 0.35, cap: 'round' });
        for (let i = 0; i < 5; i++) c.drawLine(i * 22, cell * 0.4 + i * 4, i * 22 + 14, cell * 0.4 + i * 4, p);
        for (let i = 0; i < 5; i++) c.drawLine(i * 22, cell * 1.6 - i * 4, i * 22 + 14, cell * 1.6 - i * 4, p);
      }),
    [cell, width],
  );
  const shipY = height * 0.5;
  const targetX = width / 2 - (len * cell) / 2;
  const transform = useDerivedValue(() => {
    const t = animate ? clock.value / 1000 : 0;
    return [
      { translateX: -len * cell + (targetX + len * cell) * sail.value },
      { translateY: shipY + Math.sin(t * 1.4) * 3 },
      { rotate: Math.sin(t * 1.1) * 0.015 },
    ];
  });
  const wakeTransform = useDerivedValue(() => [{ translateX: -len * cell + (targetX + len * cell) * sail.value - width + 4 }, { translateY: shipY - cell / 2 }]);

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
      <Canvas style={{ width, height }}>
        <Water width={width} height={height} tone={0.35} animate={animate} />
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            colors={['rgba(10,22,40,0.85)', 'rgba(10,22,40,0.35)', 'rgba(10,22,40,0)', 'rgba(10,22,40,0.45)']}
            positions={[0, 0.4, 0.62, 1]}
          />
        </Rect>
        {ship && (
          <>
            <Group transform={wakeTransform}>
              <Picture picture={wake} />
            </Group>
            <Group transform={transform}>
              <Picture picture={shipPic} />
            </Group>
          </>
        )}
      </Canvas>
    </View>
  );
}

/** Radar sweep for matchmaking. */
export function Radar({ size, blips = true }: { size: number; blips?: boolean }) {
  const clock = useClock();
  const c = size / 2;
  const sweep = useDerivedValue(() => [{ rotate: ((clock.value / 1000) * Math.PI * 2) / 2.4 }]);
  const blipOp = useDerivedValue(() => 0.3 + 0.7 * Math.abs(Math.sin(clock.value / 600)));
  return (
    <Canvas style={{ width: size, height: size }}>
      <Circle cx={c} cy={c} r={c - 2} color="#08281F" />
      {[0.33, 0.66, 0.98].map((f) => (
        <Circle key={f} cx={c} cy={c} r={(c - 2) * f} color={colors.radarGreen} style="stroke" strokeWidth={1.2} opacity={0.4} />
      ))}
      <Line p1={vec(c, 2)} p2={vec(c, size - 2)} color={colors.radarGreen} strokeWidth={1} opacity={0.3} />
      <Line p1={vec(2, c)} p2={vec(size - 2, c)} color={colors.radarGreen} strokeWidth={1} opacity={0.3} />
      <Group origin={vec(c, c)} transform={sweep}>
        <Circle cx={c} cy={c} r={c - 2}>
          <SweepGradient c={vec(c, c)} colors={['rgba(61,220,151,0)', 'rgba(61,220,151,0)', 'rgba(61,220,151,0.55)']} positions={[0, 0.75, 1]} />
        </Circle>
      </Group>
      {blips && (
        <Group opacity={blipOp}>
          <Circle cx={c + c * 0.35} cy={c - c * 0.4} r={4} color={colors.radarGreen} />
          <Circle cx={c - c * 0.5} cy={c + c * 0.25} r={3} color={colors.radarGreen} />
        </Group>
      )}
      <Circle cx={c} cy={c} r={c - 2} color={colors.radarGreen} style="stroke" strokeWidth={2.5} />
    </Canvas>
  );
}

const CONFETTI_COLORS = [colors.brass, colors.signalRed, colors.radarGreen, colors.ocean300, colors.steel100];
const PIECES = Array.from({ length: 42 }, (_, i) => ({
  x: (i * 37) % 100,
  delay: (i * 53) % 900,
  speed: 0.8 + ((i * 17) % 10) / 20,
  drift: ((i * 29) % 20) - 10,
  size: 5 + (i % 4),
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
}));

function ConfettiPiece({ p, width, height, piece }: { p: { value: number }; width: number; height: number; piece: (typeof PIECES)[number] }) {
  const y = useDerivedValue(() => {
    const t = Math.max(0, (p.value - piece.delay) / 1000) * piece.speed;
    return -20 + t * height * 0.45;
  });
  const x = useDerivedValue(() => {
    const t = Math.max(0, (p.value - piece.delay) / 1000);
    return (piece.x / 100) * width + Math.sin(t * 3 + piece.x) * piece.drift * 2;
  });
  const transform = useDerivedValue(() => [{ translateX: x.value }, { translateY: y.value }, { rotate: p.value / 300 + piece.x }]);
  return (
    <Group transform={transform}>
      <Rect x={-piece.size / 2} y={-piece.size / 4} width={piece.size} height={piece.size / 2} color={piece.color} />
    </Group>
  );
}

export function Confetti({ width, height }: { width: number; height: number }) {
  const clock = useClock();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={{ width, height }}>
        {PIECES.map((piece, i) => (
          <ConfettiPiece key={i} p={clock} width={width} height={height} piece={piece} />
        ))}
      </Canvas>
    </View>
  );
}
