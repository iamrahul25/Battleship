import type { SkCanvas } from '@shopify/react-native-skia';
import type { AchievementDef, MedalTier } from '@/game/progression';
import { colors } from '@/theme';
import { linear, paint, poly, radial, star, svg } from './draw';

const TIER: Record<MedalTier, [string, string, string]> = {
  gold: ['#FFE48A', colors.gold, '#9A7414'],
  silver: ['#F4F8FC', colors.silver, '#6C7A88'],
  bronze: ['#F0B27A', colors.bronze, '#6E3F17'],
};
const LOCKED: [string, string, string] = ['#4A5A70', '#34404F', '#1E2733'];

function glyph(c: SkCanvas, icon: AchievementDef['icon'], col: string) {
  const fill = paint(col);
  const line = paint(col, { stroke: 4, cap: 'round' });
  switch (icon) {
    case 'blood':
      c.drawPath(svg('M50 40 Q62 56 62 63 A12 12 0 0 1 38 63 Q38 56 50 40 Z'), fill);
      break;
    case 'anchor':
      c.drawCircle(50, 44, 4, paint(col, { stroke: 3 }));
      c.drawLine(50, 48, 50, 74, line);
      c.drawLine(41, 54, 59, 54, line);
      c.drawPath(svg('M36 64 Q38 76 50 76 Q62 76 64 64'), paint(col, { stroke: 4 }));
      break;
    case 'trophy':
      c.drawPath(svg('M38 42 L62 42 L60 56 Q58 64 50 64 Q42 64 40 56 Z'), fill);
      c.drawPath(svg('M38 45 Q30 45 32 52 Q34 57 40 57'), paint(col, { stroke: 3 }));
      c.drawPath(svg('M62 45 Q70 45 68 52 Q66 57 60 57'), paint(col, { stroke: 3 }));
      c.drawLine(50, 64, 50, 70, line);
      c.drawLine(41, 74, 59, 74, line);
      break;
    case 'crosshair':
      c.drawCircle(50, 58, 13, paint(col, { stroke: 3.5 }));
      c.drawLine(50, 40, 50, 50, line);
      c.drawLine(50, 66, 50, 76, line);
      c.drawLine(32, 58, 42, 58, line);
      c.drawLine(58, 58, 68, 58, line);
      c.drawCircle(50, 58, 3, fill);
      break;
    case 'shield':
      c.drawPath(svg('M50 40 L66 46 Q66 66 50 76 Q34 66 34 46 Z'), fill);
      break;
    case 'phoenix':
      c.drawPath(svg('M50 76 Q40 66 34 46 Q44 54 50 50 Q56 54 66 46 Q60 66 50 76 Z'), fill);
      c.drawCircle(50, 44, 4, fill);
      break;
    case 'chevron1':
    case 'chevron2':
    case 'chevron3': {
      const n = icon === 'chevron1' ? 1 : icon === 'chevron2' ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const y = 66 - i * 9 + (n - 1) * 4;
        c.drawPath(svg(`M36 ${y - 8} L50 ${y} L64 ${y - 8}`), paint(col, { stroke: 5, cap: 'round' }));
      }
      break;
    }
    case 'globe':
      c.drawCircle(50, 58, 15, paint(col, { stroke: 3 }));
      c.drawLine(35, 58, 65, 58, paint(col, { stroke: 2.5 }));
      c.drawPath(svg('M50 43 Q40 58 50 73 Q60 58 50 43'), paint(col, { stroke: 2.5 }));
      break;
    case 'cannon':
      c.drawPath(poly([
        [34, 60],
        [62, 46],
        [66, 52],
        [38, 66],
      ]), fill);
      c.drawCircle(42, 68, 7, paint(col, { stroke: 3 }));
      c.drawCircle(68, 46, 3, fill);
      break;
    case 'flame':
      c.drawPath(svg('M50 76 Q36 72 38 60 Q40 52 46 46 Q46 54 52 56 Q50 46 56 40 Q66 52 62 64 Q60 74 50 76 Z'), fill);
      break;
  }
}

/** Medal with ribbon in a 100×100 box (scaled to `size`). */
export function drawBadge(c: SkCanvas, def: AchievementDef, size: number, unlocked: boolean) {
  const [light, base, dark] = unlocked ? TIER[def.tier] : LOCKED;
  c.save();
  c.scale(size / 100, size / 100);
  // Ribbon.
  const ribbonA = unlocked ? '#B3262B' : '#2A3442';
  const ribbonB = unlocked ? '#1E5A8A' : '#222B37';
  c.drawPath(poly([
    [30, 4],
    [46, 4],
    [56, 34],
    [44, 38],
  ]), paint(ribbonA));
  c.drawPath(poly([
    [70, 4],
    [54, 4],
    [44, 34],
    [56, 38],
  ]), paint(ribbonB));
  // Medal body.
  c.drawCircle(50, 60, 32, linear(30, 30, 70, 92, [light, base, dark]));
  c.drawCircle(50, 60, 32, paint(dark, { stroke: 2.5 }));
  c.drawCircle(50, 60, 25, paint(dark, { stroke: 1.5, alpha: 0.7 }));
  if (unlocked) c.drawCircle(40, 48, 12, radial(40, 48, 12, ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']));
  glyph(c, def.icon, unlocked ? dark : '#56677D');
  c.restore();
}

/** Result-screen accuracy medal. */
export function drawMedal(c: SkCanvas, tier: MedalTier, size: number) {
  const [light, base, dark] = TIER[tier];
  c.save();
  c.scale(size / 100, size / 100);
  c.drawPath(poly([
    [32, 2],
    [48, 2],
    [56, 34],
    [42, 36],
  ]), paint('#B3262B'));
  c.drawPath(poly([
    [68, 2],
    [52, 2],
    [44, 34],
    [58, 36],
  ]), paint('#1E5A8A'));
  c.drawCircle(50, 62, 32, linear(30, 30, 70, 94, [light, base, dark]));
  c.drawCircle(50, 62, 32, paint(dark, { stroke: 2.5 }));
  c.drawPath(star(50, 62, 18, 8), paint(dark));
  c.restore();
}
