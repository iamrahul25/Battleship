import { StyleSheet, Text, View } from 'react-native';
import { formatsFor, MAX_PLAYERS, MIN_PLAYERS, playersForFormat, type TeamFormat } from '@shared/engine';
import { Segmented } from '@/components/ui/controls';
import type { RoomSize } from '@/game/controllers/OnlineGameController';
import { colors, text } from '@/theme';

const FORMAT_LABELS: Record<TeamFormat, { label: string; hint: string }> = {
  ffa: { label: 'FREE-FOR-ALL', hint: 'Every captain for themselves' },
  '2v2': { label: '2 v 2', hint: 'Two teams of 2' },
  '3v3': { label: '3 v 3', hint: 'Two teams of 3' },
  '2v2v2': { label: '2v2v2', hint: 'Three teams of 2' },
};

const TEAM_COLORS = [colors.ocean300, colors.fireOrange, '#B07CE8'];
const TEAM_NAMES = ['BLUE', 'ORANGE', 'PURPLE'];

export const teamColor = (team: number) => (team >= 0 ? TEAM_COLORS[team % TEAM_COLORS.length] : colors.steel400);
export const teamName = (team: number) => (team >= 0 ? TEAM_NAMES[team % TEAM_NAMES.length] : '');

/** "4 players · 2 v 2" / "3 players · free-for-all" */
export function describeRoomSize(size: RoomSize): string {
  if (size.maxPlayers <= 2) return '1 v 1';
  return `${size.maxPlayers} PLAYERS · ${FORMAT_LABELS[size.teamFormat].label}`;
}

/** Keeps a saved size/format pair valid (team formats fix the player count). */
export function normalizeRoomSize(size: RoomSize): RoomSize {
  const maxPlayers = playersForFormat(size.teamFormat, size.maxPlayers);
  return { maxPlayers, teamFormat: formatsFor(maxPlayers).includes(size.teamFormat) ? size.teamFormat : 'ffa' };
}

const PLAYER_OPTIONS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => {
  const n = MIN_PLAYERS + i;
  return { value: String(n), label: String(n) };
});

export function RoomSizeSettings({ value, onChange }: { value: RoomSize; onChange: (v: RoomSize) => void }) {
  const formats = formatsFor(value.maxPlayers);
  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>PLAYERS</Text>
      <Segmented
        value={String(value.maxPlayers)}
        onChange={(v) => onChange(normalizeRoomSize({ maxPlayers: Number(v), teamFormat: value.teamFormat }))}
        options={PLAYER_OPTIONS}
      />
      {formats.length > 1 && (
        <>
          <Text style={[styles.section, { marginTop: 14 }]}>FORMAT</Text>
          <Segmented
            value={value.teamFormat}
            onChange={(f) => onChange({ ...value, teamFormat: f })}
            options={formats.map((f) => ({ value: f, ...FORMAT_LABELS[f] }))}
          />
        </>
      )}
      <Text style={[text.caption, { marginTop: 8 }]}>
        {value.teamFormat !== 'ffa'
          ? 'Teams are shuffled when the battle starts. Teammates see each other’s fleets.'
          : value.maxPlayers > 2
            ? 'Starts when the room is full, or the host can start early with 2+ players.'
            : 'Classic duel against one friend.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14 },
  section: { ...text.label, marginBottom: 8 },
});
