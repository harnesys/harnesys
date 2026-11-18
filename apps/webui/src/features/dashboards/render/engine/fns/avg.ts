import type { ExprFn } from './types.ts';
import { asList, numbersOf } from './values.ts';

export const avg: ExprFn = (args) => {
  const list = asList(args[0]);
  if (list === null) {
    return null;
  }
  const numbers = numbersOf(list);
  if (numbers.length === 0) {
    return null;
  }
  let total = 0;
  for (const number of numbers) {
    total += number;
  }
  return total / numbers.length;
};
