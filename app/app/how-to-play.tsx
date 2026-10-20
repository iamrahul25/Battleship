import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { CHARGE, type ObstacleKind, SHAPED_SHIPS, shapeCells, WEAPONS } from '@shared/engine';
import { drawObstacleIcon } from '@/art/obstacles';
import { WEAPON_ICONS } from '@/components/hud/PowerUpBar';
import { drawMiss, drawHitPeg } from '@/components/grid/boardPicture';
import { drawShipIcon, drawShipShape, shipIconSize } from '@/art/ships';
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

const OBSTACLE_HELP: { kind: ObstacleKind; name: string; text: string }[] = [
  { kind: 'rock', name: 'Rock', text: "Visible. Can't be fired at." },
  { kind: 'island', name: 'Island', text: "2–3 cells of land. Visible. Can't be fired at." },
  { kind: 'reef', name: 'Reef', text: 'Visible. A shot on a reef is a miss.' },
  { kind: 'mine', name: 'Mine', text: 'Hidden from the enemy. Hit one and you skip your next turn.' },
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

type Tone = 'strike' | 'scan' | 'clear';
const TONE: Record<Tone, string> = { strike: colors.signalRed, scan: colors.radarGreen, clear: colors.steel600 };

/** 4×4 diagram of the cells a weapon affects. */
function Pattern({ cells }: { cells: { x: number; y: number; tone: Tone }[] }) {
  return (
    <View style={styles.pattern}>
      {Array.from({ length: 16 }, (_, i) => {
        const cell = cells.find((c) => c.x === i % 4 && c.y === Math.floor(i / 4));
        return <View key={i} style={[styles.patternCell, cell && { backgroundColor: TONE[cell.tone] }]} />;
      })}
    </View>
  );
}

const strike = (pts: [number, number][], tone: Tone = 'strike') => pts.map(([x, y]) => ({ x, y, tone }));

const WEAPON_HELP: { id: string; cells: { x: number; y: number; tone: Tone }[]; text: string }[] = [
  { id: 'barrage', cells: strike([[0, 0], [3, 1], [1, 2], [2, 3]]), text: '4 shells land on random cells you haven’t revealed yet.' },
  { id: 'sonar', cells: strike([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]], 'scan'), text: 'Reveals how many ship cells hide in a 3×3 area, without firing.' },
  {
    id: 'torpedo',
    cells: [...strike([[0, 1], [1, 1], [2, 1]], 'clear'), ...strike([[3, 1]])],
    text: 'Pick a row or column; it runs from the nearer edge, clears the water it crosses and hits the first ship. Stopped by rocks and islands, passes over reefs.',
  },
  { id: 'airstrike', cells: strike([[0, 1], [1, 1], [2, 1], [3, 1]]), text: 'Hits a straight line of 4 cells. Toggle row or column before you aim.' },
  { id: 'artillery', cells: strike([[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]), text: 'Strikes a plus-shaped 5-cell pattern.' },
];

export default function HowToPlay() {
  return (
    <Screen title="How to Play" back scroll>
      <Panel title="Objective">
        <Text style={styles.p}>Sink every enemy ship before they sink yours. You can&apos;t see the enemy fleet: deduce it from your hits and misses.</Text>
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
        <Text style={[styles.p, { marginTop: 8 }]}>Drag ships onto the grid and tap to rotate. Ships can&apos;t overlap and, by default, can&apos;t touch, not even diagonally.</Text>
      </Panel>

      <Panel title="Arsenal fleet" style={styles.panel}>
        <Text style={styles.p}>In Arsenal mode some straight ships are swapped for shaped ships. Tap a placed ship to cycle through its rotations.</Text>
        {Object.values(SHAPED_SHIPS).map((def) => {
          const cells = shapeCells(def, 0);
          const { width, height } = shipIconSize(cells, 22);
          return (
            <View key={def.id} style={styles.shipRow}>
              <SkiaIcon cacheKey={`help:ship:${def.id}`} width={width} height={height} draw={(c) => drawShipShape(c, def.id, cells, 0, 22)} />
              <Text style={styles.shipName}>
                {def.name} · {def.cells.length}
              </Text>
            </View>
          );
        })}
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

      <Panel title="Obstacles" style={styles.panel}>
        <Text style={styles.p}>Bot games can scatter obstacles on both boards. Ships can&apos;t be placed on them.</Text>
        {OBSTACLE_HELP.map((o) => (
          <View key={o.kind} style={styles.shipRow}>
            <SkiaIcon cacheKey={`help:obstacle:${o.kind}`} width={28} height={28} draw={(c) => drawObstacleIcon(c, o.kind, 28)} />
            <Text style={[styles.p, { flex: 1 }]}>
              <Text style={styles.shipName}>{o.name}</Text> · {o.text}
            </Text>
          </View>
        ))}
      </Panel>

      <Panel title="Arsenal mode" accent="brass" style={styles.panel}>
        <Text style={styles.p}>
          Your charge meter fills as you fight: +{CHARGE.perHit} per hit, +{CHARGE.perSunk} per ship sunk, +{CHARGE.missStreakBonus} after{' '}
          {CHARGE.missStreakLength} misses in a row (max {CHARGE.max}). Using a power-up ends your turn.
        </Text>
        {WEAPON_HELP.map((h) => {
          const w = WEAPONS[h.id];
          return (
            <View key={h.id} style={styles.weapon}>
              <Pattern cells={h.cells} />
              <View style={{ flex: 1 }}>
                <View style={styles.weaponTitle}>
                  <MaterialCommunityIcons name={WEAPON_ICONS[h.id]} size={16} color={colors.brass} />
                  <Text style={styles.weaponName}>
                    {w.name.toUpperCase()} · {w.cost}⚡
                  </Text>
                </View>
                <Text style={styles.p}>
                  {h.text}
                  {w.maxUses ? ` Up to ${w.maxUses} uses per game.` : ''}
                </Text>
              </View>
            </View>
          );
        })}
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
  weaponTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weaponName: { fontFamily: fonts.heading, fontSize: 14, color: colors.brass, letterSpacing: 1 },
  pattern: { width: 54, height: 54, flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  patternCell: { width: 12, height: 12, backgroundColor: colors.navy800, borderRadius: 2 },
});
