import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type Coord,
  getWeapon,
  legalTargets,
  obstacleAt,
  ONLINE_TURN_TIME_MS,
  type Orientation,
  patternCells,
  type ShotEvent,
  torpedoLane,
  torpedoLaunch,
} from '@shared/engine';
import { EMOTES } from '@shared/protocol';
import { playSound } from '@/audio/SoundManager';
import { BattleGrid } from '@/components/grid/BattleGrid';
import { FleetTracker } from '@/components/hud/FleetTracker';
import { CoinFlip, EmoteBubble, emoteLabel, SideNotice, TurnBanner } from '@/components/hud/Overlays';
import { PlayerCard } from '@/components/hud/PlayerCard';
import { PowerUpBar } from '@/components/hud/PowerUpBar';
import { TurnTimer } from '@/components/hud/TurnTimer';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LocalGameController } from '@/game/controllers/LocalGameController';
import { saveGame } from '@/game/savedGame';
import { useBackGuard } from '@/hooks/useLeaveGuard';
import { useNow } from '@/hooks/useNow';
import { useMatchStore } from '@/stores/match';
import { useSettingsStore } from '@/stores/settings';
import { toast } from '@/stores/ui';
import { colors, fonts } from '@/theme';

const sonarFrom = (log: ShotEvent[], by: number) => log.filter((e) => e.by === by && e.sonar).map((e) => e.sonar!);

