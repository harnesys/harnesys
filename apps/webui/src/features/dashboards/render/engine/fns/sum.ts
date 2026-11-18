import type { ExprFn } from './types.ts';
import { asList, numbersOf } from './values.ts';

export const sum: ExprFn = (args) => {
  const list = asList(args[0]);
  if (list === null) {
    return null;
  }
  let total = 0;
  for (const number of numbersOf(list)) {
    total += number;
  }
  return total;
};
