import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SeaBackground } from '@/components/art/Scenes';
import { Logo } from '@/components/art/Logo';
import { useProfileStore } from '@/stores/profile';
import { useSettingsStore } from '@/stores/settings';
import { colors, text } from '@/theme';

export default function Splash() {
  const { width, height } = useWindowDimensions();
  const onboarded = useProfileStore((s) => s.onboarded);
  const reduced = useSettingsStore((s) => s.reducedMotion);

  useEffect(() => {
    const t = setTimeout(() => router.replace(onboarded ? '/home' : '/onboarding'), reduced ? 300 : 1300);
    return () => clearTimeout(t);
  }, [onboarded, reduced]);

  return (
    <View style={styles.root}>
      <SeaBackground width={width} height={height} animate={!reduced} ship={false} />
      <View style={styles.center}>
        <Logo size={Math.min(52, width / 8)} animate={!reduced} />
        <Text style={[text.caption, styles.loading]}>Loading fleet…</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy900 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { marginTop: 28 },
});
