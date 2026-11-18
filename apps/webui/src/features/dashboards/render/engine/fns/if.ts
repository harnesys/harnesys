import type { ExprFn } from './types.ts';
import { isTruthy } from './values.ts';

export const ifFn: ExprFn = (args) => {
  if (isTruthy(args[0])) {
    return args[1] ?? null;
  }
  return args[2] ?? null;
};
