import type { ExprFn } from './types.ts';
import { asList } from './values.ts';

export const last: ExprFn = (args) => {
  const value = args[0];
  if (typeof value === 'string') {
    return value.length === 0 ? null : value.charAt(value.length - 1);
  }
  const list = asList(value);
  if (list === null || list.length === 0) {
    return null;
  }
  return list[list.length - 1] ?? null;
};
