import { createOneTimeCode, hashOneTimeCode } from '../one-time-code.ts';

export function createPairCode(): { code: string; hash: string } {
  return createOneTimeCode();
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
  return hashOneTimeCode(code) === hash;
}
