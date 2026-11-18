import type { ExprFn } from './types.ts';
import { isTruthy } from './values.ts';

export const not: ExprFn = (args) => !isTruthy(args[0]);
