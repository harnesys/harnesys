import { createHash, randomInt } from 'node:crypto';

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;
export const CODE_TTL_MS = 30 * 60 * 1000;

export function createPairCode(): { code: string; hash: string; expiresAt: string } {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return {
    code,
    hash: hashPairCode(code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  };
}

export function hashPairCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

export function pairCodeMatches(
  code: string,
  hash: string,
  expiresAt: string,
  now: number,
): boolean {
  if (code.length === 0) {
    return false;
  }
  if (Number.isNaN(Date.parse(expiresAt)) || now >= Date.parse(expiresAt)) {
    return false;
  }
  return hashPairCode(code) === hash;
}

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase();
}
