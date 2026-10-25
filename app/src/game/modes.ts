import type { GameMode } from '@shared/engine';

/** Player-facing mode names. */
export const MODE_NAMES: Record<GameMode, string> = {
  classic: 'Classic',
  advance: 'Advance',
};

export const ADVANCE = MODE_NAMES.advance;
