import { randomInt } from 'node:crypto';
import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH } from '@harnesys/contracts';

export function generateInviteCode(): string {
  let code = '';
  for (let index = 0; index < INVITE_CODE_LENGTH; index += 1) {
    code += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)];
  }
  return code;
}
