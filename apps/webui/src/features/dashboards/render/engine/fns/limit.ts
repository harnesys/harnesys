import type { ExprFn } from './types.ts';
import { asList, toNumber } from './values.ts';

export const limit: ExprFn = (args) => {
  const list = asList(args[0]);
  if (list === null) {
    return args[0];
  }
  const count = toNumber(args[1]);
  if (count === null || count < 0) {
    return args[0];
  }
  return list.slice(0, Math.floor(count));
};
