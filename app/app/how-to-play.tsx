import { StyleSheet, Text, View } from 'react-native';
import { CHARGE, WEAPONS } from '@shared/engine';
import { drawMiss, drawHitPeg } from '@/components/grid/boardPicture';
import { drawShipIcon } from '@/art/ships';
import { paint } from '@/art/draw';
import { SkiaIcon } from '@/art/SkiaIcon';
import { Panel } from '@/components/ui/Panel';
import { Screen } from '@/components/ui/Screen';
import { colors, fonts, text } from '@/theme';

const FLEET = [
  { id: 'carrier', name: 'Carrier', len: 5 },
  { id: 'battleship', name: 'Battleship', len: 4 },
  { id: 'cruiser', name: 'Cruiser', len: 3 },
  { id: 'submarine', name: 'Submarine', len: 3 },
  { id: 'destroyer', name: 'Destroyer', len: 2 },
];

function Marker({ kind }: { kind: 'miss' | 'hit' | 'empty' }) {
  return (
    <SkiaIcon
      cacheKey={`help:${kind}`}
      width={32}
      draw={(c) => {
        c.drawRect({ x: 0, y: 0, width: 32, height: 32 }, paint(colors.ocean500));
        if (kind === 'miss') drawMiss(c, 16, 16, 32);
        else if (kind === 'hit') drawHitPeg(c, 16, 16, 32);
        else c.drawCircle(16, 16, 2.5, paint(colors.steel400, { alpha: 0.6 }));
      }}
      style={{ borderRadius: 4 }}
    />
  );
}

function Pattern({ cells, color }: { cells: { x: number; y: number }[]; color: string }) {
  return (
    <View style={styles.pattern}>
      {Array.from({ length: 9 }, (_, i) => {
        const x = (i % 3) - 1;
        const y = Math.floor(i / 3) - 1;
        const on = cells.some((c) => c.x === x && c.y === y);
        return <View key={i} style={[styles.patternCell, on && { backgroundColor: color }]} />;
      })}
    </View>
  );
}

export default function HowToPlay() {
  return (
    <Screen title="How to Play" back scroll>
      <Panel title="Objective">
        <Text style={styles.p}>Sink all five enemy ships before they sink yours. You can&apos;t see the enemy fleet: deduce it from your hits and misses.</Text>
      </Panel>

      <Panel title="Your fleet" style={styles.panel}>
        {FLEET.map((f) => (
          <View key={f.id} style={styles.shipRow}>
            <SkiaIcon cacheKey={`help:ship:${f.id}`} width={f.len * 22} height={22} draw={(c) => drawShipIcon(c, f.id, f.len, 22)} />
            <Text style={styles.shipName}>
              {f.name} · {f.len}
            </Text>
          </View>
        ))}
        <Text style={[styles.p, { marginTop: 8 }]}>Drag ships onto the 10×10 grid and tap to rotate. Ships can&apos;t overlap and, by default, can&apos;t touch, not even diagonally.</Text>
      </Panel>

      <Panel title="Battle" style={styles.panel}>
        <Text style={styles.p}>Players take turns firing at a cell. A hit lets you fire again. Sinking a ship reveals it and marks the water around it as empty.</Text>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <Marker kind="miss" />
            <Text style={styles.legendText}>Miss</Text>
          </View>
          <View style={styles.legendItem}>
            <Marker kind="hit" />
            <Text style={styles.legendText}>Hit</Text>
          </View>
          <View style={styles.legendItem}>
            <Marker kind="empty" />
            <Text style={styles.legendText}>Known empty</Text>
          </View>
        </View>
        <Text style={styles.p}>Online turns last 30 seconds. Miss three turns in a row and you forfeit.</Text>
      </Panel>

      <Panel title="Arsenal mode" accent="brass" style={styles.panel}>
        <Text style={styles.p}>
          Your charge meter fills as you fight: +{CHARGE.perHit} per hit, +{CHARGE.perSunk} per ship sunk, +{CHARGE.missStreakBonus} after{' '}
          {CHARGE.missStreakLength} misses in a row (max {CHARGE.max}). Using a power-up ends your turn.
        </Text>
        <View style={styles.weapon}>
          <Pattern cells={WEAPONS.artillery.pattern} color={colors.signalRed} />
          <View style={{ flex: 1 }}>
            <Text style={styles.weaponName}>HEAVY ARTILLERY · {WEAPONS.artillery.cost}⚡</Text>
            <Text style={styles.p}>Strikes a plus-shaped 5-cell pattern. Up to {WEAPONS.artillery.maxUses} uses per game.</Text>
          </View>
        </View>
        <View style={styles.weapon}>
          <Pattern cells={WEAPONS.sonar.pattern} color={colors.radarGreen} />
          <View style={{ flex: 1 }}>
            <Text style={styles.weaponName}>SONAR SCAN · {WEAPONS.sonar.cost}⚡</Text>
            <Text style={styles.p}>Reveals how many ship cells hide in a 3×3 area, without firing.</Text>
          </View>
        </View>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: 14 },
  p: { ...text.body, color: colors.steel200, lineHeight: 22 },
  shipRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  shipName: { fontFamily: fonts.bodyBold, color: colors.steel100, fontSize: 15 },
  legend: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 12 },
  legendItem: { alignItems: 'center', gap: 4 },
  legendText: { ...text.caption },
  weapon: { flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 12 },
  weaponName: { fontFamily: fonts.heading, fontSize: 14, color: colors.brass, letterSpacing: 1 },
  pattern: { width: 54, height: 54, flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  patternCell: { width: 16, height: 16, backgroundColor: colors.navy800, borderRadius: 2 },
});
