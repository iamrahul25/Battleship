import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { playSound } from '@/audio/SoundManager';
import { haptic } from '@/platform/haptics';
import { colors, fonts, radii } from '@/theme';

type Variant = 'primary' | 'secondary' | 'brass' | 'ghost' | 'danger';

interface Props {
  title: string;
  subtitle?: string;
  onPress: () => void;
  variant?: Variant;
  icon?: ReactNode;
  disabled?: boolean;
  size?: 'lg' | 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
  testID?: string;
  silent?: boolean;
}

const PALETTE: Record<Variant, { face: string; edge: string; text: string; border: string }> = {
  primary: { face: '#C62F2B', edge: '#7A1715', text: '#FFF4F2', border: '#F06A66' },
  secondary: { face: '#2A4466', edge: '#0F1F38', text: colors.steel100, border: '#5A7699' },
  brass: { face: '#C79B2E', edge: '#6E5216', text: '#1A1406', border: '#F0CF6A' },
  ghost: { face: 'rgba(19,41,75,0.55)', edge: 'rgba(6,14,26,0.6)', text: colors.steel100, border: colors.steel600 },
  danger: { face: '#4A1A1C', edge: '#250B0C', text: '#FFB4B0', border: colors.signalRed },
};

export function Button({ title, subtitle, onPress, variant = 'primary', icon, disabled, size = 'md', style, testID, silent }: Props) {
  const pressed = useSharedValue(0);
  const p = PALETTE[variant];
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.04 }, { translateY: pressed.value * 2 }],
  }));
  const height = size === 'lg' ? 64 : size === 'md' ? 52 : 40;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: 80 });
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, { duration: 120 });
      }}
      onPress={() => {
        if (!silent) playSound('click');
        haptic('light');
        onPress();
      }}
      style={style}
    >
      <Animated.View style={[styles.wrap, { opacity: disabled ? 0.45 : 1 }, anim]}>
        <View style={[styles.edge, { backgroundColor: p.edge, borderRadius: radii.md }]} />
        <View style={[styles.face, { minHeight: height, backgroundColor: p.face, borderColor: p.border }]}>
          <View style={[styles.sheen]} pointerEvents="none" />
          <View style={styles.row}>
            {icon}
            <View style={{ alignItems: icon ? 'flex-start' : 'center' }}>
              <Text style={[styles.title, { color: p.text, fontSize: size === 'lg' ? 20 : size === 'md' ? 17 : 14 }]}>{title}</Text>
              {subtitle ? <Text style={[styles.subtitle, { color: p.text }]}>{subtitle}</Text> : null}
            </View>
          </View>
          <View style={[styles.rivet, { left: 6, top: 6 }]} />
          <View style={[styles.rivet, { right: 6, top: 6 }]} />
          <View style={[styles.rivet, { left: 6, bottom: 6 }]} />
          <View style={[styles.rivet, { right: 6, bottom: 6 }]} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 4 },
  edge: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 4 },
  face: {
    borderRadius: radii.md,
    borderWidth: 1.5,
    paddingHorizontal: 20,
    paddingVertical: 8,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '45%',
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { fontFamily: fonts.heading, letterSpacing: 1.2, textAlign: 'center' },
  subtitle: { fontFamily: fonts.bodySemi, fontSize: 13, opacity: 0.85, marginTop: -2 },
  rivet: { position: 'absolute', width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.35)' },
});
