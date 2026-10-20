import { useState } from 'react';
import { type GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { playSound } from '@/audio/SoundManager';
import { haptic } from '@/platform/haptics';
import { colors, fonts, radii, text } from '@/theme';

export function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: withSpring(value ? 22 : 0, { damping: 18, stiffness: 260 }) }] }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => {
        playSound('click');
        haptic('selection');
        onChange(!value);
      }}
      style={styles.row}
    >
      <View style={{ flex: 1 }}>
        <Text style={text.bodyBold}>{label}</Text>
        {hint ? <Text style={text.caption}>{hint}</Text> : null}
      </View>
      <View style={[styles.track, { backgroundColor: value ? '#1F7A55' : colors.navy800, borderColor: value ? colors.radarGreen : colors.steel600 }]}>
        <Animated.View style={[styles.knob, knob]} />
      </View>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              playSound('click');
              haptic('selection');
              onChange(o.value);
            }}
            style={[styles.segmentItem, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && { color: colors.navy900 }]}>{o.label}</Text>
            {o.hint ? <Text style={[styles.segmentHint, active && { color: colors.navy800 }]}>{o.hint}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.05,
  format = (v) => `${Math.round(v * 100)}%`,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
}) {
  const [width, setWidth] = useState(1);
  const fraction = (value - min) / (max - min);
  const update = (e: GestureResponderEvent) => {
    const f = Math.max(0, Math.min(1, e.nativeEvent.locationX / width));
    const rounded = Number((min + Math.round((f * (max - min)) / step) * step).toFixed(6));
    if (rounded === value) return;
    haptic('selection');
    onChange(rounded);
  };
  return (
    <View style={styles.sliderWrap}>
      <View style={styles.sliderHeader}>
        <Text style={text.bodyBold}>{label}</Text>
        <Text style={text.caption}>{format(value)}</Text>
      </View>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: value, text: format(value) }}
        onLayout={(e) => setWidth(Math.max(1, e.nativeEvent.layout.width))}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={update}
        onResponderMove={update}
        onResponderRelease={() => playSound('click')}
        style={styles.sliderHit}
      >
        <View style={styles.sliderTrack} pointerEvents="none">
          <View style={[styles.sliderFill, { width: `${fraction * 100}%` }]} />
        </View>
        <View pointerEvents="none" style={[styles.sliderKnob, { left: fraction * width - 11 }]} />
      </View>
    </View>
  );
}

export function Chip({ label, tone = 'steel' }: { label: string; tone?: 'steel' | 'green' | 'red' | 'brass' }) {
  const col = tone === 'green' ? colors.radarGreen : tone === 'red' ? colors.signalRed : tone === 'brass' ? colors.brass : colors.steel400;
  return (
    <View style={[styles.chip, { borderColor: col }]}>
      <Text style={[styles.chipText, { color: col }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  track: { width: 52, height: 30, borderRadius: 15, borderWidth: 1.5, padding: 3 },
  knob: { width: 21, height: 21, borderRadius: 11, backgroundColor: colors.steel100 },
  segment: { flexDirection: 'row', backgroundColor: colors.navy800, borderRadius: radii.md, padding: 4, gap: 4 },
  segmentItem: { flex: 1, paddingVertical: 10, paddingHorizontal: 6, borderRadius: radii.sm, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.brass },
  segmentText: { fontFamily: fonts.heading, fontSize: 14, color: colors.steel100, letterSpacing: 1 },
  segmentHint: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.steel400, marginTop: 2, textAlign: 'center' },
  sliderWrap: { paddingVertical: 8 },
  sliderHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  sliderHit: { height: 32, justifyContent: 'center' },
  sliderTrack: { height: 8, borderRadius: 4, backgroundColor: colors.navy800, overflow: 'hidden', borderWidth: 1, borderColor: colors.steel600 },
  sliderFill: { height: '100%', backgroundColor: colors.ocean300 },
  sliderKnob: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.steel100,
    borderWidth: 3,
    borderColor: colors.ocean500,
  },
  chip: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1 },
});
