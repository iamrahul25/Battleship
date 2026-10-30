import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type Coord,
  getWeapon,
  legalTargets,
  obstacleAt,
  ONLINE_TURN_TIME_MS,
  other,
  patternCells,
  type PublicView,
  type SonarResult,
  type TargetView,
  torpedoLane,
  viewAllies,
  viewEnemies,
  type WeaponDef,
} from '@shared/engine';
import { EMOTES } from '@shared/protocol';
import { playSound } from '@/audio/SoundManager';
import { BattleGrid } from '@/components/grid/BattleGrid';
import { RulesSheet } from '@/components/help/RulesSheet';
import { FleetTracker } from '@/components/hud/FleetTracker';
import { CoinFlip, EmoteBubble, emoteLabel, SideNotice, TurnBanner } from '@/components/hud/Overlays';
import { PowerUpBar } from '@/components/hud/PowerUpBar';
import { SeatChip } from '@/components/hud/SeatChip';
import { TurnTimer } from '@/components/hud/TurnTimer';
import { teamColor } from '@/components/setup/RoomSizeSettings';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { SeatInfo } from '@/game/controllers/types';
import { useBackGuard } from '@/hooks/useLeaveGuard';
import { useNow } from '@/hooks/useNow';
import { type ActiveFx, useMatchStore } from '@/stores/match';
import { useSettingsStore } from '@/stores/settings';
import { colors, fonts } from '@/theme';

/** Wide screens (tablet/desktop web) show every enemy board at once. */
const WIDE_MIN_WIDTH = 900;

const AIM_HINT: Record<string, string> = {
  torpedo: 'Torpedo: tap a cell. Runs right → until it hits something',
  airstrike: 'Airstrike: tap a cell. Hits it + 3 cells forward ↑',
  barrage: 'Barrage: tap an enemy board to fire',
  sonar: 'Sonar: tap the centre of a 3×3 area to scan',
  artillery: 'Artillery: tap the centre of the + shape',
};

/** Sonar scans that landed on `seat`'s board (only shared with the shooting and defending teams). */
const sonarOn = (view: PublicView, seat: number): SonarResult[] =>
  view.log.filter((e) => e.sonar && (e.against ?? other(e.by)) === seat).map((e) => e.sonar!);

function aimFor(weapon: WeaponDef | undefined, board: TargetView): ((c: Coord) => Coord[]) | undefined {
  if (!weapon || weapon.id === 'standard') return undefined;
  if (weapon.kind === 'random') {
    const open = legalTargets(board).filter((c) => obstacleAt(board, c) !== 'reef');
    return () => open;
  }
  if (weapon.kind === 'torpedo') return (c) => torpedoLane(board, c);
  return (c) => patternCells(weapon, c, board);
}

interface BoardSlotProps {
  view: PublicView;
  seat: number;
  size: number;
  title: string;
  color: string;
  highlighted: boolean;
  /** Fire on tap (your turn, living enemy). */
  firing: boolean;
  weapon: WeaponDef | undefined;
  fx: ActiveFx | null;
  reduced: boolean;
  labels?: boolean;
  tracker?: boolean;
  onFire: (c: Coord, seat: number) => void;
  /** Tap to focus/select (mini boards). */
  onSelect?: (seat: number) => void;
}

