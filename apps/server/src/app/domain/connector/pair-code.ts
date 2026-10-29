import { createHash, randomInt } from 'node:crypto';

const PAIR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PAIR_CODE_LENGTH = 8;

export function createPairCode(): { code: string; hash: string } {
  let code = '';
  for (let i = 0; i < PAIR_CODE_LENGTH; i += 1) {
    code += PAIR_ALPHABET[randomInt(PAIR_ALPHABET.length)];
  }
  return { code, hash: hashPairCode(code) };
}

export function pairCodeMatches(
  code: string,
  hash: string,
  expiresAt: number,
  now: number,
): boolean {
  if (code.length === 0) {
    return false;
  }
  if (now >= expiresAt) {
    return false;
  }
  return hashPairCode(code) === hash;
}

function hashPairCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}
