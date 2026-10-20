import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BOARD_SIZE_MAX,
  BOARD_SIZE_MIN,
  boardRules,
  BoardSizePresets,
  BOT_PROFILES,
  clampBoardSize,
  createRules,
  type Difficulty,
  type GameMode,
  totalShipCells,
  totalShips,
} from '@shared/engine';
import { playSound } from '@/audio/SoundManager';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Segmented, Slider, Toggle } from '@/components/ui/controls';
import { Panel } from '@/components/ui/Panel';
import { Screen } from '@/components/ui/Screen';
import { LocalGameController } from '@/game/controllers/LocalGameController';
import { clearSavedGame } from '@/game/savedGame';
import { haptic } from '@/platform/haptics';
import { useMatchStore } from '@/stores/match';
import { useProfileStore } from '@/stores/profile';
import { useSettingsStore } from '@/stores/settings';
import { useStatsStore } from '@/stores/stats';
import { colors, fonts, text } from '@/theme';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const STARS: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };
const PRESET_IDS = Object.keys(BoardSizePresets) as (keyof typeof BoardSizePresets)[];
type SizeChoice = (typeof PRESET_IDS)[number] | 'custom';

export default function BotSetup() {
  const settings = useSettingsStore();
  const profile = useProfileStore();
  const botStats = useStatsStore((s) => s.bot);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [mode, setMode] = useState<GameMode>(settings.defaultMode);
  const [bonus, setBonus] = useState(settings.bonusShotOnHit);
  const [touching, setTouching] = useState(settings.allowTouching);
  const [boardSize, setBoardSize] = useState(clampBoardSize(settings.boardSize));
  const [customSize, setCustomSize] = useState(!PRESET_IDS.some((id) => BoardSizePresets[id] === settings.boardSize));
  const sizeChoice: SizeChoice = customSize ? 'custom' : (PRESET_IDS.find((id) => BoardSizePresets[id] === boardSize) ?? 'custom');
  const sizeRules = createRules(boardRules(boardSize));

  const chooseSize = (choice: SizeChoice) => {
    setCustomSize(choice === 'custom');
    if (choice !== 'custom') setBoardSize(BoardSizePresets[choice]);
  };

  const start = () => {
    void clearSavedGame();
    settings.set({ boardSize });
    const controller = new LocalGameController({
      difficulty,
      mode,
      bonusShotOnHit: bonus,
      allowTouching: touching,
      offlineTimer: settings.offlineTimer,
      boardSize,
      me: { name: profile.nickname || 'You', avatarId: profile.avatarId, wins: 0, losses: 0, connected: true },
    });
    useMatchStore.getState().attach(controller);
    router.push('/placement');
  };

  return (
    <Screen title="Play vs Bot" back scroll>
      <Text style={styles.section}>OPPONENT</Text>
      <View style={{ gap: 10 }}>
        {DIFFICULTIES.map((d) => {
          const p = BOT_PROFILES[d];
          const active = d === difficulty;
          const rec = botStats[d];
          return (
            <Pressable
              key={d}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${p.name}, ${p.title}`}
              onPress={() => {
                playSound('click');
                haptic('selection');
                setDifficulty(d);
              }}
              style={[styles.card, active && styles.cardActive]}
            >
              <Avatar id={p.avatarId} size={56} />
              <View style={{ flex: 1 }}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardName}>{p.name.toUpperCase()}</Text>
                  <Text style={styles.stars}>{'★'.repeat(STARS[d])}{'☆'.repeat(3 - STARS[d])}</Text>
                </View>
                <Text style={styles.cardDesc}>{p.description}</Text>
                <Text style={styles.cardRecord}>
                  Record: {rec.won}W – {rec.lost}L
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.section}>MODE</Text>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'classic', label: 'CLASSIC', hint: 'Pure cannon fire' },
          { value: 'arsenal', label: 'ARSENAL', hint: 'Artillery & sonar' },
        ]}
      />

      <Text style={styles.section}>BOARD</Text>
      <Segmented
        value={sizeChoice}
        onChange={chooseSize}
        options={[
          ...PRESET_IDS.map((id) => ({ value: id, label: id.toUpperCase(), hint: `${BoardSizePresets[id]}×${BoardSizePresets[id]}` })),
          { value: 'custom' as const, label: 'CUSTOM', hint: `${BOARD_SIZE_MIN}–${BOARD_SIZE_MAX}` },
        ]}
      />
      {customSize && (
        <Slider
          label="Board size"
          value={boardSize}
          onChange={setBoardSize}
          min={BOARD_SIZE_MIN}
          max={BOARD_SIZE_MAX}
          step={1}
          format={(v) => `${v}×${v}`}
        />
      )}
      <Text style={[text.caption, { marginTop: 6 }]}>
        {totalShips(sizeRules)} ships · {totalShipCells(sizeRules)} ship cells on a {boardSize}×{boardSize} grid
      </Text>

      <Panel title="Rules" style={{ marginTop: 16 }}>
        <Toggle label="Bonus shot on hit" hint="Keep firing after every hit" value={bonus} onChange={setBonus} />
        <Toggle label="Ships may touch" hint="Allow ships to be placed adjacent" value={touching} onChange={setTouching} />
        <Text style={[text.caption, { marginTop: 4 }]}>
          Turn timer: {settings.offlineTimer ? '30 s (change in Settings)' : 'off (change in Settings)'}
        </Text>
      </Panel>

      <Button title="Deploy fleet" size="lg" onPress={start} style={{ marginTop: 20 }} testID="start-bot" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { ...text.label, marginTop: 18, marginBottom: 8 },
  card: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.steel600,
    backgroundColor: colors.panel,
  },
  cardActive: { borderColor: colors.brass, backgroundColor: 'rgba(212,169,58,0.12)' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontFamily: fonts.heading, fontSize: 18, color: colors.steel100, letterSpacing: 1 },
  stars: { color: colors.brass, fontSize: 16 },
  cardDesc: { fontFamily: fonts.body, fontSize: 14, color: colors.steel200, marginTop: 2 },
  cardRecord: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.steel400, marginTop: 4 },
});