function BoardSlot({ view, seat, size, title, color, highlighted, firing, weapon, fx, reduced, labels = true, tracker, onFire, onSelect }: BoardSlotProps) {
  const sv = view.players[seat];
  const own = seat === view.viewer || (view.teamGame && sv.team === view.players[view.viewer].team);
  const board = sv.board;
  const aim = useMemo(() => (firing ? aimFor(weapon, board) : undefined), [firing, weapon, board]);
  const fire = useCallback((c: Coord) => onFire(c, seat), [onFire, seat]);
  const sonar = useMemo(() => sonarOn(view, seat), [view, seat]);
  const grid = (
    <BattleGrid
      size={size}
      board={board}
      kind={own ? 'own' : 'target'}
      showLabels={labels}
      interactive={firing}
      onFire={fire}
      aimPattern={aim}
      aimTone={weapon?.kind === 'reveal' ? 'scan' : 'attack'}
      sonar={sonar}
      fx={fx && fx.against === seat ? fx : null}
      reducedMotion={reduced}
    />
  );
  return (
    <View style={{ width: size, gap: 3 }}>
      <View style={styles.slotHeader}>
        <Text style={[styles.slotTitle, { color }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.slotMeta}>{sv.out ? 'OUT' : `${sv.info.shipsRemaining}⛴`}</Text>
      </View>
      <View style={[styles.slotFrame, highlighted && { borderColor: colors.signalRed }, sv.out && { opacity: 0.55 }]}>
        {onSelect && !firing ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Show ${title}`} onPress={() => onSelect(seat)}>
            <View pointerEvents="none">{grid}</View>
          </Pressable>
        ) : (
          grid
        )}
      </View>
      {tracker && <FleetTracker rules={view.rules} lost={sv.info.shipsLost} unit={Math.max(5, Math.min(8, size / 50))} />}
    </View>
  );
}

export function MultiBattle() {
  const s = useMatchStore();
  const { controller, view, meta, fx } = s;
  const reduced = useSettingsStore((st) => st.reducedMotion);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState(false);
  const [emotes, setEmotes] = useState(false);
  const [help, setHelp] = useState(false);
  // A manual pick only lasts until the next shot, which pulls the big board back to the action.
  const [picked, setManualFocus] = useState<{ seat: number; shots: number } | null>(null);

  const seatInfo = useCallback((seat: number): SeatInfo | undefined => meta?.seats.find((x) => x.seat === seat), [meta]);
  const nameOf = useCallback((seat: number) => seatInfo(seat)?.name ?? `Player ${seat + 1}`, [seatInfo]);
  const anyAway = !!meta?.seats.some((x) => !x.connected && !x.eliminated);
  const now = useNow(anyAway, 1000);

  // Screen shake.
  const shakeX = useSharedValue(0);
  useEffect(() => {
    if (!s.shake.key || reduced) return;
    const i = s.shake.intensity;
    shakeX.value = withSequence(withTiming(i, { duration: 40 }), withTiming(-i, { duration: 50 }), withTiming(i * 0.5, { duration: 50 }), withTiming(0, { duration: 60 }));
  }, [s.shake, reduced, shakeX]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));

  useEffect(() => {
    if (s.showResult) router.replace('/result');
  }, [s.showResult]);

  useEffect(() => {
    if (s.closedReason && !s.result) {
      useMatchStore.getState().detach();
      router.replace('/home');
    }
  }, [s.closedReason, s.result]);

  const openMenu = useCallback(() => {
    playSound('click');
    setMenu(true);
  }, []);
  useBackGuard(openMenu);

  const onFire = useCallback((c: Coord, seat: number) => useMatchStore.getState().fire(c, seat), []);

  if (!view || !meta || !controller) return null;

  const me = view.viewer;
  const spectating = !!view.players[me]?.out;
  const myTurn = view.phase === 'battle' && view.activePlayer === me && !spectating;
  const canFire = myTurn && !fx && !s.awaiting && s.queue.length === 0 && !menu && !help && !s.coinFlip;
  const enemies = viewEnemies(view, true);
  const allies = viewAllies(view);
  const myTeam = view.players[me].team;
  const isEnemy = (seat: number) => seat !== me && !(view.teamGame && view.players[seat].team === myTeam);
  const target = s.targetPlayer;
  const lastAgainst = view.log.length ? (view.log[view.log.length - 1].against ?? null) : null;
  const manualFocus = picked && picked.shots === view.log.length && !fx ? picked.seat : null;
  const weapon = getWeapon(s.selectedWeapon);
  const turnTotal = view.rules.turnTimeMs ?? ONLINE_TURN_TIME_MS;
  const activeSeat = seatInfo(view.activePlayer);

  const titleFor = (seat: number) => {
    if (seat === me) return 'YOUR WATERS';
    if (!isEnemy(seat)) return `ALLY · ${nameOf(seat).toUpperCase()}`;
    return nameOf(seat).toUpperCase();
  };
  const colorFor = (seat: number) => (seat === me ? colors.radarGreen : view.teamGame ? teamColor(view.players[seat].team) : colors.steel200);

  let status: string;
  if (spectating) status = "You're out. Watching the rest of the battle…";
  else if (myTurn) {
    status =
      weapon && weapon.id !== 'standard'
        ? (AIM_HINT[weapon.id] ?? `${weapon.name}: pick a target`)
        : target !== null
          ? `Your turn: fire at ${nameOf(target)}`
          : 'Your turn: pick an enemy board';
  } else {
    const ally = view.phase === 'battle' && !isEnemy(view.activePlayer);
    status = `${nameOf(view.activePlayer)}${ally ? ' (ally)' : ''} is taking aim…`;
  }
  if (meta.connection === 'reconnecting') status = 'Connection lost. Reconnecting…';
  else if (activeSeat && !activeSeat.connected && !activeSeat.isMe) {
    const left = activeSeat.reconnectDeadline ? Math.max(0, Math.ceil((activeSeat.reconnectDeadline - now) / 1000)) : 0;
    status = `${activeSeat.name} disconnected. Waiting ${left}s…`;
  } else if (fx && !fx.mine && fx.event.auto) status = `Time out! ${nameOf(fx.event.by)}'s shot was fired automatically.`;

  const select = (seat: number) => {
    playSound('click');
    if (myTurn && isEnemy(seat) && !view.players[seat].out) {
      useMatchStore.getState().selectTarget(seat);
      setManualFocus(null);
    } else setManualFocus({ seat, shots: view.log.length });
  };

  const turnBar = (
    <View style={styles.topRow}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flex: 1 }}>
        {view.turnOrder.map((seat) => {
          const info = seatInfo(seat);
          const sv = view.players[seat];
          return (
            <SeatChip
              key={seat}
              name={info?.name ?? `Player ${seat + 1}`}
              avatarId={info?.avatarId ?? 'captain'}
              shipsRemaining={sv.info.shipsRemaining}
              team={view.teamGame ? sv.team : -1}
              active={view.phase === 'battle' && view.activePlayer === seat}
              out={!!sv.out}
              isMe={seat === me}
              targeted={myTurn && target === seat}
              connected={info?.connected ?? true}
              onPress={() => select(seat)}
            />
          );
        })}
      </ScrollView>
      <TurnTimer deadline={meta.deadline} totalMs={turnTotal} paused={meta.paused} tick={myTurn} size={40} />
    </View>
  );

  const powerUps = view.rules.powerUpsEnabled && !spectating ? (
    <PowerUpBar rules={view.rules} me={view.me} selected={s.selectedWeapon} enabled={canFire} onSelect={s.selectWeapon} />
  ) : (
    <View style={styles.statRow}>
      <Text style={styles.statLine}>Shots {view.me.shotsFired}</Text>
      <Text style={styles.statLine}>Hits {view.me.hits}</Text>
      <Text style={styles.statLine}>Sunk {view.me.shipsSunk}</Text>
    </View>
  );

  const actions = (
    <View style={styles.bottomActions}>
      <Pressable accessibilityRole="button" accessibilityLabel="Rules and info" onPress={() => setHelp(true)} style={styles.roundBtn} testID="rules">
        <Ionicons name="help" size={22} color={colors.steel100} />
      </Pressable>
      <Pressable accessibilityLabel="Emotes" onPress={() => setEmotes((v) => !v)} style={styles.roundBtn}>
        <Ionicons name="chatbubble-ellipses" size={20} color={colors.steel100} />
      </Pressable>
      <Pressable accessibilityLabel={spectating ? 'Leave battle' : 'Forfeit'} onPress={openMenu} style={styles.roundBtn} testID="menu">
        <Ionicons name={spectating ? 'exit-outline' : 'flag'} size={20} color={colors.steel100} />
      </Pressable>
    </View>
  );

  const statusLine = (
    <Text style={[styles.status, { color: myTurn ? colors.radarGreen : spectating ? colors.signalRed : colors.steel400 }]} accessibilityLiveRegion="polite">
      {status}
    </Text>
  );

  const emoteBar = emotes ? (
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
  ) : null;

  const notices = (
    <View pointerEvents="none" style={styles.notices}>
      {s.banner && <TurnBanner key={s.banner.key} mine={s.banner.mine} name={s.banner.name} />}
      {s.stamp && <SideNotice key={s.stamp.key} text={s.stamp.text} color={colors.signalRed} />}
    </View>
  );

  const wide = width >= WIDE_MIN_WIDTH;
  const usableH = height - insets.top - insets.bottom;

  const slot = (seat: number, size: number, opts: { labels?: boolean; tracker?: boolean; mini?: boolean } = {}) => (
    <BoardSlot
      key={seat}
      view={view}
      seat={seat}
      size={size}
      title={titleFor(seat)}
      color={colorFor(seat)}
      highlighted={myTurn && target === seat}
      firing={canFire && isEnemy(seat) && !view.players[seat].out && (!opts.mini || wide)}
      weapon={weapon}
      fx={fx}
      reduced={reduced}
      labels={opts.labels}
      tracker={opts.tracker}
      onFire={onFire}
      onSelect={opts.mini ? select : undefined}
    />
  );

  let body: ReactNode;

  if (wide) {
    // Left: your board (+ allies) and controls. Right: every enemy board in an adaptive grid.
    const leftW = Math.min(400, Math.round(width * 0.3));
    const rightW = Math.min(width - leftW - 48, 1300);
    const n = enemies.length;
    const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    const gap = 14;
    const headerH = 64;
    const cell = Math.floor(Math.min((rightW - (cols - 1) * gap) / cols, (usableH - headerH - rows * 40 - (rows - 1) * gap) / rows, 560));
    const allyW = allies.length ? Math.floor((leftW - (allies.length - 1) * 8) / Math.max(1, allies.length)) : 0;
    const ownSize = Math.min(leftW, Math.max(200, usableH - 330 - (allies.length ? Math.min(allyW, 160) + 30 : 0)));
    body = (
      <View style={[styles.wideRow, { paddingHorizontal: 16 }]}>
        <View style={{ width: leftW, gap: 10 }}>
          {slot(me, ownSize, { tracker: false })}
          {allies.length > 0 && <View style={styles.miniRow}>{allies.map((a) => slot(a.player, Math.min(allyW, 160), { labels: false, mini: true }))}</View>}
          {powerUps}
          {statusLine}
          <View style={styles.bottomRow}>{actions}</View>
          {emoteBar}
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={[styles.enemyGrid, { width: cols * cell + (cols - 1) * gap, gap }]}>
            {enemies.map((e) => slot(e.player, cell, { tracker: true }))}
          </View>
        </View>
      </View>
    );
  } else {
    // Phone: one big focused board + a strip of mini boards.
    const contentW = Math.min(width - 24, 560);
    const focus =
      myTurn && target !== null && manualFocus === null
        ? target
        : (manualFocus ?? (fx ? fx.against : null) ?? (myTurn ? target : null) ?? lastAgainst ?? enemies.find((e) => !e.out)?.player ?? me);
    const others = [me, ...allies.map((a) => a.player), ...enemies.map((e) => e.player)].filter((seat) => seat !== focus);
    const gap = 8;
    const m = Math.round(Math.max(64, Math.min(120, (contentW - (others.length - 1) * gap) / others.length)));
    const reserved = 56 + 24 + (m + 22) + (view.rules.powerUpsEnabled ? 70 : 30) + 34 + 52 + 40;
    const L = Math.round(Math.max(200, Math.min(contentW, usableH - reserved)));
    body = (
      <View style={{ width: contentW, flex: 1 }}>
        <View style={{ alignItems: 'center' }}>{slot(focus, L, { tracker: isEnemy(focus) })}</View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.miniRow, { gap }]} style={styles.strip}>
          {others.map((seat) => slot(seat, m, { labels: false, mini: true }))}
        </ScrollView>
        <View style={{ height: view.rules.powerUpsEnabled && !spectating ? 64 : 24 }}>{powerUps}</View>
        {statusLine}
        <View style={styles.bottomRow}>
          <Text style={styles.youLine} numberOfLines={1}>
            {meta.me.name} · {view.me.shipsRemaining} ships
          </Text>
          {actions}
        </View>
        {emoteBar}
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 8 }]}>
      <View style={{ width: wide ? Math.min(width - 32, 1700) : Math.min(width - 24, 560) }}>{turnBar}</View>
      <Animated.View style={[{ flex: 1, alignItems: 'center', width: '100%' }, shakeStyle]}>
        {body}
        {notices}
        {s.emote && <EmoteBubble key={s.emote.key} emoteKey={s.emote.key} id={s.emote.id} fromMe={s.emote.fromMe} />}
      </Animated.View>

      {s.coinFlip && (
        <CoinFlip meFirst={s.coinFlip.meFirst} opponentName={s.coinFlip.firstName ?? nameOf(view.activePlayer)} onDone={s.dismissCoinFlip} />
      )}

      <RulesSheet
        visible={help}
        match={{ rules: view.rules, turnSeconds: Math.round(turnTotal / 1000) }}
        note="The turn timer keeps running in online matches."
        onClose={() => setHelp(false)}
      />

      <ConfirmDialog
        visible={menu}
        title={spectating ? 'Leave battle?' : 'Forfeit battle?'}
        message={
          spectating
            ? "You're already out. The others will keep playing."
            : view.players.length > 2
              ? 'Your fleet is scuttled and the others play on.'
              : 'Your opponent will be awarded the win.'
        }
        confirmLabel={spectating ? 'Leave' : 'Forfeit'}
        cancelLabel={spectating ? 'Keep watching' : 'Keep fighting'}
        destructive
        onConfirm={() => {
          setMenu(false);
          if (spectating) {
            useMatchStore.getState().leaveAsSpectator();
            router.replace('/home');
          } else controller.forfeit();
        }}
        onCancel={() => setMenu(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy900, alignItems: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  chips: { gap: 6, alignItems: 'center', paddingRight: 4 },
  wideRow: { flex: 1, flexDirection: 'row', gap: 24, width: '100%' },
  enemyGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  miniRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  strip: { flexGrow: 0, marginTop: 8, marginBottom: 6 },
  slotHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  slotTitle: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, flexShrink: 1 },
  slotMeta: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.steel400 },
  slotFrame: { borderWidth: 2, borderColor: 'transparent', borderRadius: 6 },
  notices: { position: 'absolute', top: 30, right: 0, alignItems: 'flex-end', gap: 6, zIndex: 50 },
  statRow: { flexDirection: 'row', gap: 16, justifyContent: 'center', alignItems: 'center' },
  statLine: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.steel200 },
  status: { fontFamily: fonts.heading, fontSize: 15, letterSpacing: 1, textAlign: 'center', marginVertical: 6 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', gap: 8 },
  youLine: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.radarGreen, flexShrink: 1 },
  bottomActions: { flexDirection: 'row', gap: 8, marginLeft: 'auto' },
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
