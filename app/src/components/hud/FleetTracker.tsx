import { StyleSheet, Text, View } from 'react-native';
import type { RuleSet } from '@shared/engine';
import { drawShipIcon } from '@/art/ships';
import { SkiaIcon } from '@/art/SkiaIcon';
import { colors, text } from '@/theme';

/** Enemy fleet silhouettes; sunk ships crossed out in red. */
export function FleetTracker({ rules, lost, label, unit = 9 }: { rules: RuleSet; lost: string[]; label?: string; unit?: number }) {
  const remainingLost = [...lost];
  const items = rules.fleet.flatMap((def) =>
    Array.from({ length: def.count }, (_, i) => {
      const idx = remainingLost.indexOf(def.id);
      const sunk = idx !== -1;
      if (sunk) remainingLost.splice(idx, 1);
      return { key: `${def.id}#${i}`, defId: def.id, len: def.cells.length, sunk };
    }),
  );
  return (
    <View style={styles.wrap} accessibilityLabel={`${items.filter((i) => !i.sunk).length} enemy ships remaining`}>
      {label ? <Text style={[text.label, { marginRight: 6 }]}>{label}</Text> : null}
      {items.map((it) => (
        <View key={it.key} style={{ opacity: it.sunk ? 0.75 : 1 }}>
          <SkiaIcon
            cacheKey={`fleet:${it.defId}:${it.len}:${unit}:${it.sunk ? 1 : 0}`}
            width={it.len * unit}
            height={unit}
            draw={(c) => drawShipIcon(c, it.defId, it.len, unit, { silhouette: true, sunk: it.sunk })}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, minHeight: 16 },
});

export const trackerColors = colors;
