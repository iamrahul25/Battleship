import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, Text } from 'react-native';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Segmented, Slider, Toggle } from '@/components/ui/controls';
import { Panel } from '@/components/ui/Panel';
import { Screen } from '@/components/ui/Screen';
import { ADVANCE } from '@/game/modes';
import { clearSavedGame } from '@/game/savedGame';
import { getServerUrl } from '@/net/serverUrl';
import { storageNamespace } from '@/platform/storage';
import { useAchievementsStore } from '@/stores/achievements';
import { useProfileStore } from '@/stores/profile';
import { useSettingsStore } from '@/stores/settings';
import { useStatsStore } from '@/stores/stats';
import { toast } from '@/stores/ui';
import { colors, text } from '@/theme';

export default function Settings() {
  const s = useSettingsStore();
  const [confirmReset, setConfirmReset] = useState(false);

  const resetAll = async () => {
    useStatsStore.getState().reset();
    useAchievementsStore.getState().reset();
    useSettingsStore.getState().reset();
    useProfileStore.getState().reset();
    await clearSavedGame();
    setConfirmReset(false);
    toast('All data erased', undefined, 'success');
    router.replace('/onboarding');
  };

  return (
    <Screen title="Settings" back scroll>
      <Panel title="Audio">
        <Slider label="Sound effects" value={s.soundVolume} onChange={(v) => s.set({ soundVolume: v })} />
        <Slider label="Music" value={s.musicVolume} onChange={(v) => s.set({ musicVolume: v })} />
        <Toggle label="Haptics" hint="Vibration on hits and taps (Android)" value={s.haptics} onChange={(v) => s.set({ haptics: v })} />
      </Panel>

      <Panel title="Gameplay" style={styles.panel}>
        <Toggle label="Turn timer vs bots" hint="30 seconds per turn in offline games" value={s.offlineTimer} onChange={(v) => s.set({ offlineTimer: v })} />
        <Toggle label="Bonus shot on hit" hint="Default rule for bot games" value={s.bonusShotOnHit} onChange={(v) => s.set({ bonusShotOnHit: v })} />
        <Toggle label="Ships may touch" hint="Default rule for bot games" value={s.allowTouching} onChange={(v) => s.set({ allowTouching: v })} />
        <Text style={[text.bodyBold, { marginTop: 8, marginBottom: 8 }]}>Default mode</Text>
        <Segmented
          value={s.defaultMode}
          onChange={(v) => s.set({ defaultMode: v })}
          options={[
            { value: 'classic', label: 'CLASSIC' },
            { value: 'advance', label: ADVANCE.toUpperCase() },
          ]}
        />
      </Panel>

      <Panel title="Accessibility" style={styles.panel}>
        <Toggle label="Reduced motion" hint="Disables screen shake, particles and water animation" value={s.reducedMotion} onChange={(v) => s.set({ reducedMotion: v })} />
      </Panel>

      <Panel title="Data" style={styles.panel}>
        <Button title="Reset all data" variant="danger" onPress={() => setConfirmReset(true)} />
      </Panel>

      <Panel title="About" style={styles.panel}>
        <Text style={styles.about}>Battleship v1.0.0</Text>
        <Text style={styles.about}>Server: {getServerUrl()}</Text>
        {storageNamespace ? <Text style={styles.about}>Dev profile: {storageNamespace}</Text> : null}
        <Text style={[styles.about, { marginTop: 8 }]}>
          Fonts: Black Ops One and Rajdhani (SIL Open Font License). Icons: Ionicons and Material Community Icons (MIT). Ship art, avatars, medals and sounds are
          generated procedurally by this project.
        </Text>
        <Text style={[styles.link]} onPress={() => Linking.openURL('https://openfontlicense.org')}>
          Open Font License
        </Text>
      </Panel>

      <ConfirmDialog
        visible={confirmReset}
        title="Erase everything?"
        message="Profile, stats, medals and settings will be permanently deleted."
        confirmLabel="Erase"
        destructive
        onCancel={() => setConfirmReset(false)}
        onConfirm={resetAll}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: 14 },
  about: { ...text.caption, color: colors.steel200, lineHeight: 18 },
  link: { ...text.caption, color: colors.ocean300, marginTop: 6 },
});
