import type { ExprFn } from './types.ts';

export const concat: ExprFn = (args) => {
  const result: unknown[] = [];
  for (const value of args) {
    if (value === null || value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      result.push(...value);
    } else {
      result.push(value);
    }
  }
  return result;
};
