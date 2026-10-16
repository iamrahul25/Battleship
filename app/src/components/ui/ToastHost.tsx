import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOutUp, SlideInUp, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Toast, useUiStore } from '@/stores/ui';
import { colors, fonts, radii } from '@/theme';
import { BadgeIcon } from './BadgeIcon';

const DURATION: Record<Toast['kind'], number> = { info: 2600, success: 2600, error: 3200, badge: 3400 };

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useUiStore((s) => s.dismissToast);
  const shine = useSharedValue(-1);

  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), DURATION[toast.kind]);
    if (toast.kind === 'badge') shine.value = withDelay(250, withTiming(1, { duration: 900 }));
    return () => clearTimeout(t);
  }, [dismiss, shine, toast.id, toast.kind]);

  const shineStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shine.value * 360 }, { rotate: '20deg' }] }));
  const border =
    toast.kind === 'error' ? colors.signalRed : toast.kind === 'badge' ? colors.brass : toast.kind === 'success' ? colors.radarGreen : colors.steel400;

  return (
    <Animated.View entering={SlideInUp.springify().damping(16)} exiting={FadeOutUp.duration(200)}>
      <Pressable onPress={() => dismiss(toast.id)} style={[styles.toast, { borderColor: border }]} accessibilityRole="alert">
        {toast.kind === 'badge' && toast.badgeId ? <BadgeIcon id={toast.badgeId} size={40} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, toast.kind === 'badge' && { color: colors.brass }]}>{toast.title}</Text>
          {toast.message ? <Text style={styles.message}>{toast.message}</Text> : null}
        </View>
        {toast.kind === 'badge' ? <Animated.View pointerEvents="none" style={[styles.shine, shineStyle]} /> : null}
      </Pressable>
    </Animated.View>
  );
}

export function ToastHost() {
  const toasts = useUiStore((s) => s.toasts);
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8 }]}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 12, right: 12, alignItems: 'center', gap: 8, zIndex: 1000 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 480,
    minWidth: 280,
    backgroundColor: 'rgba(10,22,40,0.96)',
    borderWidth: 1.5,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  title: { fontFamily: fonts.heading, fontSize: 15, color: colors.steel100, letterSpacing: 1 },
  message: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.steel200 },
  shine: { position: 'absolute', top: -20, bottom: -20, left: -120, width: 50, backgroundColor: 'rgba(255,255,255,0.18)' },
});
