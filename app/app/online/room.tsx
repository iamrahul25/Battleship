import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { clampBoardSize, MIN_PLAYERS, OBSTACLE_LEVELS, parseGameMode, parseTeamFormat, STANDARD_MATCH_SETTINGS } from '@shared/engine';
import { PlayerCard } from '@/components/hud/PlayerCard';
import { describeRoomSize, normalizeRoomSize } from '@/components/setup/RoomSizeSettings';
import { describeTable } from '@/components/setup/TableSettings';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Screen } from '@/components/ui/Screen';
import { OnlineGameController, type OnlineJoin } from '@/game/controllers/OnlineGameController';
import type { SeatInfo } from '@/game/controllers/types';
import { MODE_NAMES } from '@/game/modes';
import { useOnlineMatch } from '@/hooks/useOnlineMatch';
import { useMatchStore } from '@/stores/match';
import { toast } from '@/stores/ui';
import { colors, fonts, text } from '@/theme';

function SeatCard({ seat, width }: { seat: SeatInfo | null; width: number }) {
  if (!seat) {
    return (
      <View style={[styles.seat, styles.seatEmpty, { width }]}>
        <ActivityIndicator color={colors.steel400} />
        <Text style={text.caption}>Waiting…</Text>
      </View>
    );
  }
  return (
    <View style={[styles.seat, { width }, seat.isMe && { borderColor: colors.radarGreen }]}>
      <Avatar id={seat.avatarId} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.seatName} numberOfLines={1}>
          {seat.name}
        </Text>
        <View style={styles.tags}>
          {seat.isHost && <Text style={[styles.tag, { color: colors.brass, borderColor: colors.brass }]}>HOST</Text>}
          {seat.isMe && <Text style={[styles.tag, { color: colors.radarGreen, borderColor: colors.radarGreen }]}>YOU</Text>}
          {!seat.connected && <Text style={[styles.tag, { color: colors.signalRed, borderColor: colors.signalRed }]}>OFFLINE</Text>}
        </View>
      </View>
    </View>
  );
}

