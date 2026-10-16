import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { playSound } from '@/audio/SoundManager';
import { useNow } from '@/hooks/useNow';
import { colors, fonts } from '@/theme';

interface Props {
  deadline: number | null;
  totalMs: number;
  paused?: boolean;
  size?: number;
  /** Tick sound in the last 5 s (only for the local player's own turn). */
  tick?: boolean;
}

export function TurnTimer({ deadline, totalMs, paused, size = 44, tick }: Props) {
  const now = useNow(!!deadline && !paused, 200);
  const lastTick = useRef<number | null>(null);

  const remaining = deadline ? Math.max(0, deadline - now) : totalMs;
  const secs = Math.ceil(remaining / 1000);
  const warn = !!deadline && !paused && secs <= 5;

  useEffect(() => {
    if (!tick || !warn || secs <= 0 || lastTick.current === secs) return;
    lastTick.current = secs;
    playSound('tick');
  }, [secs, tick, warn]);

  const frac = deadline ? Math.min(1, remaining / totalMs) : 1;
  const stroke = 4;
  const r = size / 2 - stroke;
  const arc = Skia.PathBuilder.Make()
    .addArc(Skia.XYWHRect(stroke, stroke, r * 2, r * 2), -90, 360 * frac)
    .detach();
  const col = paused ? colors.steel400 : warn ? colors.signalRed : colors.radarGreen;
  const pulse = warn && secs % 2 === 0 ? 1.08 : 1;

  return (
    <View style={{ width: size, height: size, transform: [{ scale: pulse }] }} accessibilityLabel={`${secs} seconds left`}>
      <Canvas style={{ width: size, height: size }}>
        <Path path={Skia.Path.Circle(size / 2, size / 2, r)} color={colors.navy800} style="stroke" strokeWidth={stroke} />
        <Path path={arc} color={col} style="stroke" strokeWidth={stroke} strokeCap="round" />
      </Canvas>
      <View style={StyleSheet.absoluteFill}>
        <Text style={[styles.text, { color: col, lineHeight: size, fontSize: size * 0.36 }]}>{paused ? '||' : secs}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  text: { fontFamily: fonts.heading, textAlign: 'center' },
});
