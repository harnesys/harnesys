import type { ExprFn } from './types.ts';

export const coalesce: ExprFn = (args) => {
  for (const value of args) {
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
};
