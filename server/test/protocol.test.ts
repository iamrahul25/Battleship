import { describe, expect, it } from 'vitest';
import {
  emoteSchema,
  fireSchema,
  joinOptionsSchema,
  placeFleetSchema,
  PROTOCOL_VERSION,
  roomCodeSchema,
  sanitizeName,
  useWeaponSchema,
} from '../src/shared/protocol';
import { generateRoomCode } from '../src/services/roomCodes';
import { RateLimiter } from '../src/services/rateLimiter';

describe('protocol schemas', () => {
  it('fire accepts ints in range only', () => {
    expect(fireSchema.safeParse({ x: 3, y: 4 }).success).toBe(true);
    expect(fireSchema.safeParse({ x: -1, y: 4 }).success).toBe(false);
    expect(fireSchema.safeParse({ x: 1.5, y: 4 }).success).toBe(false);
    expect(fireSchema.safeParse({ x: '1', y: 4 }).success).toBe(false);
    expect(fireSchema.safeParse(null).success).toBe(false);
  });
  it('place_fleet validates ships', () => {
    expect(placeFleetSchema.safeParse({ ships: [{ defId: 'carrier', x: 0, y: 0, rotation: 90 }] }).success).toBe(true);
    expect(placeFleetSchema.safeParse({ ships: [{ defId: 'carrier', x: 0, y: 0, rotation: 45 }] }).success).toBe(false);
    expect(placeFleetSchema.safeParse({ ships: [] }).success).toBe(false);
    expect(placeFleetSchema.safeParse({ ships: Array(25).fill({ defId: 'a', x: 0, y: 0, rotation: 0 }) }).success).toBe(false);
  });
  it('use_weapon', () => {
    expect(useWeaponSchema.safeParse({ weaponId: 'artillery', x: 1, y: 1 }).success).toBe(true);
    expect(useWeaponSchema.safeParse({ weaponId: 'sonar', x: 1, y: 1, orientation: 'D' }).success).toBe(false);
  });
  it('emote ids are a fixed set', () => {
    expect(emoteSchema.safeParse({ id: 'gg' }).success).toBe(true);
    expect(emoteSchema.safeParse({ id: 'spam' }).success).toBe(false);
  });
  it('join options fill defaults', () => {
    const r = joinOptionsSchema.parse({ protocolVersion: PROTOCOL_VERSION });
    expect(r.mode).toBe('arsenal');
    expect(r.profile.name).toBe('Sailor');
    expect(joinOptionsSchema.safeParse({}).success).toBe(false);
    expect(joinOptionsSchema.safeParse({ protocolVersion: 1, mode: 'chaos' }).success).toBe(false);
  });
  it('room codes: 6 chars, no ambiguous chars, case-insensitive', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(roomCodeSchema.safeParse(code.toLowerCase()).success).toBe(true);
    }
    expect(roomCodeSchema.safeParse('ABC10O').success).toBe(false);
    expect(roomCodeSchema.safeParse('ABC').success).toBe(false);
  });
});

describe('nickname sanitizing', () => {
  it('trims, length-limits and masks profanity', () => {
    expect(sanitizeName('  Jack   Sparrow ')).toBe('Jack Sparrow');
    expect(sanitizeName('ab')).toBeNull();
    expect(sanitizeName('x'.repeat(30))).toHaveLength(16);
    expect(sanitizeName('shitcaptain')).toBe('****captain');
    expect(sanitizeName('a\u0000b\u0007c')).toBe('abc');
  });
});

describe('rate limiter', () => {
  it('allows bursts up to capacity, then refills', () => {
    let now = 0;
    const rl = new RateLimiter(5, 5, () => now);
    for (let i = 0; i < 5; i++) expect(rl.take('a')).toBe(true);
    expect(rl.take('a')).toBe(false);
    expect(rl.take('b')).toBe(true);
    now += 400;
    expect(rl.take('a')).toBe(true);
    expect(rl.take('a')).toBe(true);
    expect(rl.take('a')).toBe(false);
  });
});
