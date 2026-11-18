import { readPath } from '../path';
import type { ExprFn } from './types.ts';
import { asList, isPlainObject } from './values.ts';

export const pluck: ExprFn = (args) => {
  const list = asList(args[0]);
  const path = args[1];
  if (list === null || typeof path !== 'string' || path === '') {
    return null;
  }
  return list.map((entry) => (isPlainObject(entry) ? (readPath(entry, path) ?? null) : null));
};
