import { readPath } from '../path';
import type { ExprFn } from './types.ts';
import { asList, compareValues, isPlainObject } from './values.ts';

export const sort: ExprFn = (args) => {
  const list = asList(args[0]);
  if (list === null) {
    return args[0];
  }
  const path = args[1];
  const key = typeof path === 'string' && path !== '' ? path : null;
  const orderKeyOf = (entry: unknown): unknown =>
    key !== null && isPlainObject(entry) ? readPath(entry, key) : entry;
  return [...list].sort((a, b) => compareValues(orderKeyOf(a), orderKeyOf(b)));
};
