import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import {
  BOARD_SIZE_MAX,
  BOARD_SIZE_MIN,
  BoardSizePresets,
  type GameMode,
  type MatchSettings,
  matchRules,
  type ObstacleLevel,
  totalShipCells,
  totalShips,
} from '@shared/engine';
import { Segmented, Slider } from '@/components/ui/controls';
import { text } from '@/theme';

const PRESET_IDS = Object.keys(BoardSizePresets) as (keyof typeof BoardSizePresets)[];
type SizeChoice = (typeof PRESET_IDS)[number] | 'custom';

const OBSTACLE_LABELS: Record<ObstacleLevel, string> = { none: 'No obstacles', few: 'Few obstacles', many: 'Many obstacles' };

/** One-line description, e.g. "12×12 · Few obstacles". */
export function describeTable(settings: MatchSettings): string {
  return `${settings.boardSize}×${settings.boardSize} · ${OBSTACLE_LABELS[settings.obstacles]}`;
}

interface Props {
  mode: GameMode;
  value: MatchSettings;
  onChange: (next: MatchSettings) => void;
}

/** Board size (presets or custom slider) and obstacle density pickers. */
export function TableSettings({ mode, value, onChange }: Props) {
  const isPreset = PRESET_IDS.some((id) => BoardSizePresets[id] === value.boardSize);
  const [customSize, setCustomSize] = useState(!isPreset);
  const sizeChoice: SizeChoice = customSize ? 'custom' : (PRESET_IDS.find((id) => BoardSizePresets[id] === value.boardSize) ?? 'custom');
  const rules = matchRules(mode, value);

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
      <Text style={styles.caption}>
        {totalShips(rules)} ships · {totalShipCells(rules)} ship cells on a {value.boardSize}×{value.boardSize} grid
      </Text>

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
      <Text style={styles.caption}>Rocks and islands can&apos;t be shot · reefs are visible · hidden mines make the shooter skip a turn</Text>
    </>
  );
}

const styles = StyleSheet.create({
  section: { ...text.label, marginTop: 18, marginBottom: 8 },
  caption: { ...text.caption, marginTop: 6 },
});
