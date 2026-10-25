import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { clampBoardSize, type GameMode, type MatchSettings, STANDARD_MATCH_SETTINGS } from '@shared/engine';
import { ROOM_CODE_LENGTH, roomCodeSchema } from '@shared/protocol';
import { describeTable, TableSettings } from '@/components/setup/TableSettings';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/controls';
import { Panel } from '@/components/ui/Panel';
import { Screen } from '@/components/ui/Screen';
import { ADVANCE } from '@/game/modes';
import { useServerStatus } from '@/hooks/useServerStatus';
import { useSettingsStore } from '@/stores/settings';
import { toast } from '@/stores/ui';
import { colors, fonts, text } from '@/theme';

export default function OnlineMenu() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const online = useServerStatus();
  const defaultMode = useSettingsStore((s) => s.defaultMode);
  const savedSize = useSettingsStore((s) => s.boardSize);
  const savedObstacles = useSettingsStore((s) => s.obstacles);
  const setSettings = useSettingsStore((s) => s.set);
  const [mode, setMode] = useState<GameMode>(defaultMode);
  const [table, setTable] = useState<MatchSettings>({ boardSize: clampBoardSize(savedSize), obstacles: savedObstacles });
  const [code, setCode] = useState('');
  const validCode = roomCodeSchema.safeParse(code).success;
  const privateFirst = params.tab === 'private';

  const guard = (fn: () => void) => () => {
    if (online === false) {
      toast('Server unreachable', 'Check your connection. Bot battles always work offline.', 'error');
      return;
    }
    fn();
  };

  const status = online === null ? 'Checking server…' : online ? 'Server online' : 'Server offline';
  const statusColor = online === null ? colors.steel400 : online ? colors.radarGreen : colors.signalRed;

  const quick = (
    <Panel title="Quick match" key="quick">
      <Text style={[text.body, styles.copy]}>
        Get paired with the next available captain. Standard table: {describeTable(STANDARD_MATCH_SETTINGS)}.
      </Text>
      <Button
        title="Find opponent"
        size="lg"
        disabled={online === false}
        onPress={guard(() => router.push({ pathname: '/online/matchmaking', params: { mode } }))}
        icon={<MaterialCommunityIcons name="radar" size={24} color="#FFF4F2" />}
        testID="quick-match"
      />
    </Panel>
  );

  const createRoom = () => {
    setSettings(table);
    router.push({ pathname: '/online/room', params: { kind: 'create', mode, boardSize: String(table.boardSize), obstacles: table.obstacles } });
  };

  const priv = (
    <Panel title="Private room" key="private">
      <Text style={[text.body, styles.copy]}>Create a room and share the code with a friend, or join theirs. As host you pick the table.</Text>
      <TableSettings mode={mode} value={table} onChange={setTable} />
      <Button
        title="Create room"
        variant="secondary"
        disabled={online === false}
        onPress={guard(createRoom)}
        style={{ marginTop: 16 }}
        icon={<MaterialCommunityIcons name="plus-circle" size={22} color={colors.steel100} />}
        testID="create-room"
      />
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
    </Panel>
  );

  return (
    <Screen title="Online" back scroll>
      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
      </View>
      <Text style={styles.section}>MODE</Text>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'classic', label: 'CLASSIC', hint: 'Straight ships, cannon only' },
          { value: 'advance', label: ADVANCE.toUpperCase(), hint: 'T/L/Z ships, power-ups' },
        ]}
      />
      <View style={{ gap: 14, marginTop: 16 }}>{privateFirst ? [priv, quick] : [quick, priv]}</View>
      <Text style={[text.caption, { textAlign: 'center', marginTop: 16 }]}>30 s per turn · 60 s+ to deploy · rejoin within 30 s if disconnected</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 1 },
  section: { ...text.label, marginTop: 14, marginBottom: 8 },
  copy: { color: colors.steel200, marginBottom: 12 },
  joinRow: { flexDirection: 'row', gap: 10, marginTop: 12, alignItems: 'flex-start' },
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
