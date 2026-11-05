import { createHash, randomInt } from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

export function createOneTimeCode(): { code: string; hash: string } {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return { code, hash: hashOneTimeCode(code) };
}

export function hashOneTimeCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}
