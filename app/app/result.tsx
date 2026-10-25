import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playSound, SoundManager } from '@/audio/SoundManager';
import { Confetti } from '@/components/art/Scenes';
import { BattleGrid } from '@/components/grid/BattleGrid';
import { Stamp } from '@/components/hud/Overlays';
import { BadgeIcon, MedalIcon } from '@/components/ui/BadgeIcon';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { accuracy, achievementById } from '@/game/progression';
import { haptic } from '@/platform/haptics';
import { useMatchStore } from '@/stores/match';
import { useSettingsStore } from '@/stores/settings';
import { colors, fonts, text } from '@/theme';

function reasonText(won: boolean, reason: string) {
  if (reason === 'sunk') return won ? 'Enemy fleet destroyed' : 'Your fleet was destroyed';
  if (reason === 'forfeit') return won ? 'Opponent forfeited' : 'You surrendered';
  if (reason === 'disconnect') return won ? 'Opponent left the battle' : 'You were disconnected';
  if (reason === 'timeout') return won ? 'Opponent timed out' : 'Too many missed turns';
  return '';
}

const fmtTime = (ms: number) => {
  const sec = Math.round(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function Result() {
  const { result, controller, view, meta, closedReason } = useMatchStore();
  const reduced = useSettingsStore((s) => s.reducedMotion);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!result) return;
    SoundManager.playMusic(null);
    playSound(result.youWon ? 'victory' : 'defeat');
    haptic(result.youWon ? 'success' : 'warning');
    const t = setTimeout(() => SoundManager.playMusic('menu'), 3500);
    return () => clearTimeout(t);
  }, [result]);

  if (!controller) return <Redirect href="/home" />;
  // An accepted rematch clears `result` as the new placement phase begins; going home would leave the room.
  if (!result) return <Redirect href={view?.phase === 'placement' ? '/placement' : '/home'} />;

  const { summary } = result;
  const online = controller.kind === 'online';
  const boardSize = Math.min((Math.min(width, 560) - 56) / 2, 220);
  const rematchMine = meta?.rematch.me ?? false;
  const rematchTheirs = meta?.rematch.opponent ?? false;
  const opponentGone = online && (!meta?.opponent || !meta.opponent.connected || !!closedReason);

  const home = () => {
    useMatchStore.getState().detach();
    router.replace('/home');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {result.youWon && !reduced && <Confetti width={width} height={height} />}
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.bannerArea}>
          <Stamp
            stampKey={1}
            text={result.youWon ? 'VICTORY' : 'DEFEAT'}
            color={result.youWon ? colors.brass : colors.signalRed}
            hold={1e9}
            size={Math.min(54, width / 7)}
          />
        </View>
        <Text style={styles.reason}>{reasonText(result.youWon, result.reason)}</Text>
        <Text style={styles.vs}>vs {summary.opponentName}</Text>

        <Animated.View entering={FadeInUp.delay(300)} style={{ width: '100%' }}>
          <Panel title="After-action report" accent={result.youWon ? 'brass' : 'red'}>
            <View style={styles.stats}>
              <Stat label="SHOTS" value={String(summary.shots)} />
              <Stat label="HITS" value={String(summary.hits)} />
              <Stat label="ACCURACY" value={`${Math.round(accuracy(summary.shots, summary.hits) * 100)}%`} />
              <Stat label="TIME" value={fmtTime(summary.durationMs)} />
              <Stat label="SHIPS LOST" value={`${summary.shipsLost}/${summary.shipsTotal}`} />
            </View>
            {(result.medal || result.newBadges.length > 0) && (
              <View style={styles.medals}>
                {result.medal && (
                  <Animated.View entering={FadeInDown.delay(600).springify()} style={styles.medalItem}>
                    <MedalIcon tier={result.medal} size={64} />
                    <Text style={styles.medalLabel}>{result.medal.toUpperCase()} MARKSMAN</Text>
                  </Animated.View>
                )}
                {result.newBadges.map((id, i) => (
                  <Animated.View key={id} entering={FadeInDown.delay(800 + i * 150).springify()} style={styles.medalItem}>
                    <BadgeIcon id={id} size={60} />
                    <Text style={styles.medalLabel}>{achievementById(id)?.name.toUpperCase()}</Text>
                  </Animated.View>
                ))}
              </View>
            )}
          </Panel>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(500)} style={styles.boards}>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.boardTitle}>YOUR FLEET</Text>
            <BattleGrid size={boardSize} board={result.view.myBoard} kind="own" showLabels={false} reducedMotion />
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.boardTitle}>ENEMY FLEET</Text>
            <BattleGrid
              size={boardSize}
              board={result.view.enemyBoard}
              kind="target"
              showLabels={false}
              revealed={result.revealFleet}
              reducedMotion
            />
          </View>
        </Animated.View>

        <View style={styles.actions}>
          <Button
            title={online ? (rematchMine ? 'Waiting for opponent…' : rematchTheirs ? 'Accept rematch' : 'Rematch') : 'Rematch'}
            variant="brass"
            size="lg"
            disabled={rematchMine || opponentGone}
            onPress={() => controller.rematch()}
            testID="rematch"
          />
          {online && rematchTheirs && !rematchMine && <Text style={styles.rematchHint}>Your opponent wants a rematch!</Text>}
          {opponentGone && <Text style={styles.rematchHint}>Opponent has left the room.</Text>}
          <Button title="Home" variant="ghost" onPress={home} testID="home" />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy900 },
  scroll: { alignItems: 'center', paddingHorizontal: 16, maxWidth: 560, width: '100%', alignSelf: 'center' },
  bannerArea: { height: 120, width: '100%' },
  reason: { ...text.heading, color: colors.steel100, textAlign: 'center' },
  vs: { ...text.caption, marginBottom: 16 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  stat: { width: '30%', alignItems: 'center' },
  statValue: { fontFamily: fonts.heading, fontSize: 22, color: colors.steel100 },
  statLabel: { ...text.label, fontSize: 10 },
  medals: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginTop: 16 },
  medalItem: { alignItems: 'center', width: 100 },
  medalLabel: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.brass, textAlign: 'center', marginTop: 4, letterSpacing: 1 },
  boards: { flexDirection: 'row', gap: 16, marginTop: 18, justifyContent: 'center' },
  boardTitle: { ...text.label, marginBottom: 6 },
  actions: { width: '100%', gap: 10, marginTop: 22 },
  rematchHint: { ...text.caption, textAlign: 'center', color: colors.radarGreen },
});
