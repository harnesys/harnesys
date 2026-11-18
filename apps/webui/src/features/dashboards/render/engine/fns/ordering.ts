import { toNumber } from './values.ts';

export function orderingOf(args: readonly unknown[]): number | null {
  const left = toNumber(args[0]);
  const right = toNumber(args[1]);
  if (left !== null && right !== null) {
    if (left === right) {
      return 0;
    }
    return left < right ? -1 : 1;
  }
  if (typeof args[0] === 'string' && typeof args[1] === 'string') {
    const compared = args[0].localeCompare(args[1]);
    if (compared === 0) {
      return 0;
    }
    return compared < 0 ? -1 : 1;
  }
  return null;
}
