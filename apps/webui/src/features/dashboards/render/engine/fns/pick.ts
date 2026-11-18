import { readPath } from '../path';
import type { ExprFn } from './types.ts';

export const pick: ExprFn = (args) => {
  const value = args[0];
  const path = args[1];
  if (typeof value !== 'object' || value === null || typeof path !== 'string' || path === '') {
    return null;
  }
  return readPath(value, path) ?? null;
};
