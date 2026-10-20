import type { Rng } from '../rng';
import type { ObstacleKind, PlacedShip, RuleSet } from '../types';
import type { BotAction, BotView, Difficulty } from './common';
import { easyChoose } from './easy';
import { hardChoose } from './hard';
import { mediumChoose } from './medium';
import { botPlaceFleet } from './placement';

export * from './common';
export { densityMap } from './hard';
export { botPlaceFleet, layoutSignature, spreadScore } from './placement';

export interface Bot {
  difficulty: Difficulty;
  /** Places the fleet around the bot's own obstacles, if any. */
  placeFleet(obstacles?: Record<string, ObstacleKind>): PlacedShip[];
  chooseAction(view: BotView): BotAction;
  /** Randomized "thinking" delay so turns feel natural. */
  thinkDelayMs(): number;
}

export const BOT_PROFILES: Record<Difficulty, { name: string; title: string; description: string; avatarId: string }> = {
  easy: { name: 'Cadet', title: 'Easy', description: 'Fires mostly at random. Good for learning the ropes.', avatarId: 'sailor' },
  medium: {
    name: 'Captain',
    title: 'Medium',
    description: 'Hunts on a checkerboard and follows up on every hit.',
    avatarId: 'captain',
  },
  hard: {
    name: 'Admiral',
    title: 'Hard',
    description: 'Calculates where your ships most likely are. Never cheats.',
    avatarId: 'admiral',
  },
};

export function createBot(difficulty: Difficulty, rules: RuleSet, rng: Rng): Bot {
  const choose = difficulty === 'easy' ? easyChoose : difficulty === 'medium' ? mediumChoose : hardChoose;
  return {
    difficulty,
    placeFleet: (obstacles) => botPlaceFleet(difficulty, rules, rng, obstacles),
    chooseAction: (view) => choose(view, rng),
    thinkDelayMs: () => 600 + Math.floor(rng.next() * 800),
  };
}
