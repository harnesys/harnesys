import type { ExprFn } from './types.ts';
import { isPlainObject } from './values.ts';

export const count: ExprFn = (args) => {
  const value = args[0];
  if (Array.isArray(value) || typeof value === 'string') {
    return value.length;
  }
  if (isPlainObject(value)) {
    return Object.keys(value).length;
  }
  return null;
};
