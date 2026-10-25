import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { clampBoardSize, type GameMode, type MatchSettings } from '@shared/engine';
import { ROOM_CODE_LENGTH, roomCodeSchema } from '@shared/protocol';
import { TableSettings } from '@/components/setup/TableSettings';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/controls';
import { Panel } from '@/components/ui/Panel';
import { Screen } from '@/components/ui/Screen';
import { ADVANCE } from '@/game/modes';
import { useServerStatus } from '@/hooks/useServerStatus';
import { useSettingsStore } from '@/stores/settings';
import { toast } from '@/stores/ui';
import { colors, fonts, text } from '@/theme';

const MODE_OPTIONS: { value: GameMode; label: string; hint: string }[] = [
  { value: 'classic', label: 'CLASSIC', hint: 'Straight ships, cannon only' },
  { value: 'advance', label: ADVANCE.toUpperCase(), hint: 'T/L/Z ships, power-ups' },
];

export default function OnlineMenu() {
  const online = useServerStatus();
  const defaultMode = useSettingsStore((s) => s.defaultMode);
  const savedSize = useSettingsStore((s) => s.boardSize);
  const savedObstacles = useSettingsStore((s) => s.obstacles);
  const setSettings = useSettingsStore((s) => s.set);
  const [roomMode, setRoomMode] = useState<GameMode>(defaultMode);
  const [table, setTable] = useState<MatchSettings>({ boardSize: clampBoardSize(savedSize), obstacles: savedObstacles });
  const [code, setCode] = useState('');
  const validCode = roomCodeSchema.safeParse(code).success;

  const guard = (fn: () => void) => () => {
    if (online === false) {
      toast('Server unreachable', 'Check your connection. Bot battles always work offline.', 'error');
      return;
    }
    fn();
  };

  const status = online === null ? 'Checking server…' : online ? 'Server online' : 'Server offline';
  const statusColor = online === null ? colors.steel400 : online ? colors.radarGreen : colors.signalRed;

  const createRoom = () => {
    setSettings(table);
    router.push({ pathname: '/online/room', params: { kind: 'create', mode: roomMode, boardSize: String(table.boardSize), obstacles: table.obstacles } });
  };

  return (
    <Screen title="Private Room" back scroll>
      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
      </View>
      <View style={{ gap: 14, marginTop: 10 }}>
        <Panel title="Join a room or create a room">
          <Text style={[text.body, styles.copy]}>Got a code from a friend? Type it in and tap Join.</Text>
          <View style={styles.joinRow}>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="CODE"
              placeholderTextColor={colors.steel600}
              maxLength={ROOM_CODE_LENGTH}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.codeInput}
              accessibilityLabel="Room code"
              testID="code-input"
            />
            <Button
              title="Join"
              variant="brass"
              disabled={!validCode || online === false}
              onPress={guard(() => router.push({ pathname: '/online/room', params: { kind: 'code', code } }))}
              style={{ flex: 1 }}
              testID="join-room"
            />
          </View>
          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.orLine} />
          </View>
          <Button
            title="Create room"
            variant="secondary"
            disabled={online === false}
            onPress={guard(createRoom)}
            icon={<MaterialCommunityIcons name="plus-circle" size={22} color={colors.steel100} />}
            testID="create-room"
          />
          <Text style={[text.caption, { marginTop: 8 }]}>
            Host a private match and share the room code with a friend. It uses the mode and table from New room settings below.
          </Text>
        </Panel>

        <Panel title="New room settings">
          <Text style={styles.section}>MODE</Text>
          <Segmented value={roomMode} onChange={setRoomMode} options={MODE_OPTIONS} />
          <TableSettings mode={roomMode} value={table} onChange={setTable} />
        </Panel>
      </View>
      <Text style={[text.caption, { textAlign: 'center', marginTop: 16 }]}>30 s per turn · 60 s+ to deploy · rejoin within 30 s if disconnected</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 1 },
  section: { ...text.label, marginBottom: 8 },
  copy: { color: colors.steel200, marginBottom: 12 },
  joinRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.steel600 },
  orText: { ...text.label, color: colors.steel400 },
  codeInput: {
    flex: 1.3,
    height: 52,
    fontFamily: fonts.heading,
    fontSize: 22,
    letterSpacing: 4,
    color: colors.steel100,
    textAlign: 'center',
    backgroundColor: colors.navy800,
    borderWidth: 1.5,
    borderColor: colors.steel600,
    borderRadius: 10,
  },
});
