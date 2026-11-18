import type { ExprFn } from './types.ts';
import { asList } from './values.ts';

export const first: ExprFn = (args) => {
  const value = args[0];
  if (typeof value === 'string') {
    return value.length === 0 ? null : value.charAt(0);
  }
  const list = asList(value);
  if (list === null || list.length === 0) {
    return null;
  }
  return list[0] ?? null;
};
