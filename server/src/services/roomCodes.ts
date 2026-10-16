import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../shared/protocol';

const codes = new Map<string, string>();

export function generateRoomCode(random: (max: number) => number = randomInt): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[random(ROOM_CODE_ALPHABET.length)];
    if (!codes.has(code)) return code;
  }
  throw new Error('Room code space exhausted');
}

export function registerRoomCode(code: string, roomId: string) {
  codes.set(code, roomId);
}

export function unregisterRoomCode(code: string) {
  codes.delete(code);
}

export function findRoomByCode(code: string): string | undefined {
  return codes.get(code.trim().toUpperCase());
}
