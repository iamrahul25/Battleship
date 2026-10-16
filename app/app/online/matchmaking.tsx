import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { GameMode } from '@shared/engine';
import { Radar } from '@/components/art/Scenes';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useOnlineMatch } from '@/hooks/useOnlineMatch';
import { colors, fonts, text } from '@/theme';

export default function Matchmaking() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: GameMode = params.mode === 'classic' ? 'classic' : 'arsenal';
  const join = useMemo(() => ({ kind: 'quick' as const, mode }), [mode]);
  const { error, connecting } = useOnlineMatch(join);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const cancel = () => router.back();

  return (
    <Screen title="Matchmaking" back={cancel}>
      <View style={styles.center}>
        <Radar size={240} />
        <Text style={styles.title}>{error ? 'CONNECTION FAILED' : connecting ? 'CONNECTING…' : 'SEARCHING FOR OPPONENT'}</Text>
        <Text style={text.caption}>
          {mode === 'arsenal' ? 'Arsenal' : 'Classic'} · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
        </Text>
        {error && <Text style={[text.body, styles.error]}>{error.message}</Text>}
      </View>
      <View style={{ gap: 10 }}>
        {elapsed >= 30 && !error && (
          <Button title="Play vs Bot instead" variant="brass" onPress={() => router.replace('/bot-setup')} />
        )}
        <Button title={error ? 'Back' : 'Cancel'} variant="ghost" onPress={cancel} testID="cancel-matchmaking" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  title: { fontFamily: fonts.heading, fontSize: 20, color: colors.radarGreen, letterSpacing: 2, marginTop: 12, textAlign: 'center' },
  error: { color: colors.signalRed, textAlign: 'center' },
});
