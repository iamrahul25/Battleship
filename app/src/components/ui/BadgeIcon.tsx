import { drawBadge, drawMedal } from '@/art/badges';
import { SkiaIcon } from '@/art/SkiaIcon';
import { achievementById, type MedalTier } from '@/game/progression';

export function BadgeIcon({ id, size = 64, unlocked = true }: { id: string; size?: number; unlocked?: boolean }) {
  const def = achievementById(id);
  if (!def) return null;
  return <SkiaIcon cacheKey={`badge:${id}:${unlocked ? 1 : 0}`} width={size} draw={(c) => drawBadge(c, def, size, unlocked)} />;
}

export function MedalIcon({ tier, size = 72 }: { tier: MedalTier; size?: number }) {
  return <SkiaIcon cacheKey={`medal:${tier}`} width={size} draw={(c) => drawMedal(c, tier, size)} />;
}
