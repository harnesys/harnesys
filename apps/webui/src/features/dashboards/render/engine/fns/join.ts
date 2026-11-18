import type { ExprFn } from './types.ts';
import { asList, stringOf } from './values.ts';

export const join: ExprFn = (args) => {
  const list = asList(args[0]);
  if (list === null) {
    return null;
  }
  const separator = typeof args[1] === 'string' ? args[1] : ', ';
  return list.map(stringOf).join(separator);
};
