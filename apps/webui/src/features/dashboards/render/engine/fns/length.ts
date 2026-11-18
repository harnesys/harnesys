import type { ExprFn } from './types.ts';
import { isPlainObject } from './values.ts';

export const length: ExprFn = (args) => {
  const value = args[0];
  if (typeof value === 'string' || Array.isArray(value)) {
    return value.length;
  }
  if (isPlainObject(value)) {
    return Object.keys(value).length;
  }
  return null;
};
