import type { ExprFn } from './types.ts';
import { asList, numbersOf } from './values.ts';

export const min: ExprFn = (args) => {
  const list = asList(args[0]);
  if (list === null) {
    return null;
  }
  let smallest: number | null = null;
  for (const number of numbersOf(list)) {
    if (smallest === null || number < smallest) {
      smallest = number;
    }
  }
  return smallest;
};
