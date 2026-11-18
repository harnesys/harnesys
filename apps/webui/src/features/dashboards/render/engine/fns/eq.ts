import type { ExprFn } from './types.ts';
import { deepEqual } from './values.ts';

export const eq: ExprFn = (args) => {
  const [left, right] = args;
  if (left === null || left === undefined) {
    return right === null || right === undefined;
  }
  if (right === null || right === undefined) {
    return false;
  }
  return deepEqual(left, right);
};
