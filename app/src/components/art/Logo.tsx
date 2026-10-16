import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { colors, fonts } from '@/theme';

export function Logo({ size = 44, animate = true, tagline = true }: { size?: number; animate?: boolean; tagline?: boolean }) {
  const drop = useSharedValue(animate ? 0 : 1);
  const fade = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) return;
    drop.value = withSpring(1, { damping: 11, stiffness: 120 });
    fade.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) });
  }, [animate, drop, fade]);
  const style = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ translateY: (1 - drop.value) * -60 }] }));
  return (
    <Animated.View style={[styles.wrap, style]} accessibilityRole="header" accessibilityLabel="Battleship">
      <Text style={[styles.shadow, { fontSize: size }]}>BATTLESHIP</Text>
      <Text style={[styles.title, { fontSize: size, position: 'absolute', top: 0 }]}>BATTLESHIP</Text>
      {tagline ? (
        <View style={styles.taglineRow}>
          <View style={styles.rule} />
          <Text style={styles.tagline}>COMMAND THE SEAS</Text>
          <View style={styles.rule} />
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  title: { fontFamily: fonts.heading, color: colors.steel100, letterSpacing: 4 },
  shadow: { fontFamily: fonts.heading, color: colors.signalRed, letterSpacing: 4, transform: [{ translateX: 3 }, { translateY: 3 }] },
  taglineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  rule: { width: 36, height: 2, backgroundColor: colors.brass },
  tagline: { fontFamily: fonts.bodyBold, color: colors.brass, letterSpacing: 4, fontSize: 13 },
});
