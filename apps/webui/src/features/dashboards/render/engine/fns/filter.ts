import { readPath } from '../path';
import type { ExprFn } from './types.ts';
import { asList, isPlainObject, isTruthy } from './values.ts';

export const filter: ExprFn = (args) => {
  const list = asList(args[0]);
  const path = args[1];
  if (list === null || typeof path !== 'string' || path === '') {
    return args[0];
  }
  return list.filter((entry) => isPlainObject(entry) && isTruthy(readPath(entry, path)));
};
