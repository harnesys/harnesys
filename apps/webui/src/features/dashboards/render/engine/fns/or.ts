import type { ExprFn } from './types.ts';
import { isTruthy } from './values.ts';

export const or: ExprFn = (args) => args.some(isTruthy);
