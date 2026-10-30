import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { type Coord, isFleetComplete, isMultiplayerView, mineCells, ONLINE_PLACEMENT_TIME_MS, type PlacedShip, viewAllies } from '@shared/engine';
import { playSound } from '@/audio/SoundManager';
import { PlayerCard } from '@/components/hud/PlayerCard';
import { TurnTimer } from '@/components/hud/TurnTimer';
import { PlacementEditor, randomPlacement } from '@/components/placement/PlacementEditor';
import { teamColor, teamName } from '@/components/setup/RoomSizeSettings';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Screen } from '@/components/ui/Screen';
import type { SeatInfo } from '@/game/controllers/types';
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
  const [mines, setMines] = useState<Coord[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const rules = controller?.rules;
  const obstacles = view?.myBoard.obstacles;
  const mineCount = mineCells(obstacles).length;
  const contentW = Math.min(width - 32, 520);
  const crewRows = view && isMultiplayerView(view) ? 50 : 0;
  const gridSize = Math.max(240, Math.min(contentW, height - 340 - crewRows));

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

  const complete =
    ships.length > 0 &&
    isFleetComplete({ width: rules.grid.width, height: rules.grid.height, ships, shots: {} }, rules) &&
    mines.length === mineCount;
  const online = controller.kind === 'online';
  const empty = ships.length === 0 && mines.length === 0;

  const ready = () => {
    if (!complete) return;
    playSound('ready');
    haptic('success');
    setSubmitted(true);
    controller.placeFleet(ships, mineCount > 0 ? mines : undefined);
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
      {online && view && meta && isMultiplayerView(view) ? (
        <View style={styles.crew}>
          {view.teamGame && (
            <Text style={[styles.teamLine, { color: teamColor(view.players[view.viewer].team) }]}>
              TEAM {teamName(view.players[view.viewer].team)}
              {viewAllies(view).length ? ` · WITH ${viewAllies(view).map((a) => seatLabel(meta.seats, a.player)).join(', ').toUpperCase()}` : ''}
            </Text>
          )}
          <View style={styles.crewRow}>
            {view.players
              .filter((p) => p.player !== view.viewer)
              .map((p) => {
                const seat = meta.seats.find((s) => s.seat === p.player);
                const status = p.out ? 'LEFT' : p.info.ready ? 'READY' : 'DEPLOYING';
                return (
                  <View key={p.player} style={[styles.crewChip, view.teamGame && { borderColor: teamColor(p.team) }]}>
                    <Avatar id={seat?.avatarId ?? 'captain'} size={22} />
                    <Text style={styles.crewName} numberOfLines={1}>
                      {seat?.name ?? `Player ${p.player + 1}`}
                    </Text>
                    <Text style={[styles.crewStatus, { color: p.out ? colors.signalRed : p.info.ready ? colors.radarGreen : colors.steel400 }]}>{status}</Text>
                  </View>
                );
              })}
          </View>
        </View>
      ) : online ? (
        <View style={styles.opponentRow}>
          <PlayerCard info={meta?.opponent ?? null} compact />
          <Text style={[styles.opStatus, { color: view?.enemy.ready ? colors.radarGreen : colors.steel400 }]}>
            {view?.enemy.ready ? 'READY' : 'DEPLOYING…'}
          </Text>
        </View>
      ) : null}

      <View style={{ flex: 1, justifyContent: 'center' }}>
        <PlacementEditor
          rules={rules}
          obstacles={obstacles}
          size={gridSize}
          ships={ships}
          onChange={setShips}
          mines={mines}
          mineCount={mineCount}
          onMinesChange={setMines}
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
            const layout = randomPlacement(rules, obstacles, mineCount);
            setShips(layout.ships);
            setMines(layout.mines);
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
          disabled={submitted || empty}
          onPress={() => {
            playSound('click');
            setShips([]);
            setMines([]);
          }}
          style={[styles.iconBtn, (submitted || empty) && { opacity: 0.4 }]}
        >
          <Ionicons name="trash-outline" size={22} color={colors.steel100} />
          <Text style={styles.iconLabel}>Clear</Text>
        </Pressable>
        <Button title={submitted ? 'Ready!' : 'Ready'} onPress={ready} disabled={!complete || submitted} style={{ flex: 1 }} testID="ready" />
      </View>

      {submitted && online && view?.phase === 'placement' && (
        <Animated.View entering={FadeIn} style={styles.waiting} pointerEvents="none">
          <ActivityIndicator color={colors.radarGreen} />
          <Text style={[text.bodyBold, { color: colors.radarGreen }]}>
            {view && isMultiplayerView(view) ? 'Waiting for the other captains…' : 'Waiting for opponent…'}
          </Text>
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

function seatLabel(seats: SeatInfo[], seat: number) {
  return seats.find((s) => s.seat === seat)?.name ?? `Player ${seat + 1}`;
}

const styles = StyleSheet.create({
  opponentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  crew: { gap: 6, marginBottom: 8 },
  teamLine: { fontFamily: fonts.heading, fontSize: 13, letterSpacing: 1 },
  crewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  crewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.steel600,
    backgroundColor: colors.navy800,
    maxWidth: '48%',
  },
  crewName: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.steel100, flexShrink: 1 },
  crewStatus: { fontFamily: fonts.heading, fontSize: 10, letterSpacing: 1 },
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
