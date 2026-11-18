import type { ExprFn } from './types.ts';
import { asList, numbersOf } from './values.ts';

export const max: ExprFn = (args) => {
  const list = asList(args[0]);
  if (list === null) {
    return null;
  }
  let largest: number | null = null;
  for (const number of numbersOf(list)) {
    if (largest === null || number > largest) {
      largest = number;
    }
  }
  return largest;
};
