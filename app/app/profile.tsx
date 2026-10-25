import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { NAME_MAX, sanitizeName } from '@shared/protocol';
import { playSound } from '@/audio/SoundManager';
import { Avatar } from '@/components/ui/Avatar';
import { AvatarPicker } from '@/components/ui/AvatarPicker';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Screen } from '@/components/ui/Screen';
import { accuracy, type WinLoss, rankFor, RANKS } from '@/game/progression';
import { useAchievementsStore } from '@/stores/achievements';
import { useProfileStore } from '@/stores/profile';
import { selectStats, useStatsStore } from '@/stores/stats';
import { toast } from '@/stores/ui';
import { useShallow } from 'zustand/react/shallow';
import { colors, fonts, text } from '@/theme';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const winsLabel = (n: number) => `${n} ${n === 1 ? 'win' : 'wins'}`;

const wl = (r: WinLoss) => `${r.won}W – ${r.lost}L${r.played ? `  (${Math.round((r.won / r.played) * 100)}%)` : ''}`;

export default function Profile() {
  const profile = useProfileStore();
  const stats = useStatsStore(useShallow(selectStats));
  const unlocked = useAchievementsStore((s) => Object.keys(s.unlocked).length);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.nickname);
  const [avatar, setAvatar] = useState(profile.avatarId);
  const [ranksOpen, setRanksOpen] = useState(false);
  const rank = rankFor(stats.total.won);
  const progress = rank.next ? (stats.total.won - RANKS[rank.index].wins) / (rank.next.wins - RANKS[rank.index].wins) : 1;

  const save = () => {
    const clean = sanitizeName(name);
    if (!clean) return toast('Invalid call sign', 'Use 3–16 characters.', 'error');
    profile.setProfile({ nickname: clean, avatarId: avatar });
    setEditing(false);
    toast('Profile saved', undefined, 'success');
  };

  return (
    <Screen title="Profile" back scroll>
      <Panel accent="brass" style={styles.hero}>
        <Avatar id={editing ? avatar : profile.avatarId} size={96} />
        {editing ? (
          <TextInput value={name} onChangeText={setName} maxLength={NAME_MAX} style={styles.input} autoCorrect={false} accessibilityLabel="Nickname" />
        ) : (
          <Text style={styles.name}>{profile.nickname || 'Sailor'}</Text>
        )}
        <Text style={styles.rank}>{rank.title.toUpperCase()}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(1, progress) * 100}%` }]} />
        </View>
        <Text style={text.caption}>{rank.next ? `${winsLabel(rank.next.wins - stats.total.won)} to ${rank.next.title}` : 'Highest rank achieved'}</Text>
        {editing ? (
          <View style={{ width: '100%', marginTop: 12, gap: 10 }}>
            <AvatarPicker value={avatar} onChange={setAvatar} size={50} />
            <Button title="Save" variant="brass" onPress={save} />
            <Button title="Cancel" variant="ghost" onPress={() => setEditing(false)} />
          </View>
        ) : (
          <Button title="Edit profile" variant="secondary" size="sm" onPress={() => setEditing(true)} style={{ marginTop: 12, alignSelf: 'stretch' }} />
        )}
      </Panel>

      <Panel style={styles.panel}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: ranksOpen }}
          accessibilityLabel={`Ranks. ${ranksOpen ? 'Tap to collapse' : 'Tap to see all ranks'}`}
          onPress={() => {
            playSound('click');
            setRanksOpen((o) => !o);
          }}
          hitSlop={8}
          style={styles.ranksHeader}
          testID="ranks-toggle"
        >
          <Text style={styles.ranksTitle}>RANKS</Text>
          <Text style={styles.ranksHint}>{ranksOpen ? 'Hide' : `View all ${RANKS.length}`}</Text>
          <MaterialCommunityIcons name={ranksOpen ? 'chevron-up' : 'chevron-down'} size={22} color={colors.steel200} />
        </Pressable>
        {ranksOpen ? <Text style={[text.caption, { marginTop: 8, marginBottom: 6 }]}>Win battles (online or vs bots) to climb the ranks.</Text> : null}
        {ranksOpen && RANKS.map((r, i) => {
          const current = i === rank.index;
          const reached = i <= rank.index;
          return (
            <View key={r.title} style={[styles.rankRow, current && styles.rankRowCurrent]}>
              <MaterialCommunityIcons
                name={current ? 'star' : reached ? 'check-circle' : 'lock'}
                size={18}
                color={current ? colors.brass : reached ? colors.radarGreen : colors.steel600}
              />
              <Text style={[styles.rankTitle, current && { color: colors.brass }, !reached && { color: colors.steel400 }]}>{r.title}</Text>
              <Text style={[styles.rankWins, !reached && { color: colors.steel400 }]}>{r.wins === 0 ? 'Start' : winsLabel(r.wins)}</Text>
            </View>
          );
        })}
      </Panel>

      <Panel title="Service record" style={styles.panel}>
        <Row label="Total" value={wl(stats.total)} />
        <Row label="Online" value={wl(stats.online)} />
        <Row label="vs Cadet (Easy)" value={wl(stats.bot.easy)} />
        <Row label="vs Captain (Medium)" value={wl(stats.bot.medium)} />
        <Row label="vs Admiral (Hard)" value={wl(stats.bot.hard)} />
      </Panel>

      <Panel title="Gunnery" style={styles.panel}>
        <Row label="Shots fired" value={String(stats.shots)} />
        <Row label="Hits" value={String(stats.hits)} />
        <Row label="Accuracy" value={`${Math.round(accuracy(stats.shots, stats.hits) * 100)}%`} />
        <Row label="Ships sunk" value={String(stats.shipsSunk)} />
        <Row label="Power-ups used" value={String(stats.powerUpsUsed)} />
      </Panel>

      <Panel title="Records" style={styles.panel}>
        <Row label="Current win streak" value={String(stats.currentStreak)} />
        <Row label="Best win streak" value={String(stats.bestStreak)} />
        <Row label="Fewest shots to win" value={stats.fastestWinShots === null ? '–' : String(stats.fastestWinShots)} />
        <Row
          label="Fastest win"
          value={stats.fastestWinMs === null ? '–' : `${Math.floor(stats.fastestWinMs / 60000)}:${String(Math.round((stats.fastestWinMs % 60000) / 1000)).padStart(2, '0')}`}
        />
      </Panel>

      <Button title={`Medals (${unlocked}/12)`} variant="brass" onPress={() => router.push('/achievements')} style={{ marginTop: 14 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 6 },
  name: { fontFamily: fonts.heading, fontSize: 26, color: colors.steel100, marginTop: 6 },
  rank: { ...text.label, color: colors.brass, fontSize: 13 },
  input: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.steel100,
    textAlign: 'center',
    borderBottomWidth: 2,
    borderColor: colors.brass,
    minWidth: 200,
    paddingVertical: 4,
    marginTop: 6,
  },
  progressTrack: { width: '80%', height: 8, borderRadius: 4, backgroundColor: colors.navy800, overflow: 'hidden', marginTop: 6 },
  progressFill: { height: '100%', backgroundColor: colors.brass },
  panel: { marginTop: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.steel600 },
  rowLabel: { ...text.body, color: colors.steel200 },
  rowValue: { ...text.bodyBold },
  ranksHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ranksTitle: { ...text.label, flex: 1 },
  ranksHint: { ...text.caption, color: colors.steel200 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 8 },
  rankRowCurrent: { backgroundColor: 'rgba(212,169,58,0.12)' },
  rankTitle: { ...text.bodyBold, flex: 1 },
  rankWins: { ...text.body, color: colors.steel200 },
});
