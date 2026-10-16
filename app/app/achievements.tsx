import { StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { BadgeIcon } from '@/components/ui/BadgeIcon';
import { Screen } from '@/components/ui/Screen';
import { ACHIEVEMENTS } from '@/game/progression';
import { useAchievementsStore } from '@/stores/achievements';
import { selectStats, useStatsStore } from '@/stores/stats';
import { colors, fonts, text } from '@/theme';

export default function Achievements() {
  const unlocked = useAchievementsStore((s) => s.unlocked);
  const stats = useStatsStore(useShallow(selectStats));
  const count = Object.keys(unlocked).length;

  return (
    <Screen title="Medals" back scroll>
      <Text style={[text.caption, styles.summary]}>
        {count} of {ACHIEVEMENTS.length} earned
      </Text>
      <View style={styles.grid}>
        {ACHIEVEMENTS.map((a) => {
          const at = unlocked[a.id];
          const prog = !at && a.progress ? a.progress(stats) : null;
          return (
            <View key={a.id} style={[styles.card, at ? styles.cardOn : null]} accessibilityLabel={`${a.name}: ${a.description}${at ? ', earned' : ', locked'}`}>
              <BadgeIcon id={a.id} size={64} unlocked={!!at} />
              <Text style={[styles.name, !at && { color: colors.steel400 }]} numberOfLines={1}>
                {a.name}
              </Text>
              <Text style={styles.desc}>{a.description}</Text>
              {at ? (
                <Text style={styles.date}>{new Date(at).toLocaleDateString()}</Text>
              ) : prog && prog[1] > 1 ? (
                <View style={styles.progressWrap}>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${(prog[0] / prog[1]) * 100}%` }]} />
                  </View>
                  <Text style={styles.progressText}>
                    {prog[0]}/{prog[1]}
                  </Text>
                </View>
              ) : (
                <Text style={styles.date}>Locked</Text>
              )}
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { textAlign: 'center', marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  card: {
    width: '47%',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.steel600,
    backgroundColor: colors.panel,
  },
  cardOn: { borderColor: colors.brassDark },
  name: { fontFamily: fonts.heading, fontSize: 14, color: colors.steel100, marginTop: 6, letterSpacing: 0.5 },
  desc: { fontFamily: fonts.body, fontSize: 13, color: colors.steel200, textAlign: 'center', marginTop: 2, minHeight: 34 },
  date: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.steel400, marginTop: 6 },
  progressWrap: { width: '100%', marginTop: 6, alignItems: 'center' },
  track: { width: '100%', height: 6, borderRadius: 3, backgroundColor: colors.navy800, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.brass },
  progressText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.steel400, marginTop: 2 },
});