export default function PrivateRoom() {
  const params = useLocalSearchParams<{
    kind?: string;
    mode?: string;
    code?: string;
    boardSize?: string;
    obstacles?: string;
    maxPlayers?: string;
    teamFormat?: string;
  }>();
  const join = useMemo<OnlineJoin>(
    () =>
      params.kind === 'code'
        ? { kind: 'code', code: params.code ?? '' }
        : {
            kind: 'create',
            mode: parseGameMode(params.mode),
            settings: {
              boardSize: clampBoardSize(Number(params.boardSize) || STANDARD_MATCH_SETTINGS.boardSize),
              obstacles: OBSTACLE_LEVELS.find((o) => o === params.obstacles) ?? STANDARD_MATCH_SETTINGS.obstacles,
            },
            size: normalizeRoomSize({ maxPlayers: Number(params.maxPlayers) || 2, teamFormat: parseTeamFormat(params.teamFormat) }),
          },
    [params.kind, params.code, params.mode, params.boardSize, params.obstacles, params.maxPlayers, params.teamFormat],
  );
  const { error, connecting, controller } = useOnlineMatch(join);
  const meta = useMatchStore((s) => s.meta);
  const { width } = useWindowDimensions();
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
  const online = controller instanceof OnlineGameController ? controller : null;
  const maxPlayers = meta?.maxPlayers ?? (join.kind === 'create' ? join.size.maxPlayers : 2);
  const teamFormat = meta?.teamFormat ?? (join.kind === 'create' ? join.size.teamFormat : 'ffa');
  const multi = maxPlayers > 2;
  const seats = meta?.seats ?? [];
  const tableLine = online
    ? `${MODE_NAMES[online.mode].toUpperCase()} · ${describeTable(online.settings)}`
    : join.kind === 'create'
      ? `${MODE_NAMES[join.mode].toUpperCase()} · ${describeTable(join.settings)}`
      : '';
  const canStart = !!meta?.isHost && teamFormat === 'ffa' && seats.length >= MIN_PLAYERS && seats.length < maxPlayers;

  const contentW = Math.min(width, 900) - 32;
  const cols = contentW >= 640 ? 3 : 2;
  const seatW = Math.floor((contentW - (cols - 1) * 10) / cols);
  const slots: (SeatInfo | null)[] = [...seats, ...Array.from({ length: Math.max(0, maxPlayers - seats.length) }, () => null)];

  const hint = !multi
    ? 'Share the code. The battle starts as soon as your friend joins.'
    : teamFormat !== 'ffa'
      ? `The battle starts when all ${maxPlayers} seats are filled. Teams are shuffled at the start.`
      : meta?.isHost
        ? `Starts automatically at ${maxPlayers} players, or start now with ${MIN_PLAYERS}+.`
        : `Waiting for the host to start, or for the room to fill (${maxPlayers} players).`;

  return (
    <Screen title={joining ? 'Joining Room' : 'Private Room'} back={() => router.back()} scroll={multi} maxWidth={multi ? 900 : 560}>
      <View style={[styles.center, multi && styles.top]}>
        {error ? (
          <Text style={[text.body, { color: colors.signalRed, textAlign: 'center' }]}>{error.message}</Text>
        ) : connecting || !code ? (
          <>
            <ActivityIndicator size="large" color={colors.radarGreen} />
            {joining && <Text style={styles.waiting}>Boarding room {join.code.toUpperCase()}…</Text>}
          </>
        ) : (
          <>
            <Panel accent="brass" style={styles.codePanel}>
              <Text style={text.label}>ROOM CODE</Text>
              <Text style={styles.code} selectable testID="room-code">
                {code}
              </Text>
              {!!tableLine && (
                <Text style={styles.table} testID="room-table">
                  {tableLine}
                </Text>
              )}
              {multi && <Text style={[styles.table, { color: colors.brass }]}>{describeRoomSize({ maxPlayers, teamFormat })}</Text>}
              <View style={styles.codeActions}>
                <Button title="Copy" variant="secondary" size="sm" onPress={copy} icon={<Ionicons name="copy" size={16} color={colors.steel100} />} style={{ flex: 1 }} />
                <Button title="Share" variant="secondary" size="sm" onPress={share} icon={<Ionicons name="share-social" size={16} color={colors.steel100} />} style={{ flex: 1 }} />
              </View>
            </Panel>

            {multi ? (
              <View style={{ width: '100%', gap: 10 }}>
                <View style={styles.crewRow}>
                  <MaterialCommunityIcons name="account-group" size={18} color={colors.steel400} />
                  <Text style={text.label}>
                    CREW {seats.length}/{maxPlayers}
                  </Text>
                </View>
                <View style={styles.grid} testID="seat-grid">
                  {slots.map((s, i) => (
                    <SeatCard key={s?.sessionId ?? `empty-${i}`} seat={s} width={seatW} />
                  ))}
                </View>
              </View>
            ) : (
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
            )}
            <Text style={[text.caption, { textAlign: 'center' }]}>{hint}</Text>
            {canStart && (
              <Button
                title={`Start battle (${seats.length} players)`}
                variant="brass"
                size="lg"
                onPress={() => controller?.startEarly?.()}
                style={{ width: '100%' }}
                testID="start-room"
              />
            )}
          </>
        )}
      </View>
      <Button title={error ? 'Back' : 'Leave room'} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22 },
  top: { justifyContent: 'flex-start', paddingTop: 8, paddingBottom: 16, gap: 16 },
  codePanel: { alignItems: 'center', width: '100%', paddingVertical: 24 },
  code: { fontFamily: fonts.heading, fontSize: 48, letterSpacing: 10, color: colors.brass, marginVertical: 10 },
  table: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.steel200, marginBottom: 12, letterSpacing: 0.5, textAlign: 'center' },
  codeActions: { flexDirection: 'row', gap: 10, width: '100%' },
  players: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  vs: { fontFamily: fonts.heading, fontSize: 20, color: colors.signalRed },
  emptySeat: { alignItems: 'center', gap: 6, width: 120 },
  waiting: { fontFamily: fonts.heading, fontSize: 18, color: colors.radarGreen, letterSpacing: 1 },
  crewRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  seat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 64,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.steel600,
    backgroundColor: colors.navy800,
  },
  seatEmpty: { justifyContent: 'center', borderStyle: 'dashed', backgroundColor: 'transparent' },
  seatName: { fontFamily: fonts.heading, fontSize: 15, color: colors.steel100, letterSpacing: 0.6 },
  tags: { flexDirection: 'row', gap: 4, marginTop: 3, flexWrap: 'wrap' },
  tag: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1, borderWidth: 1, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
});
