import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { teamColor } from '@/components/setup/RoomSizeSettings';
import { Avatar } from '@/components/ui/Avatar';
import { colors, fonts } from '@/theme';

interface Props {
  name: string;
  avatarId: string;
  shipsRemaining: number;
  /** Team id in team games, -1 otherwise. */
  team: number;
  active: boolean;
  out: boolean;
  isMe: boolean;
  /** Currently aimed at by the local player. */
  targeted: boolean;
  connected: boolean;
  onPress?: () => void;
}

/** Compact player chip for the 3+ player turn-order bar. */
export function SeatChip({ name, avatarId, shipsRemaining, team, active, out, isMe, targeted, connected, onPress }: Props) {
  const border = targeted ? colors.signalRed : active ? colors.radarGreen : team >= 0 ? teamColor(team) : colors.steel600;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}${isMe ? ' (you)' : ''}, ${out ? 'knocked out' : `${shipsRemaining} ships`}${active ? ', taking aim' : ''}`}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.chip, { borderColor: border }, active && styles.active, out && styles.out]}
    >
      <View>
        <Avatar id={avatarId} size={26} />
        {!connected && !out && <View style={styles.offline} />}
      </View>
      <View style={{ minWidth: 0, flexShrink: 1 }}>
        <Text style={[styles.name, isMe && { color: colors.radarGreen }]} numberOfLines={1}>
          {isMe ? 'YOU' : name}
        </Text>
        <View style={styles.metaRow}>
          {out ? (
            <MaterialCommunityIcons name="skull-crossbones" size={11} color={colors.signalRed} />
          ) : (
            <MaterialCommunityIcons name="ferry" size={11} color={colors.steel400} />
          )}
          <Text style={[styles.meta, out && { color: colors.signalRed }]}>{out ? 'OUT' : shipsRemaining}</Text>
          {targeted && <MaterialCommunityIcons name="crosshairs-gps" size={11} color={colors.signalRed} />}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: colors.navy800,
    maxWidth: 140,
  },
  active: { backgroundColor: 'rgba(61,220,151,0.12)' },
  out: { opacity: 0.45 },
  offline: { position: 'absolute', right: -1, bottom: -1, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.signalRed, borderWidth: 1, borderColor: colors.navy900 },
  name: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.steel100, letterSpacing: 0.4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  meta: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.steel400 },
});
