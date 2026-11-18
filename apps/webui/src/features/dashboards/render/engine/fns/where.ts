import type { WhereOp } from '@harnesys/contracts';
import { WHERE_OPS } from '@harnesys/contracts';
import { readPath } from '../path';
import { orderingOf } from './ordering.ts';
import type { ExprFn } from './types.ts';
import { asList, deepEqual, isPlainObject, stringOf } from './values.ts';

function isWhereOp(value: unknown): value is WhereOp {
  return typeof value === 'string' && (WHERE_OPS as readonly string[]).includes(value);
}

function equal(left: unknown, right: unknown): boolean {
  if (left === null || left === undefined) {
    return right === null || right === undefined;
  }
  if (right === null || right === undefined) {
    return false;
  }
  return deepEqual(left, right);
}

function contains(left: unknown, right: unknown): boolean {
  if (right === null || right === undefined) {
    return false;
  }
  if (Array.isArray(left)) {
    return left.some((entry) => equal(entry, right));
  }
  if (left === null || left === undefined) {
    return false;
  }
  return stringOf(left).includes(stringOf(right));
}

function ordered(left: unknown, right: unknown): number | null {
  return orderingOf([left, right]);
}

function matches(value: unknown, op: WhereOp, right: unknown): boolean {
  switch (op) {
    case 'eq':
      return equal(value, right);
    case 'neq':
      return !equal(value, right);
    case 'gt': {
      const ordering = ordered(value, right);
      return ordering !== null && ordering > 0;
    }
    case 'gte': {
      const ordering = ordered(value, right);
      return ordering !== null && ordering >= 0;
    }
    case 'lt': {
      const ordering = ordered(value, right);
      return ordering !== null && ordering < 0;
    }
    case 'lte': {
      const ordering = ordered(value, right);
      return ordering !== null && ordering <= 0;
    }
    case 'contains':
      return contains(value, right);
    case 'exists':
      return value !== null && value !== undefined;
    case 'missing':
      return value === null || value === undefined;
  }
}

/**
 * Comparison filter over a list: `where(list, path, op, value?)`. Unlike
 * `filter` (truthiness only), `op` is one of `WHERE_OPS` and is checked by the
 * guard when it is a literal. An invalid list, path or op returns the input
 * unchanged, matching the other list transforms.
 */
export const where: ExprFn = (args) => {
  const list = asList(args[0]);
  const path = args[1];
  const op = args[2];
  if (list === null || typeof path !== 'string' || path === '' || !isWhereOp(op)) {
    return args[0];
  }
  if (op !== 'exists' && op !== 'missing' && args.length < 4) {
    return args[0];
  }
  const right = args[3];
  return list.filter((entry) => {
    const value = isPlainObject(entry) ? readPath(entry, path) : undefined;
    return matches(value, op, right);
  });
};
