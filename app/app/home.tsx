import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playSound, SoundManager } from '@/audio/SoundManager';
import { Logo } from '@/components/art/Logo';
import { SeaBackground } from '@/components/art/Scenes';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { LocalGameController, type SavedLocalGame } from '@/game/controllers/LocalGameController';
import { rankFor } from '@/game/progression';
import { clearSavedGame, loadSavedGame } from '@/game/savedGame';
import { useMatchStore } from '@/stores/match';
import { useProfileStore } from '@/stores/profile';
import { useSettingsStore } from '@/stores/settings';
import { useStatsStore } from '@/stores/stats';
import { colors, fonts, text } from '@/theme';

function NavTile({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        playSound('click');
        onPress();
      }}
      style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.96 }] }]}
    >
      <Ionicons name={icon} size={22} color={colors.steel100} />
      <Text style={styles.tileLabel}>{label}</Text>
    </Pressable>
  );
}

export default function Home() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { nickname, avatarId } = useProfileStore();
  const wins = useStatsStore((s) => s.total.won);
  const reduced = useSettingsStore((s) => s.reducedMotion);
  const [saved, setSaved] = useState<SavedLocalGame | null>(null);

  useFocusEffect(
    useCallback(() => {
      SoundManager.playMusic('menu');
      useMatchStore.getState().detach();
      loadSavedGame().then(setSaved);
    }, []),
  );

  const resume = () => {
    if (!saved) return;
    const controller = LocalGameController.fromSave(saved);
    useMatchStore.getState().attach(controller);
    router.push('/battle');
  };

  return (
    <View style={styles.root}>
      <SeaBackground width={width} height={height} animate={!reduced} />
      <View style={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <Pressable style={styles.profileChip} onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Profile">
          <Avatar id={avatarId} size={40} />
          <View>
            <Text style={styles.chipName}>{nickname || 'Sailor'}</Text>
            <Text style={styles.chipRank}>{rankFor(wins).title.toUpperCase()}</Text>
          </View>
        </Pressable>

        <View style={styles.logo}>
          <Logo size={Math.min(50, width / 8)} animate={!reduced} />
        </View>

        <View style={styles.menu}>
          {saved && (
            <View style={styles.resumeRow}>
              <Button
                title="Resume battle"
                subtitle={`vs ${saved.options.difficulty === 'easy' ? 'Cadet' : saved.options.difficulty === 'medium' ? 'Captain' : 'Admiral'}`}
                variant="brass"
                onPress={resume}
                style={{ flex: 1 }}
                icon={<MaterialCommunityIcons name="play-circle" size={26} color="#1A1406" />}
              />
              <Pressable
                accessibilityLabel="Discard saved battle"
                onPress={() => {
                  playSound('click');
                  clearSavedGame().then(() => setSaved(null));
                }}
                style={styles.discard}
              >
                <Ionicons name="trash-outline" size={20} color={colors.steel400} />
              </Pressable>
            </View>
          )}
          <Button
            title="Play vs Bot"
            size="lg"
            onPress={() => router.push('/bot-setup')}
            icon={<MaterialCommunityIcons name="robot" size={26} color="#FFF4F2" />}
            testID="play-bot"
          />
          <Button
            title="Play Online"
            size="lg"
            variant="secondary"
            onPress={() => router.push('/online')}
            icon={<MaterialCommunityIcons name="earth" size={26} color={colors.steel100} />}
          />
          <Button
            title="Private Room"
            variant="secondary"
            onPress={() => router.push({ pathname: '/online', params: { tab: 'private' } })}
            icon={<MaterialCommunityIcons name="key-variant" size={22} color={colors.steel100} />}
          />
          <View style={styles.tiles}>
            <NavTile icon="person" label="Profile" onPress={() => router.push('/profile')} />
            <NavTile icon="medal" label="Medals" onPress={() => router.push('/achievements')} />
            <NavTile icon="settings-sharp" label="Settings" onPress={() => router.push('/settings')} />
            <NavTile icon="help-buoy" label="How to Play" onPress={() => router.push('/how-to-play')} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.navy900 },
  content: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 20 },
  profileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(10,22,40,0.7)',
    borderRadius: 30,
    paddingRight: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.steel600,
  },
  chipName: { fontFamily: fonts.heading, color: colors.steel100, fontSize: 15 },
  chipRank: { ...text.label, fontSize: 10, color: colors.brass },
  logo: { flex: 1, justifyContent: 'center', minHeight: 120 },
  menu: { gap: 12 },
  resumeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  discard: { padding: 12 },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 6 },
  tile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(10,22,40,0.75)',
    borderWidth: 1,
    borderColor: colors.steel600,
  },
  tileLabel: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.steel200, textAlign: 'center' },
});
