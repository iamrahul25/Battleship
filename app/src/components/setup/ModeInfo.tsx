import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { CHARGE, fleetForSize, type GameMode, POWER_UP_IDS, WEAPONS } from '@shared/engine';
import { drawShipShape, shipIconSize } from '@/art/ships';
import { SkiaIcon } from '@/art/SkiaIcon';
import { WEAPON_ICONS } from '@/components/hud/PowerUpBar';
import { colors, fonts, radii, text } from '@/theme';

const CELL = 14;

/** The fleet and weapons a mode plays with on an n×n board. */
export function ModeInfo({ mode, boardSize }: { mode: GameMode; boardSize: number }) {
  const fleet = fleetForSize(boardSize, mode);
  const advance = mode === 'advance';
  const tint = advance ? colors.brass : colors.radarGreen;

  return (
    <View style={[styles.card, { borderColor: tint }]} testID="mode-info">
      <Text style={[styles.heading, { color: tint }]}>
        SHIPS · {boardSize}×{boardSize} BOARD
      </Text>
      <View style={styles.wrap}>
        {fleet.map((def) => {
          const { width, height } = shipIconSize(def.cells, CELL);
          return (
            <View key={def.id} style={styles.ship}>
              <SkiaIcon cacheKey={`setup:ship:${def.id}`} width={width} height={height} draw={(c) => drawShipShape(c, def.id, def.cells, 0, CELL)} />
              <Text style={styles.itemText}>
                {def.name}
                {def.count > 1 ? <Text style={{ color: tint }}> ×{def.count}</Text> : null}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.caption}>
        {advance ? 'Shaped T, L and Z ships are harder to pin down.' : 'Straight ships only.'}
      </Text>

      <Text style={[styles.heading, { color: tint, marginTop: 12 }]}>WEAPONS</Text>
      <View style={styles.wrap}>
        <View style={styles.weapon}>
          <MaterialCommunityIcons name="crosshairs" size={16} color={colors.steel100} />
          <Text style={styles.itemText}>
            {WEAPONS.standard.name} <Text style={styles.free}>free</Text>
          </Text>
        </View>
        {advance
          ? POWER_UP_IDS.map((id) => (
              <View key={id} style={styles.weapon}>
                <MaterialCommunityIcons name={WEAPON_ICONS[id]} size={16} color={colors.brass} />
                <Text style={styles.itemText}>
                  {WEAPONS[id].name} <Text style={{ color: colors.brass }}>{WEAPONS[id].cost}⚡</Text>
                </Text>
              </View>
            ))
          : null}
      </View>
      <Text style={styles.caption}>
        {advance
          ? `Charge fills +${CHARGE.perHit} per hit and +${CHARGE.perSunk} per ship sunk. Using a power-up ends your turn.`
          : 'One cell per shot, no power-ups: pure deduction.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 10, padding: 12, borderWidth: 1.5, borderRadius: radii.md, backgroundColor: colors.navy800 },
  heading: { fontFamily: fonts.heading, fontSize: 13, letterSpacing: 1.5, marginBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ship: { alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: radii.sm, backgroundColor: colors.panel },
  weapon: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderRadius: radii.sm, backgroundColor: colors.panel },
  itemText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.steel100 },
  free: { color: colors.radarGreen },
  caption: { ...text.caption, marginTop: 8 },
});
