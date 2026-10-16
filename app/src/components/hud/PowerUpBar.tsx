import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { CHARGE, canUseWeapon, POWER_UP_IDS, type PlayerPublicInfo, type RuleSet, WEAPONS, weaponUsesLeft } from '@shared/engine';
import { playSound } from '@/audio/SoundManager';
import { haptic } from '@/platform/haptics';
import { colors, fonts, radii } from '@/theme';

interface Props {
  rules: RuleSet;
  me: PlayerPublicInfo;
  selected: string;
  enabled: boolean;
  onSelect: (id: string) => void;
}

const ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  artillery: 'bomb',
  sonar: 'radar',
};

export function PowerUpBar({ rules, me, selected, enabled, onSelect }: Props) {
  const fill = useAnimatedStyle(() => ({ width: withTiming(`${(me.charge / CHARGE.max) * 100}%`, { duration: 400 }) }));
  if (!rules.powerUpsEnabled) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.meterRow}>
        <MaterialCommunityIcons name="lightning-bolt" size={16} color={colors.brass} />
        <View style={styles.meter} accessibilityLabel={`Charge ${me.charge} of ${CHARGE.max}`}>
          <Animated.View style={[styles.meterFill, fill]} />
          {POWER_UP_IDS.map((id) => (
            <View key={id} style={[styles.tickMark, { left: `${(WEAPONS[id].cost / CHARGE.max) * 100}%` }]} />
          ))}
        </View>
        <Text style={styles.charge}>{me.charge}</Text>
      </View>
      <View style={styles.buttons}>
        {POWER_UP_IDS.map((id) => {
          const w = WEAPONS[id];
          const ready = canUseWeapon(me, w, rules);
          const active = selected === id;
          const uses = weaponUsesLeft(me, w);
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={`${w.name}, costs ${w.cost}`}
              accessibilityState={{ disabled: !ready || !enabled, selected: active }}
              disabled={!ready || !enabled}
              onPress={() => {
                playSound('click');
                haptic('selection');
                onSelect(active ? 'standard' : id);
              }}
              style={[styles.button, ready && enabled && styles.buttonReady, active && styles.buttonActive]}
            >
              <MaterialCommunityIcons name={ICONS[id]} size={20} color={active ? colors.navy900 : ready ? colors.brass : colors.steel600} />
              <View>
                <Text style={[styles.btnTitle, active && { color: colors.navy900 }, !ready && { color: colors.steel600 }]}>
                  {id === 'artillery' ? 'ARTILLERY' : 'SONAR'}
                </Text>
                <Text style={[styles.btnSub, active && { color: colors.navy800 }]}>
                  {w.cost}⚡{Number.isFinite(uses) ? ` · ${uses} left` : ''}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, flex: 1 },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meter: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.navy800, borderWidth: 1, borderColor: colors.steel600, overflow: 'hidden' },
  meterFill: { height: '100%', backgroundColor: colors.brass },
  tickMark: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.navy900 },
  charge: { fontFamily: fonts.bodyBold, color: colors.brass, fontSize: 13, width: 28, textAlign: 'right' },
  buttons: { flexDirection: 'row', gap: 8 },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.steel600,
    backgroundColor: colors.navy800,
  },
  buttonReady: { borderColor: colors.brass },
  buttonActive: { backgroundColor: colors.brass, borderColor: '#F0CF6A' },
  btnTitle: { fontFamily: fonts.heading, fontSize: 12, color: colors.steel100, letterSpacing: 0.8 },
  btnSub: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.steel400 },
});
