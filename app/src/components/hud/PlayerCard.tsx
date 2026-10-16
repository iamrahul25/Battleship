import { StyleSheet, Text, View } from 'react-native';
import type { PlayerCardInfo } from '@/game/controllers/types';
import { colors, fonts } from '@/theme';
import { Avatar } from '../ui/Avatar';

interface Props {
  info: PlayerCardInfo | null;
  shipsRemaining?: number;
  active?: boolean;
  align?: 'left' | 'right';
  compact?: boolean;
  subtitle?: string;
}

export function PlayerCard({ info, shipsRemaining, active, align = 'left', compact, subtitle }: Props) {
  if (!info) return null;
  const right = align === 'right';
  return (
    <View style={[styles.card, right && { flexDirection: 'row-reverse' }]}>
      <View style={[styles.avatarRing, active && styles.activeRing]}>
        <Avatar id={info.avatarId} size={compact ? 36 : 44} />
      </View>
      <View style={{ alignItems: right ? 'flex-end' : 'flex-start', flexShrink: 1 }}>
        <View style={[styles.nameRow, right && { flexDirection: 'row-reverse' }]}>
          <Text style={styles.name} numberOfLines={1}>
            {info.name}
          </Text>
          {!info.connected ? <View style={styles.offlineDot} /> : null}
        </View>
        <Text style={styles.meta}>
          {subtitle ?? (info.isBot ? 'AI opponent' : `W${info.wins}  L${info.losses}`)}
          {shipsRemaining !== undefined ? `  ·  ${shipsRemaining} ships` : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  avatarRing: { borderRadius: 30, padding: 2, borderWidth: 2, borderColor: 'transparent' },
  activeRing: { borderColor: colors.radarGreen },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontFamily: fonts.heading, fontSize: 16, color: colors.steel100, letterSpacing: 0.8, maxWidth: 150 },
  meta: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.steel400 },
  offlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.signalRed },
});
