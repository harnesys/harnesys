import { createHash } from 'node:crypto';

export function hashNodeToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
