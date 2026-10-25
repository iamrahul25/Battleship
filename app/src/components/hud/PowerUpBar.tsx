import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { CHARGE, canUseWeapon, POWER_UP_IDS, type PlayerPublicInfo, type RuleSet, WEAPONS, weaponMaxUses, weaponUsesLeft } from '@shared/engine';
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

export const WEAPON_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  barrage: 'weather-hail',
  sonar: 'radar',
  torpedo: 'submarine',
  airstrike: 'airplane',
  artillery: 'bomb',
};

const TICKS = [...new Set(POWER_UP_IDS.map((id) => WEAPONS[id].cost))].filter((c) => c < CHARGE.max);

export function PowerUpBar({ rules, me, selected, enabled, onSelect }: Props) {
  const fill = useAnimatedStyle(() => ({ width: withTiming(`${(me.charge / CHARGE.max) * 100}%`, { duration: 400 }) }));
  if (!rules.powerUpsEnabled) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.meterRow}>
        <MaterialCommunityIcons name="lightning-bolt" size={16} color={colors.brass} />
        <View style={styles.meter} accessibilityLabel={`Charge ${me.charge} of ${CHARGE.max}`}>
          <Animated.View style={[styles.meterFill, fill]} />
          {TICKS.map((cost) => (
            <View key={cost} style={[styles.tickMark, { left: `${(cost / CHARGE.max) * 100}%` }]} />
          ))}
        </View>
        <Text style={styles.charge}>{me.charge}</Text>
      </View>
      <View style={styles.buttons}>
        {POWER_UP_IDS.map((id) => {
          const w = WEAPONS[id];
          const ready = canUseWeapon(me, w, rules);
          const active = selected === id;
          const uses = weaponUsesLeft(me, w, rules);
          const maxUses = weaponMaxUses(w, rules);
          const spent = Number.isFinite(uses) && uses === 0;
          const iconColor = active ? colors.navy900 : ready && enabled ? colors.brass : colors.steel600;
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={`${w.name}, costs ${w.cost}${Number.isFinite(uses) ? `, ${uses} left` : ''}`}
              accessibilityState={{ disabled: !ready || !enabled, selected: active }}
              disabled={!ready || !enabled}
              onPress={() => {
                playSound('click');
                haptic('selection');
                onSelect(active ? 'standard' : id);
              }}
              style={[styles.button, ready && enabled && styles.buttonReady, active && styles.buttonActive, spent && styles.buttonSpent]}
            >
              <MaterialCommunityIcons name={WEAPON_ICONS[id]} size={20} color={iconColor} />
              <Text style={[styles.cost, active && { color: colors.navy900 }, !ready && { color: colors.steel600 }]}>{w.cost}</Text>
              {Number.isFinite(uses) && maxUses ? (
                <View style={styles.pips}>
                  {Array.from({ length: maxUses }, (_, i) => (
                    <View key={i} style={[styles.pip, active && styles.pipActiveOff, i < uses && (active ? styles.pipActive : styles.pipOn)]} />
                  ))}
                </View>
              ) : null}
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
  buttons: { flexDirection: 'row', gap: 4 },
  button: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.steel600,
    backgroundColor: colors.navy800,
  },
  buttonReady: { borderColor: colors.brass },
  buttonActive: { backgroundColor: colors.brass, borderColor: '#F0CF6A' },
  buttonSpent: { opacity: 0.45 },
  cost: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.steel200 },
  pips: { flexDirection: 'row', gap: 3, height: 4 },
  pip: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.navy600 },
  pipOn: { backgroundColor: colors.brass },
  pipActive: { backgroundColor: colors.navy900 },
  pipActiveOff: { backgroundColor: 'rgba(10,22,40,0.25)' },
});
