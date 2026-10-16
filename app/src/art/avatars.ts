import { ClipOp, type SkCanvas, Skia } from '@shopify/react-native-skia';
import { colors } from '@/theme';
import { paint, poly, radial, rrect, star, svg } from './draw';

type Hat = 'cap' | 'admiral' | 'sailor' | 'pilot' | 'helmet' | 'hardhat' | 'diver' | 'headset' | 'medic' | 'beret' | 'beanie' | 'bandana';

export interface AvatarDef {
  id: string;
  name: string;
  bg: string;
  uniform: string;
  skin: string;
  hat: Hat;
}

export const AVATARS: AvatarDef[] = [
  { id: 'captain', name: 'Captain', bg: '#1E5A8A', uniform: '#13294B', skin: '#F1C9A5', hat: 'cap' },
  { id: 'admiral', name: 'Admiral', bg: '#5B3A8C', uniform: '#0F1F38', skin: '#D9A47E', hat: 'admiral' },
  { id: 'sailor', name: 'Sailor', bg: '#2E7DAF', uniform: '#E3E9F0', skin: '#A8714F', hat: 'sailor' },
  { id: 'pilot', name: 'Pilot', bg: '#8A5A2B', uniform: '#5B4636', skin: '#F1C9A5', hat: 'pilot' },
  { id: 'marine', name: 'Marine', bg: '#3F6B3A', uniform: '#4E5D3A', skin: '#7A4E33', hat: 'helmet' },
  { id: 'engineer', name: 'Engineer', bg: '#B5651D', uniform: '#3B4B5E', skin: '#D9A47E', hat: 'hardhat' },
  { id: 'diver', name: 'Diver', bg: '#0F6E6E', uniform: '#2A3A4A', skin: '#F1C9A5', hat: 'diver' },
  { id: 'radio', name: 'Radio Op', bg: '#2F4858', uniform: '#33475B', skin: '#A8714F', hat: 'headset' },
  { id: 'medic', name: 'Medic', bg: '#8C2F39', uniform: '#E3E9F0', skin: '#D9A47E', hat: 'medic' },
  { id: 'navigator', name: 'Navigator', bg: '#1B4D3E', uniform: '#13294B', skin: '#7A4E33', hat: 'beret' },
  { id: 'gunner', name: 'Gunner', bg: '#4A4A58', uniform: '#3A3F47', skin: '#F1C9A5', hat: 'beanie' },
  { id: 'commando', name: 'Commando', bg: '#6B2D2D', uniform: '#2E3B2E', skin: '#A8714F', hat: 'bandana' },
];

export const avatarById = (id: string) => AVATARS.find((a) => a.id === id) ?? AVATARS[0];

const GOLD = colors.brass;

