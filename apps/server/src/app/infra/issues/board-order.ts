import { BoardValidationException } from '../../domain/issue/board.error.ts';

export function assertExactOrder(
  current: string[],
  next: string[],
  field: 'statuses' | 'rules',
): void {
  const mismatch = findOrderMismatch(current, next);
  if (mismatch !== undefined) {
    throw new BoardValidationException([{ field, code: 'unknown-key', key: mismatch }]);
  }
}

function findOrderMismatch(current: string[], next: string[]): string | undefined {
  const known = new Set(current);
  const seen = new Set<string>();
  for (const key of next) {
    if (seen.has(key)) {
      return key;
    }
    seen.add(key);
  }
  for (const key of next) {
    if (!known.has(key)) {
      return key;
    }
  }
  for (const key of current) {
    if (!seen.has(key)) {
      return key;
    }
  }
  return undefined;
}
