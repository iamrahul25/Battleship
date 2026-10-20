import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { isFleetComplete, ONLINE_PLACEMENT_TIME_MS, type PlacedShip } from '@shared/engine';
import { playSound } from '@/audio/SoundManager';
import { PlayerCard } from '@/components/hud/PlayerCard';
import { TurnTimer } from '@/components/hud/TurnTimer';
import { PlacementEditor, randomPlacement } from '@/components/placement/PlacementEditor';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Screen } from '@/components/ui/Screen';
import { useBackGuard } from '@/hooks/useLeaveGuard';
import { haptic } from '@/platform/haptics';
import { useMatchStore } from '@/stores/match';
import { useSettingsStore } from '@/stores/settings';
import { toast } from '@/stores/ui';
import { colors, fonts, text } from '@/theme';

export default function Placement() {
  const controller = useMatchStore((s) => s.controller);
  const view = useMatchStore((s) => s.view);
  const meta = useMatchStore((s) => s.meta);
  const closedReason = useMatchStore((s) => s.closedReason);
  const reduced = useSettingsStore((s) => s.reducedMotion);
  const { width, height } = useWindowDimensions();
  const [ships, setShips] = useState<PlacedShip[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const rules = controller?.rules;
  const obstacles = view?.myBoard.obstacles;
  const contentW = Math.min(width - 32, 520);
  const gridSize = Math.max(240, Math.min(contentW, height - 340));

  useEffect(() => {
    if (view?.phase === 'battle') router.replace('/battle');
  }, [view?.phase]);

  useEffect(() => {
    if (closedReason) {
      toast('Connection lost', 'The battle was closed.', 'error');
      useMatchStore.getState().detach();
      router.replace('/home');
    }
  }, [closedReason]);

  // A rematch (or reconnect) resets readiness from the authoritative view.
  const serverReady = view?.phase === 'placement' && view.me.ready;
  const [prevServerReady, setPrevServerReady] = useState(serverReady);
  if (serverReady !== prevServerReady) {
    setPrevServerReady(serverReady);
    if (!serverReady) setSubmitted(false);
  }

  const leave = useCallback(() => setConfirmLeave(true), []);
  useBackGuard(leave);

  if (!controller || !rules) return <Redirect href="/home" />;

  const complete = ships.length > 0 && isFleetComplete({ width: rules.grid.width, height: rules.grid.height, ships, shots: {} }, rules);
  const online = controller.kind === 'online';

  const ready = () => {
    if (!complete) return;
    playSound('ready');
    haptic('success');
    setSubmitted(true);
    controller.placeFleet(ships);
    controller.ready();
  };

  return (
    <Screen
      title="Deploy Fleet"
      back={leave}
      right={
        online && meta?.deadline ? (
          <TurnTimer deadline={meta.deadline} totalMs={rules.placementTimeMs ?? ONLINE_PLACEMENT_TIME_MS} size={40} tick={!submitted} />
        ) : null
      }
    >
      {online && (
        <View style={styles.opponentRow}>
          <PlayerCard info={meta?.opponent ?? null} compact />
          <Text style={[styles.opStatus, { color: view?.enemy.ready ? colors.radarGreen : colors.steel400 }]}>
            {view?.enemy.ready ? 'READY' : 'DEPLOYING…'}
          </Text>
        </View>
      )}

      <View style={{ flex: 1, justifyContent: 'center' }}>
        <PlacementEditor
          rules={rules}
          obstacles={obstacles}
          size={gridSize}
          ships={ships}
          onChange={setShips}
          disabled={submitted}
          reducedMotion={reduced}
        />
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Randomize fleet"
          disabled={submitted}
          onPress={() => {
            playSound('rotate');
            haptic('light');
            setShips(randomPlacement(rules, obstacles));
          }}
          style={[styles.iconBtn, submitted && { opacity: 0.4 }]}
          testID="randomize"
        >
          <Ionicons name="shuffle" size={22} color={colors.steel100} />
          <Text style={styles.iconLabel}>Random</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear fleet"
          disabled={submitted || ships.length === 0}
          onPress={() => {
            playSound('click');
            setShips([]);
          }}
          style={[styles.iconBtn, (submitted || ships.length === 0) && { opacity: 0.4 }]}
        >
          <Ionicons name="trash-outline" size={22} color={colors.steel100} />
          <Text style={styles.iconLabel}>Clear</Text>
        </Pressable>
        <Button title={submitted ? 'Ready!' : 'Ready'} onPress={ready} disabled={!complete || submitted} style={{ flex: 1 }} testID="ready" />
      </View>

      {submitted && online && view?.phase === 'placement' && (
        <Animated.View entering={FadeIn} style={styles.waiting} pointerEvents="none">
          <ActivityIndicator color={colors.radarGreen} />
          <Text style={[text.bodyBold, { color: colors.radarGreen }]}>Waiting for opponent…</Text>
        </Animated.View>
      )}

      <ConfirmDialog
        visible={confirmLeave}
        title="Abandon deployment?"
        message={online ? 'Leaving an online match counts as a forfeit.' : 'Your fleet setup will be lost.'}
        confirmLabel="Leave"
        destructive
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          if (online) controller.forfeit();
          useMatchStore.getState().detach();
          router.replace('/home');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  opponentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  opStatus: { fontFamily: fonts.heading, fontSize: 13, letterSpacing: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  iconBtn: {
    width: 64,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.steel600,
    backgroundColor: colors.navy800,
  },
  iconLabel: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.steel200 },
  waiting: {
    position: 'absolute',
    alignSelf: 'center',
    top: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(6,14,26,0.92)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.radarGreen,
  },
});
