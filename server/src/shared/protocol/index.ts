import { z } from 'zod';
import { BOARD_SIZE_MAX, BOARD_SIZE_MIN, parseGameMode } from '../engine/config';
import type { FinishReason, PlacedShip, PublicView, ShotEvent } from '../engine/types';

/** v2: board sizes, shaped ships, obstacles and the new weapons. */
export const PROTOCOL_VERSION = 2;
export const ROOM_NAME = 'battle';

export const ClientMessage = {
  PlaceFleet: 'place_fleet',
  Ready: 'ready',
  Fire: 'fire',
  UseWeapon: 'use_weapon',
  Forfeit: 'forfeit',
  Emote: 'emote',
  Rematch: 'rematch',
} as const;

export const ServerMessage = {
  Sync: 'sync',
  ShotResult: 'shot_result',
  YourFleet: 'your_fleet',
  GameOver: 'game_over',
  Error: 'error',
  Emote: 'emote',
  Rematch: 'rematch_status',
} as const;

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const roomCodeSchema = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`)));

export const EMOTES = ['salute', 'gg', 'boom', 'oops', 'nice', 'taunt'] as const;
export type EmoteId = (typeof EMOTES)[number];

export const gameModeSchema = z.string().max(16).transform(parseGameMode);

export const profileSchema = z.object({
  playerId: z.string().max(64).default(''),
  name: z.string().max(64).default('Sailor'),
  avatarId: z.string().max(32).default('captain'),
  wins: z.number().int().min(0).max(1_000_000).default(0),
  losses: z.number().int().min(0).max(1_000_000).default(0),
});
export type ProfilePayload = z.infer<typeof profileSchema>;

export const obstacleLevelSchema = z.enum(['none', 'few', 'many']);

export const joinOptionsSchema = z.object({
  protocolVersion: z.number().int(),
  mode: gameModeSchema.default('advance'),
  private: z.boolean().optional(),
  /** Private rooms only; Quick Match always plays the standard table. */
  boardSize: z.number().int().min(BOARD_SIZE_MIN).max(BOARD_SIZE_MAX).optional(),
  obstacles: obstacleLevelSchema.optional(),
  code: z.string().optional(),
  profile: profileSchema.default({ playerId: '', name: 'Sailor', avatarId: 'captain', wins: 0, losses: 0 }),
});
export type JoinOptions = z.input<typeof joinOptionsSchema>;

const coordInt = z.number().int().min(0).max(63);
const rotationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);

export const placeFleetSchema = z.object({
  ships: z
    .array(z.object({ defId: z.string().min(1).max(32), x: coordInt, y: coordInt, rotation: rotationSchema }))
    .min(1)
    .max(20),
  mines: z.array(z.object({ x: coordInt, y: coordInt })).max(20).optional(),
});
export const readySchema = z.object({}).passthrough().optional();
export const fireSchema = z.object({ x: coordInt, y: coordInt });
export const useWeaponSchema = z.object({
  weaponId: z.string().min(1).max(32),
  x: coordInt,
  y: coordInt,
});
export const forfeitSchema = readySchema;
export const rematchSchema = readySchema;
export const emoteSchema = z.object({ id: z.enum(EMOTES) });

export type PlaceFleetPayload = z.infer<typeof placeFleetSchema>;
export type FirePayload = z.infer<typeof fireSchema>;
export type UseWeaponPayload = z.infer<typeof useWeaponSchema>;
export type EmotePayload = z.infer<typeof emoteSchema>;

// ---- Server → client payloads ----

export interface SyncPayload {
  view: PublicView;
}
export interface ShotResultPayload {
  event: ShotEvent;
  view: PublicView;
}
export interface GameOverPayload {
  winnerSessionId: string;
  /** Index of the winner from the receiving client's point of view: true when they won. */
  youWon: boolean;
  reason: FinishReason;
  /** Opponent's full fleet, revealed at game end. */
  revealFleet: PlacedShip[];
  view: PublicView;
}
export interface ErrorPayload {
  code: string;
  message: string;
}
export interface EmoteBroadcast {
  sessionId: string;
  id: EmoteId;
}
export interface RematchStatusPayload {
  requested: string[];
}

export type ServerErrorCode =
  | 'PROTOCOL_MISMATCH'
  | 'INVALID_MESSAGE'
  | 'RATE_LIMITED'
  | 'ROOM_NOT_FOUND'
  | 'WRONG_PHASE'
  | 'NOT_YOUR_TURN'
  | 'ALREADY_FIRED'
  | 'OUT_OF_BOUNDS'
  | 'INVALID_PLACEMENT'
  | 'FLEET_INCOMPLETE'
  | 'ALREADY_READY'
  | 'WEAPON_NOT_READY'
  | 'WEAPON_UNKNOWN'
  | 'POWERUPS_DISABLED'
  | 'BLOCKED';

export const ERROR_MESSAGES: Record<string, string> = {
  PROTOCOL_MISMATCH: 'Please update the app to play online.',
  INVALID_MESSAGE: 'Invalid message.',
  RATE_LIMITED: 'Slow down, Admiral!',
  ROOM_NOT_FOUND: 'Room not found.',
  WRONG_PHASE: 'Not allowed right now.',
  NOT_YOUR_TURN: "It's not your turn.",
  ALREADY_FIRED: 'You already fired there.',
  OUT_OF_BOUNDS: 'Target is outside the grid.',
  INVALID_PLACEMENT: 'Invalid fleet placement.',
  FLEET_INCOMPLETE: 'Place all your ships first.',
  ALREADY_READY: 'Already ready.',
  WEAPON_NOT_READY: 'Power-up not charged.',
  WEAPON_UNKNOWN: 'Unknown power-up.',
  POWERUPS_DISABLED: 'Power-ups are disabled in Classic mode.',
  BLOCKED: "You can't fire at rocks or islands.",
};

// ---- Nicknames ----

const BANNED = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fag', 'dick', 'pussy', 'asshole', 'whore', 'slut', 'rape'];

export const NAME_MIN = 3;
export const NAME_MAX = 16;

/** Trims, strips control chars, masks basic profanity; returns null if unusable. */
export function sanitizeName(raw: string): string | null {
  // eslint-disable-next-line no-control-regex
  let name = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (name.length > NAME_MAX) name = name.slice(0, NAME_MAX).trim();
  if (name.length < NAME_MIN) return null;
  const lower = name.toLowerCase();
  for (const word of BANNED) {
    let idx = lower.indexOf(word);
    while (idx !== -1) {
      name = name.slice(0, idx) + '*'.repeat(word.length) + name.slice(idx + word.length);
      idx = lower.indexOf(word, idx + word.length);
    }
  }
  return name;
}