function drawHat(c: SkCanvas, a: AvatarDef) {
  switch (a.hat) {
    case 'cap':
    case 'admiral': {
      const top = a.hat === 'cap' ? '#F4F6F8' : '#15233D';
      c.drawPath(svg('M28 34 Q50 14 72 34 L70 38 L30 38 Z'), paint(top));
      c.drawRRect(rrect(28, 35, 44, 7, 3), paint('#0B1220'));
      c.drawPath(svg('M30 41 Q50 49 70 41 L66 45 Q50 51 34 45 Z'), paint('#0B1220'));
      c.drawPath(star(50, 30, 4.5, 2), paint(GOLD));
      if (a.hat === 'admiral') c.drawLine(31, 38, 69, 38, paint(GOLD, { stroke: 2 }));
      break;
    }
    case 'sailor':
      c.drawPath(svg('M31 33 Q50 22 69 33 L67 39 Q50 35 33 39 Z'), paint('#FFFFFF'));
      c.drawPath(svg('M33 39 Q50 35 67 39'), paint('#C3CFDC', { stroke: 2 }));
      break;
    case 'pilot':
      c.drawPath(svg('M29 50 Q27 22 50 22 Q73 22 71 50 L66 52 Q66 32 50 31 Q34 32 34 52 Z'), paint('#6B4A2E'));
      c.drawCircle(42, 33, 6, paint('#9ED6F0'));
      c.drawCircle(58, 33, 6, paint('#9ED6F0'));
      c.drawCircle(42, 33, 6, paint('#3A2A1A', { stroke: 2.2 }));
      c.drawCircle(58, 33, 6, paint('#3A2A1A', { stroke: 2.2 }));
      c.drawLine(48, 33, 52, 33, paint('#3A2A1A', { stroke: 2 }));
      break;
    case 'helmet':
      c.drawPath(svg('M27 42 Q27 18 50 18 Q73 18 73 42 Z'), paint('#556B2F'));
      c.drawRRect(rrect(25, 40, 50, 5, 2.5), paint('#3E4F22'));
      c.drawLine(36, 26, 42, 22, paint('#6F8A3E', { stroke: 2, cap: 'round' }));
      break;
    case 'hardhat':
      c.drawPath(svg('M29 39 Q29 19 50 19 Q71 19 71 39 Z'), paint('#F2B705'));
      c.drawRRect(rrect(25, 37, 50, 5, 2.5), paint('#D49B00'));
      c.drawLine(50, 20, 50, 37, paint('#D49B00', { stroke: 3 }));
      break;
    case 'diver': {
      c.drawCircle(50, 44, 26, radial(42, 34, 30, ['#F0CF6A', GOLD, colors.brassDark]));
      c.drawCircle(50, 46, 14, paint('#0B2B3A'));
      c.drawCircle(50, 46, 14, paint('#E8C14A', { stroke: 3 }));
      c.drawCircle(50, 46, 9, paint(a.skin, { alpha: 0.85 }));
      c.drawCircle(46, 45, 1.6, paint('#1A1A1A'));
      c.drawCircle(54, 45, 1.6, paint('#1A1A1A'));
      for (const [x, y] of [
        [28, 40],
        [72, 40],
        [50, 20],
      ])
        c.drawCircle(x, y, 4, paint(colors.brassDark));
      break;
    }
    case 'headset':
      c.drawPath(svg('M31 44 Q31 22 50 22 Q69 22 69 44'), paint('#22303D', { stroke: 4 }));
      c.drawRRect(rrect(26, 38, 8, 14, 3), paint('#22303D'));
      c.drawRRect(rrect(66, 38, 8, 14, 3), paint('#22303D'));
      c.drawPath(svg('M30 50 Q32 60 42 60'), paint('#22303D', { stroke: 2.2 }));
      c.drawCircle(43, 60, 2.6, paint(colors.signalRed));
      break;
    case 'medic':
      c.drawPath(svg('M31 37 Q31 23 50 23 Q69 23 69 37 Z'), paint('#F4F6F8'));
      c.drawRect(Skia.XYWHRect(47.5, 25, 5, 11), paint(colors.signalRed));
      c.drawRect(Skia.XYWHRect(44.5, 28, 11, 5), paint(colors.signalRed));
      break;
    case 'beret':
      c.drawPath(svg('M28 36 Q30 20 52 21 Q74 22 72 34 Q60 30 28 36 Z'), paint('#B3262B'));
      c.drawCircle(38, 31, 3, paint(GOLD));
      break;
    case 'beanie':
      c.drawPath(svg('M31 38 Q31 20 50 20 Q69 20 69 38 Z'), paint('#2B2F36'));
      c.drawRRect(rrect(30, 34, 40, 7, 3), paint('#3B414B'));
      c.drawLine(58, 50, 63, 57, paint('#B06A5A', { stroke: 1.6, cap: 'round' }));
      break;
    case 'bandana':
      c.drawPath(svg('M31 37 Q31 24 50 24 Q69 24 69 37 L31 37 Z'), paint('#B3262B'));
      c.drawPath(svg('M68 34 L78 30 L76 38 Z'), paint('#8E1D21'));
      c.drawRRect(rrect(37, 42, 26, 6, 3), paint('#111418', { alpha: 0.9 }));
      break;
  }
}

/** Draws an avatar into a `size`×`size` box. */
export function drawAvatar(c: SkCanvas, id: string, size: number, opts: { locked?: boolean } = {}) {
  const a = avatarById(id);
  c.save();
  c.scale(size / 100, size / 100);
  const clip = Skia.Path.Circle(50, 50, 46);
  c.save();
  c.clipPath(clip, ClipOp.Intersect, true);
  c.drawCircle(50, 50, 48, radial(40, 30, 70, [a.bg, '#0A1628']));
  // Shoulders + collar.
  c.drawPath(svg('M14 100 Q16 70 50 68 Q84 70 86 100 Z'), paint(a.uniform));
  c.drawPath(poly([
    [42, 68],
    [50, 80],
    [58, 68],
  ]), paint(a.hat === 'sailor' ? '#1E5A8A' : '#E3E9F0'));
  if (a.hat === 'admiral' || a.hat === 'cap') {
    c.drawRRect(rrect(18, 72, 14, 5, 2), paint(GOLD));
    c.drawRRect(rrect(68, 72, 14, 5, 2), paint(GOLD));
  }
  if (a.hat !== 'diver') {
    c.drawRRect(rrect(44, 56, 12, 14, 4), paint(a.skin));
    c.drawCircle(50, 46, 17, paint(a.skin));
    c.drawCircle(43.5, 46, 2, paint('#1A1A1A'));
    c.drawCircle(56.5, 46, 2, paint('#1A1A1A'));
    c.drawPath(svg('M44 54 Q50 57 56 54'), paint('#5A2E22', { stroke: 1.8, cap: 'round' }));
  }
  drawHat(c, a);
  if (opts.locked) c.drawCircle(50, 50, 48, paint('#0A1628', { alpha: 0.7 }));
  c.restore();
  c.drawCircle(50, 50, 46, paint(GOLD, { stroke: 5 }));
  c.drawCircle(50, 50, 48.5, paint(colors.brassDark, { stroke: 1.5 }));
  c.restore();
}
