import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, View } from 'react-native';
import type { GameMode } from '@shared/engine';
import { PlayerCard } from '@/components/hud/PlayerCard';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Screen } from '@/components/ui/Screen';
import type { OnlineJoin } from '@/game/controllers/OnlineGameController';
import { useOnlineMatch } from '@/hooks/useOnlineMatch';
import { useMatchStore } from '@/stores/match';
import { toast } from '@/stores/ui';
import { colors, fonts, text } from '@/theme';

export default function PrivateRoom() {
  const params = useLocalSearchParams<{ kind?: string; mode?: string; code?: string }>();
  const join = useMemo<OnlineJoin>(
    () =>
      params.kind === 'code'
        ? { kind: 'code', code: params.code ?? '' }
        : { kind: 'create', mode: (params.mode === 'classic' ? 'classic' : 'arsenal') as GameMode },
    [params.kind, params.code, params.mode],
  );
  const { error, connecting } = useOnlineMatch(join);
  const meta = useMatchStore((s) => s.meta);
  const code = meta?.code;

  const copy = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    toast('Code copied', code, 'success');
  };
  const share = async () => {
    if (!code) return;
    try {
      await Share.share({ message: `Join my Battleship room! Code: ${code}` });
    } catch {
      void copy();
    }
  };

  const joining = join.kind === 'code';

  return (
    <Screen title={joining ? 'Joining Room' : 'Private Room'} back={() => router.back()}>
      <View style={styles.center}>
        {error ? (
          <Text style={[text.body, { color: colors.signalRed, textAlign: 'center' }]}>{error.message}</Text>
        ) : connecting || (!code && !joining) ? (
          <ActivityIndicator size="large" color={colors.radarGreen} />
        ) : joining ? (
          <>
            <ActivityIndicator size="large" color={colors.radarGreen} />
            <Text style={styles.waiting}>Boarding room {join.code.toUpperCase()}…</Text>
          </>
        ) : (
          <>
            <Panel accent="brass" style={styles.codePanel}>
              <Text style={text.label}>ROOM CODE</Text>
              <Text style={styles.code} selectable testID="room-code">
                {code}
              </Text>
              <View style={styles.codeActions}>
                <Button title="Copy" variant="secondary" size="sm" onPress={copy} icon={<Ionicons name="copy" size={16} color={colors.steel100} />} style={{ flex: 1 }} />
                <Button title="Share" variant="secondary" size="sm" onPress={share} icon={<Ionicons name="share-social" size={16} color={colors.steel100} />} style={{ flex: 1 }} />
              </View>
            </Panel>
            <View style={styles.players}>
              <PlayerCard info={meta?.me ?? null} />
              <Text style={styles.vs}>VS</Text>
              {meta?.opponent ? (
                <PlayerCard info={meta.opponent} align="right" />
              ) : (
                <View style={styles.emptySeat}>
                  <ActivityIndicator color={colors.steel400} />
                  <Text style={text.caption}>Waiting…</Text>
                </View>
              )}
            </View>
            <Text style={[text.caption, { textAlign: 'center' }]}>Share the code. The battle starts as soon as your friend joins.</Text>
          </>
        )}
      </View>
      <Button title={error ? 'Back' : 'Leave room'} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22 },
  codePanel: { alignItems: 'center', width: '100%', paddingVertical: 24 },
  code: { fontFamily: fonts.heading, fontSize: 48, letterSpacing: 10, color: colors.brass, marginVertical: 10 },
  codeActions: { flexDirection: 'row', gap: 10, width: '100%' },
  players: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  vs: { fontFamily: fonts.heading, fontSize: 20, color: colors.signalRed },
  emptySeat: { alignItems: 'center', gap: 6, width: 120 },
  waiting: { fontFamily: fonts.heading, fontSize: 18, color: colors.radarGreen, letterSpacing: 1 },
});