export default function Battle() {
  const s = useMatchStore();
  const { controller, view, meta, fx } = s;
  const reduced = useSettingsStore((st) => st.reducedMotion);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState(false);
  const [emotes, setEmotes] = useState(false);
  const now = useNow(!!meta?.opponentReconnectDeadline, 1000);

  const online = controller?.kind === 'online';
  const contentW = Math.min(width - 24, 520);
  const L = Math.round(Math.max(220, Math.min(contentW, height - insets.top - insets.bottom - 330)));
  const m = Math.round(Math.min(L * 0.4, 170));
  const scaleMini = m / L;
  const stageH = L + 10 + m;
  const slotX = (contentW - L) / 2;

  const myTurn = !!view && view.phase === 'battle' && view.activePlayer === view.viewer;
  const enemyLarge = !view || view.phase !== 'battle' || myTurn || (fx?.mine ?? false);

  const swap = useSharedValue(enemyLarge ? 0 : 1);
  useEffect(() => {
    swap.value = withTiming(enemyLarge ? 0 : 1, { duration: reduced ? 0 : 600 });
  }, [enemyLarge, reduced, swap]);

  const enemyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: slotX },
      { translateY: swap.value * (L + 10) },
      { scale: 1 - swap.value * (1 - scaleMini) },
    ],
  }));
  const ownStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: slotX },
      { translateY: (1 - swap.value) * (L + 10) },
      { scale: scaleMini + swap.value * (1 - scaleMini) },
    ],
  }));

  // Screen shake.
  const shakeX = useSharedValue(0);
  const shakeY = useSharedValue(0);
  useEffect(() => {
    if (!s.shake.key || reduced) return;
    const i = s.shake.intensity;
    shakeX.value = withSequence(withTiming(i, { duration: 40 }), withTiming(-i, { duration: 50 }), withTiming(i * 0.5, { duration: 50 }), withTiming(0, { duration: 60 }));
    shakeY.value = withSequence(withTiming(-i * 0.6, { duration: 45 }), withTiming(i * 0.6, { duration: 55 }), withTiming(0, { duration: 70 }));
  }, [s.shake, reduced, shakeX, shakeY]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }, { translateY: shakeY.value }] }));

  useEffect(() => {
    if (s.showResult) router.replace('/result');
  }, [s.showResult]);

  useEffect(() => {
    if (s.closedReason && !s.result) {
      toast('Connection lost', 'Could not rejoin the battle.', 'error');
      useMatchStore.getState().detach();
      router.replace('/home');
    }
  }, [s.closedReason, s.result]);

  // Offline games pause and save when the app goes to the background.
  useEffect(() => {
    if (!(controller instanceof LocalGameController)) return;
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        if (!menu) controller.resume();
      } else {
        controller.pause();
        const saved = controller.serialize();
        if (saved) void saveGame(saved);
      }
    });
    return () => sub.remove();
  }, [controller, menu]);

  const openMenu = useCallback(() => {
    playSound('click');
    controller?.pause();
    setMenu(true);
  }, [controller]);
  useBackGuard(openMenu);

  const weapon = getWeapon(s.selectedWeapon);
  const [orientation, setOrientation] = useState<Orientation>('H');
  const enemyBoard = view?.enemyBoard;
  const aimPattern = useMemo(() => {
    if (!weapon || weapon.id === 'standard' || !enemyBoard) return undefined;
    if (weapon.kind === 'random') {
      const open = legalTargets(enemyBoard).filter((c) => obstacleAt(enemyBoard, c) !== 'reef');
      return () => open;
    }
    if (weapon.kind === 'torpedo') return (c: Coord) => torpedoLane(enemyBoard, torpedoLaunch(c, enemyBoard, orientation), orientation);
    return (c: Coord) => patternCells(weapon, c, enemyBoard, orientation);
  }, [weapon, enemyBoard, orientation]);
  const onFire = useCallback(
    (c: Coord) => {
      const fire = useMatchStore.getState().fire;
      if (weapon?.kind === 'torpedo' && enemyBoard) fire(torpedoLaunch(c, enemyBoard, orientation), orientation);
      else fire(c, orientation);
    },
    [weapon, enemyBoard, orientation],
  );
  const enemySonar = useMemo(() => (view ? sonarFrom(view.log, view.viewer) : []), [view]);
  const ownSonar = useMemo(() => (view ? sonarFrom(view.log, view.viewer === 0 ? 1 : 0) : []), [view]);

  if (!controller) return <Redirect href="/home" />;
  if (!view || !meta) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={styles.status}>Syncing battle…</Text>
      </View>
    );
  }

  const canFire = myTurn && !fx && !s.awaiting && s.queue.length === 0 && !menu && !s.coinFlip;
  const turnTotal = view.rules.turnTimeMs ?? ONLINE_TURN_TIME_MS;
  const showTimer = online || view.rules.turnTimeMs !== null;

  const lane = orientation === 'H' ? 'row' : 'column';
  const aimHint: Record<string, string> = {
    barrage: 'Barrage: tap the enemy board to fire',
    torpedo: `Torpedo: tap a ${lane} to launch`,
    airstrike: `Airstrike: pick a ${lane} of 4`,
  };
  let status = myTurn
    ? weapon && weapon.id !== 'standard'
      ? (aimHint[weapon.id] ?? `${weapon.name}: pick a target`)
      : 'Your turn: select a target'
    : 'Enemy is taking aim…';
  if (meta.connection === 'reconnecting') status = 'Connection lost. Reconnecting…';
  else if (meta.opponent && !meta.opponent.connected) {
    const left = meta.opponentReconnectDeadline ? Math.max(0, Math.ceil((meta.opponentReconnectDeadline - now) / 1000)) : 0;
    status = `Opponent disconnected. Waiting ${left}s…`;
  } else if (fx && !fx.mine && fx.event.auto) status = 'Time out! A shot was fired automatically.';

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 8 }]}>
      <View style={[styles.column, { width: contentW }]}>
        <View style={styles.topRow}>
          <PlayerCard info={meta.opponent} shipsRemaining={view.enemy.shipsRemaining} active={!myTurn} />
          {showTimer ? (
            <TurnTimer deadline={meta.deadline} totalMs={turnTotal} paused={meta.paused || menu} tick={myTurn} />
          ) : null}
        </View>
        <View style={styles.trackerRow}>
          <FleetTracker rules={view.rules} lost={view.enemy.shipsLost} label="ENEMY" />
        </View>

        <Animated.View style={[{ width: contentW, height: stageH }, shakeStyle]}>
          <Animated.View style={[styles.board, { width: L, height: L, zIndex: enemyLarge ? 2 : 1 }, enemyStyle]}>
            <BattleGrid
              size={L}
              board={view.enemyBoard}
              kind="target"
              interactive={canFire && enemyLarge}
              onFire={onFire}
              aimPattern={aimPattern}
              aimTone={weapon?.kind === 'reveal' ? 'scan' : 'attack'}
              sonar={enemySonar}
              fx={fx?.mine ? fx : null}
              reducedMotion={reduced}
            />
          </Animated.View>
          <Animated.View style={[styles.board, { width: L, height: L, zIndex: enemyLarge ? 1 : 2 }, ownStyle]}>
            <BattleGrid size={L} board={view.myBoard} kind="own" sonar={ownSonar} fx={fx && !fx.mine ? fx : null} reducedMotion={reduced} />
          </Animated.View>
          <View style={[styles.sidePanel, { left: slotX + m + 10, top: L + 10, width: contentW - slotX * 2 - m - 10, height: m }]}>
            <Text style={styles.boardLabel}>{enemyLarge ? 'MY WATERS ↙' : 'ENEMY WATERS ↙'}</Text>
            {view.rules.powerUpsEnabled ? (
              <PowerUpBar rules={view.rules} me={view.me} selected={s.selectedWeapon} enabled={canFire} onSelect={s.selectWeapon} />
            ) : (
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <Text style={styles.statLine}>Shots {view.me.shotsFired}</Text>
                <Text style={styles.statLine}>Hits {view.me.hits}</Text>
              </View>
            )}
          </View>
          <View pointerEvents="none" style={styles.notices}>
            {s.banner && <TurnBanner key={s.banner.key} mine={s.banner.mine} />}
            {s.stamp && <SideNotice key={s.stamp.key} text={s.stamp.text} color={colors.signalRed} />}
          </View>
          {s.emote && <EmoteBubble key={s.emote.key} emoteKey={s.emote.key} id={s.emote.id} fromMe={s.emote.fromMe} />}
        </Animated.View>

        <View style={styles.statusRow}>
          <Text style={[styles.status, { color: myTurn ? colors.radarGreen : colors.steel400 }]} accessibilityLiveRegion="polite">
            {status}
          </Text>
          {myTurn && weapon?.rotatable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Aim along a ${lane}. Tap to switch.`}
              onPress={() => {
                playSound('click');
                setOrientation((o) => (o === 'H' ? 'V' : 'H'));
              }}
              style={styles.rotateChip}
              testID="rotate-aim"
            >
              <MaterialCommunityIcons name={orientation === 'H' ? 'arrow-left-right' : 'arrow-up-down'} size={16} color={colors.navy900} />
              <Text style={styles.rotateText}>{orientation === 'H' ? 'ROW' : 'COLUMN'}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.bottomRow}>
          <PlayerCard info={meta.me} shipsRemaining={view.me.shipsRemaining} active={myTurn} compact />
          <View style={styles.bottomActions}>
            {online && (
              <Pressable accessibilityLabel="Emotes" onPress={() => setEmotes((v) => !v)} style={styles.roundBtn}>
                <Ionicons name="chatbubble-ellipses" size={20} color={colors.steel100} />
              </Pressable>
            )}
            <Pressable accessibilityLabel={online ? 'Forfeit' : 'Pause'} onPress={openMenu} style={styles.roundBtn} testID="menu">
              <Ionicons name={online ? 'flag' : 'pause'} size={20} color={colors.steel100} />
            </Pressable>
          </View>
        </View>

        {emotes && online && (
          <View style={styles.emoteBar}>
            {EMOTES.map((id) => (
              <Pressable
                key={id}
                onPress={() => {
                  playSound('click');
                  controller.emote(id);
                  setEmotes(false);
                }}
                style={styles.emoteChip}
              >
                <Text style={styles.emoteText}>{emoteLabel(id)}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {s.coinFlip && (
        <CoinFlip meFirst={s.coinFlip.meFirst} opponentName={meta.opponent?.name ?? 'Enemy'} onDone={s.dismissCoinFlip} />
      )}

      <ConfirmDialog
        visible={menu}
        title={online ? 'Forfeit battle?' : 'Paused'}
        message={online ? 'Your opponent will be awarded the win.' : 'Your battle is saved. Resume any time from Home.'}
        confirmLabel={online ? 'Forfeit' : 'Resume'}
        cancelLabel={online ? 'Keep fighting' : 'Save & quit'}
        destructive={online}
        onConfirm={() => {
          setMenu(false);
          if (online) controller.forfeit();
          else controller.resume();
        }}
        onCancel={() => {
          setMenu(false);
          if (online) return;
          if (controller instanceof LocalGameController) {
            const saved = controller.serialize();
            if (saved) void saveGame(saved);
          }
          useMatchStore.getState().detach();
          router.replace('/home');
        }}
      >
        {!online && (
          <Button
            title="Surrender"
            variant="danger"
            onPress={() => {
              setMenu(false);
              controller.resume();
              controller.forfeit();
            }}
          />
        )}
      </ConfirmDialog>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy900, alignItems: 'center' },
  column: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  trackerRow: { marginBottom: 8 },
  board: { position: 'absolute', left: 0, top: 0, transformOrigin: 'top left' },
  sidePanel: { position: 'absolute', justifyContent: 'flex-start', gap: 6 },
  notices: { position: 'absolute', top: 50, right: 0, alignItems: 'flex-end', gap: 6, zIndex: 50 },
  boardLabel: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.steel400, letterSpacing: 1.5 },
  statLine: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.steel200 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginVertical: 8 },
  status: { flexShrink: 1, fontFamily: fonts.heading, fontSize: 15, letterSpacing: 1, textAlign: 'center', color: colors.steel200 },
  rotateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: colors.brass,
  },
  rotateText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.navy900, letterSpacing: 1 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' },
  bottomActions: { flexDirection: 'row', gap: 8 },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy700,
    borderWidth: 1.5,
    borderColor: colors.steel600,
  },
  emoteBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, justifyContent: 'center' },
  emoteChip: { backgroundColor: colors.navy700, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.steel600 },
  emoteText: { fontFamily: fonts.bodySemi, color: colors.steel100, fontSize: 13 },
});
