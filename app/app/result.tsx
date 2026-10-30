import { type FinishReason, isMultiplayerView, type PublicView, viewAllies, viewEnemies } from '@shared/engine';
import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playSound, SoundManager } from '@/audio/SoundManager';
import { Confetti } from '@/components/art/Scenes';
import { BattleGrid } from '@/components/grid/BattleGrid';
import { Stamp } from '@/components/hud/Overlays';
import { teamColor, teamName } from '@/components/setup/RoomSizeSettings';
import { Avatar } from '@/components/ui/Avatar';
import { BadgeIcon, MedalIcon } from '@/components/ui/BadgeIcon';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import type { SeatInfo } from '@/game/controllers/types';
import { accuracy, achievementById } from '@/game/progression';
import { haptic } from '@/platform/haptics';
import { useMatchStore } from '@/stores/match';
import { useSettingsStore } from '@/stores/settings';
import { colors, fonts, text } from '@/theme';

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'ST' : n % 10 === 2 && n !== 12 ? 'ND' : n % 10 === 3 && n !== 13 ? 'RD' : 'TH'}`;

const OUT_TEXT: Record<FinishReason, string> = {
  sunk: 'Fleet sunk',
  forfeit: 'Surrendered',
  disconnect: 'Disconnected',
  timeout: 'Timed out',
};

function multiReasonText(view: PublicView, won: boolean) {
  if (won) return view.teamGame ? 'Your team ruled the seas' : 'Last fleet afloat';
  const out = view.players[view.viewer]?.out;
  if (out === 'sunk') return 'Your fleet was destroyed';
  if (out === 'forfeit') return 'You surrendered';
  if (out === 'disconnect') return 'You were disconnected';
  if (out === 'timeout') return 'Too many missed turns';
  return view.teamGame ? 'Your team was defeated' : 'Defeated';
}

function Standings({ view, seats }: { view: PublicView; seats: SeatInfo[] }) {
  return (
    <View style={{ gap: 8 }}>
      {(view.standings ?? []).map((st) => {
        const info = seats.find((x) => x.seat === st.player);
        const team = view.players[st.player]?.team ?? -1;
        const me = st.player === view.viewer;
        return (
          <View key={st.player} style={[styles.standRow, me && { borderColor: colors.radarGreen }]}>
            <Text style={[styles.rank, st.rank === 1 && { color: colors.brass }]}>{ordinal(st.rank)}</Text>
            <Avatar id={info?.avatarId ?? 'captain'} size={30} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.standName} numberOfLines={1}>
                {info?.name ?? `Player ${st.player + 1}`}
                {me ? '  (you)' : ''}
              </Text>
              <Text style={styles.standMeta}>
                {view.teamGame ? `TEAM ${teamName(team)} · ` : ''}
                {st.out ? OUT_TEXT[st.out] : 'Afloat'}
              </Text>
            </View>
            {view.teamGame && <View style={[styles.teamDot, { backgroundColor: teamColor(team) }]} />}
          </View>
        );
      })}
    </View>
  );
}

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
  const multi = isMultiplayerView(result.view);
  const boardSize = Math.min((Math.min(width, 560) - 56) / 2, 220);
  const rematchMine = meta?.rematch.me ?? false;
  const rematchTheirs = meta?.rematch.opponent ?? false;
  const present = meta?.seats.filter((x) => x.connected) ?? [];
  const votes = present.filter((x) => x.wantsRematch).length;
  const teamShort = multi && meta?.teamFormat !== 'ffa' && present.length < (meta?.maxPlayers ?? 0);
  const opponentGone = online && (multi ? present.length < 2 || teamShort || !!closedReason : !meta?.opponent || !meta.opponent.connected || !!closedReason);

  // 3+ players: every fleet, in a grid whose columns follow the screen width.
  const fleetCols = multi ? (width >= 720 ? 3 : 2) : 2;
  const fleetW = Math.min(width, 900) - 56;
  const fleetSize = Math.floor(Math.min((fleetW - (fleetCols - 1) * 12) / fleetCols, 240));
  const rematchTitle = !online
    ? 'Rematch'
    : rematchMine
      ? multi
        ? `Waiting for others… (${votes}/${present.length})`
        : 'Waiting for opponent…'
      : rematchTheirs
        ? multi
          ? `Rematch (${votes}/${present.length} ready)`
          : 'Accept rematch'
        : 'Rematch';
  const rank = result.rank ?? result.view.standings?.find((x) => x.player === result.view.viewer)?.rank;
  const stampText = !multi
    ? result.youWon
      ? 'VICTORY'
      : 'DEFEAT'
    : result.youWon
      ? result.view.teamGame
        ? 'TEAM VICTORY'
        : 'VICTORY'
      : rank
        ? `${ordinal(rank)} PLACE`
        : 'DEFEAT';

  const home = () => {
    useMatchStore.getState().detach();
    router.replace('/home');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {result.youWon && !reduced && <Confetti width={width} height={height} />}
      <ScrollView contentContainerStyle={[styles.scroll, multi && { maxWidth: 900 }, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.bannerArea}>
          <Stamp
            stampKey={1}
            text={stampText}
            color={result.youWon ? colors.brass : colors.signalRed}
            hold={1e9}
            size={Math.min(54, width / (stampText.length > 9 ? 9 : 7))}
          />
        </View>
        <Text style={styles.reason}>{multi ? multiReasonText(result.view, result.youWon) : reasonText(result.youWon, result.reason)}</Text>
        <Text style={styles.vs}>{multi ? summary.opponentName : `vs ${summary.opponentName}`}</Text>

        {multi && meta && (
          <Animated.View entering={FadeInUp.delay(200)} style={{ width: '100%', maxWidth: 560, marginBottom: 12 }}>
            <Panel title="Standings" accent={result.youWon ? 'brass' : 'red'}>
              <Standings view={result.view} seats={meta.seats} />
            </Panel>
          </Animated.View>
        )}

        <Animated.View entering={FadeInUp.delay(300)} style={{ width: '100%', maxWidth: 560 }}>
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

        {multi ? (
          <Animated.View entering={FadeInUp.delay(500)} style={[styles.boards, { flexWrap: 'wrap', gap: 12, rowGap: 14 }]}>
            {[result.view.players[result.view.viewer]!, ...viewAllies(result.view), ...viewEnemies(result.view, true)].map((sv) => {
              const seat = sv.player;
              const info = meta?.seats.find((x) => x.seat === seat);
              const mine = seat === result.view.viewer;
              const team = sv.team;
              return (
                <View key={seat} style={{ alignItems: 'center', width: fleetSize }}>
                  <Text
                    style={[styles.boardTitle, result.view.teamGame && { color: teamColor(team) }]}
                    numberOfLines={1}
                  >
                    {mine ? 'YOUR FLEET' : (info?.name ?? `PLAYER ${seat + 1}`).toUpperCase()}
                  </Text>
                  {mine ? (
                    <BattleGrid size={fleetSize} board={result.view.myBoard} kind="own" showLabels={false} reducedMotion />
                  ) : (
                    <BattleGrid size={fleetSize} board={sv.board} kind="target" showLabels={false} revealed={sv.board.ships} reducedMotion />
                  )}
                </View>
              );
            })}
          </Animated.View>
        ) : (
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
        )}

        <View style={[styles.actions, { maxWidth: 560 }]}>
          <Button
            title={rematchTitle}
            variant="brass"
            size="lg"
            disabled={rematchMine || opponentGone}
            onPress={() => controller.rematch()}
            testID="rematch"
          />
          {online && rematchTheirs && !rematchMine && !opponentGone && (
            <Text style={styles.rematchHint}>{multi ? 'Others want a rematch!' : 'Your opponent wants a rematch!'}</Text>
          )}
          {opponentGone && (
            <Text style={styles.rematchHint}>
              {!multi
                ? 'Opponent has left the room.'
                : teamShort
                  ? 'A team rematch needs every seat filled.'
                  : 'Not enough players left for a rematch.'}
            </Text>
          )}
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
  standRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.navy800,
  },
  rank: { fontFamily: fonts.heading, fontSize: 18, color: colors.steel200, width: 40 },
  standName: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.steel100 },
  standMeta: { ...text.caption, fontSize: 11 },
  teamDot: { width: 12, height: 12, borderRadius: 6 },
});
