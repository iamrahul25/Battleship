import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BOARD_SIZE_MAX,
  BOARD_SIZE_MIN,
  BoardSizePresets,
  createRng,
  type GameMode,
  generateObstacles,
  type MatchSettings,
  matchRules,
  OBSTACLE_KINDS,
  obstacleCounts,
  type ObstacleKind,
  type ObstacleLevel,
  type PlacedShip,
  randomFleet,
  randomSeed,
  type RuleSet,
  totalShipCells,
  totalShips,
} from '@shared/engine';
import { drawObstacleIcon } from '@/art/obstacles';
import { SkiaIcon } from '@/art/SkiaIcon';
import { playSound } from '@/audio/SoundManager';
import { BattleGrid } from '@/components/grid/BattleGrid';
import { Segmented, Slider } from '@/components/ui/controls';
import { useSettingsStore } from '@/stores/settings';
import { colors, fonts, radii, text } from '@/theme';

const PRESET_IDS = Object.keys(BoardSizePresets) as (keyof typeof BoardSizePresets)[];
type SizeChoice = (typeof PRESET_IDS)[number] | 'custom';

const OBSTACLE_LABELS: Record<ObstacleLevel, string> = { none: 'No obstacles', few: 'Few obstacles', many: 'Many obstacles' };

const OBSTACLE_INFO: Record<ObstacleKind, { name: string; note: string }> = {
  rock: { name: 'Rock', note: "can't be shot" },
  island: { name: 'Island', note: '2–3 cells of land' },
  reef: { name: 'Reef', note: 'shots on it miss' },
  mine: { name: 'Mine', note: 'hidden, skip a turn' },
};

const PREVIEW_MAX = 320;

/** One-line description, e.g. "12×12 · Few obstacles". */
export function describeTable(settings: MatchSettings): string {
  return `${settings.boardSize}×${settings.boardSize} · ${OBSTACLE_LABELS[settings.obstacles]}`;
}

/** A sample board for the chosen table: a random fleet placed around random obstacles. */
function BoardPreview({ rules }: { rules: RuleSet }) {
  const [seed, setSeed] = useState(randomSeed);
  const [width, setWidth] = useState(0);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);

  const board = useMemo(() => {
    const rng = createRng(seed);
    const obstacles = generateObstacles(rules, rng);
    let ships: PlacedShip[] = [];
    try {
      ships = randomFleet(rules, rng, { obstacles });
    } catch {
      // Crowded boards can fail a random layout; the grid and obstacles still preview fine.
    }
    return { width: rules.grid.width, height: rules.grid.height, shots: {}, ships, obstacles };
  }, [rules, seed]);

  return (
    <View style={styles.preview} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} testID="board-preview">
      {width > 0 ? (
        <BattleGrid size={Math.min(width, PREVIEW_MAX)} board={board} kind="own" reducedMotion={reducedMotion} />
      ) : null}
      <View style={styles.previewFoot}>
        <Text style={[styles.caption, { flex: 1, marginTop: 0 }]}>Sample layout. You place your own fleet before battle.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Shuffle sample layout"
          hitSlop={8}
          onPress={() => {
            playSound('click');
            setSeed(randomSeed());
          }}
          style={styles.shuffle}
          testID="preview-shuffle"
        >
          <MaterialCommunityIcons name="dice-multiple" size={16} color={colors.steel100} />
          <Text style={styles.shuffleText}>SHUFFLE</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ObstacleCounts({ rules }: { rules: RuleSet }) {
  const counts = obstacleCounts(rules);
  const total = OBSTACLE_KINDS.reduce((sum, k) => sum + counts[k], 0);
  if (!total) return <Text style={styles.caption}>Open sea: no obstacles on either board.</Text>;
  return (
    <>
      <View style={styles.counts} testID="obstacle-counts">
        {OBSTACLE_KINDS.map((kind) => (
          <View key={kind} style={styles.count}>
            <SkiaIcon cacheKey={`setup:obstacle:${kind}`} width={26} height={26} draw={(c) => drawObstacleIcon(c, kind, 26)} />
            <Text style={styles.countNum}>×{counts[kind]}</Text>
            <Text style={styles.countName}>{OBSTACLE_INFO[kind].name}</Text>
            <Text style={styles.countNote}>{OBSTACLE_INFO[kind].note}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.caption}>
        {total} obstacles on each board. Ships can&apos;t be placed on them.
      </Text>
    </>
  );
}

interface Props {
  mode: GameMode;
  value: MatchSettings;
  onChange: (next: MatchSettings) => void;
}

/** Board size (presets or custom slider) and obstacle density pickers, with a live preview of each. */
export function TableSettings({ mode, value, onChange }: Props) {
  const isPreset = PRESET_IDS.some((id) => BoardSizePresets[id] === value.boardSize);
  const [customSize, setCustomSize] = useState(!isPreset);
  const sizeChoice: SizeChoice = customSize ? 'custom' : (PRESET_IDS.find((id) => BoardSizePresets[id] === value.boardSize) ?? 'custom');
  const rules = useMemo(() => matchRules(mode, { boardSize: value.boardSize, obstacles: value.obstacles }), [mode, value.boardSize, value.obstacles]);

  const chooseSize = (choice: SizeChoice) => {
    setCustomSize(choice === 'custom');
    if (choice !== 'custom') onChange({ ...value, boardSize: BoardSizePresets[choice] });
  };

  return (
    <>
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
          value={value.boardSize}
          onChange={(boardSize) => onChange({ ...value, boardSize })}
          min={BOARD_SIZE_MIN}
          max={BOARD_SIZE_MAX}
          step={1}
          format={(v) => `${v}×${v}`}
        />
      )}
      <View style={styles.stats} testID="board-stats">
        {[
          { value: String(totalShips(rules)), label: 'SHIPS' },
          { value: String(totalShipCells(rules)), label: 'SHIP CELLS' },
          { value: `${value.boardSize}×${value.boardSize}`, label: 'GRID' },
        ].map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>
      <BoardPreview rules={rules} />

      <Text style={styles.section}>OBSTACLES</Text>
      <Segmented
        value={value.obstacles}
        onChange={(obstacles) => onChange({ ...value, obstacles })}
        options={[
          { value: 'none', label: 'NONE', hint: 'Open sea' },
          { value: 'few', label: 'FEW', hint: 'A scattering' },
          { value: 'many', label: 'MANY', hint: 'Crowded waters' },
        ]}
      />
      <ObstacleCounts rules={rules} />
    </>
  );
}

const styles = StyleSheet.create({
  section: { ...text.label, marginTop: 18, marginBottom: 8 },
  caption: { ...text.caption, marginTop: 6 },
  stats: { flexDirection: 'row', gap: 6, marginTop: 10 },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 5,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.brassDark,
    backgroundColor: 'rgba(212,169,58,0.12)',
  },
  statValue: { fontFamily: fonts.heading, fontSize: 16, color: colors.brass },
  statLabel: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.steel200, letterSpacing: 1 },
  preview: { marginTop: 10, alignItems: 'center' },
  previewFoot: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, alignSelf: 'stretch' },
  shuffle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.steel600,
  },
  shuffleText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.steel100, letterSpacing: 1 },
  counts: { flexDirection: 'row', gap: 6, marginTop: 10 },
  count: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 8, paddingHorizontal: 4, borderRadius: radii.sm, backgroundColor: colors.navy800 },
  countNum: { fontFamily: fonts.heading, fontSize: 18, color: colors.steel100 },
  countName: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.steel100 },
  countNote: { fontFamily: fonts.body, fontSize: 10, color: colors.steel400, textAlign: 'center' },
});
