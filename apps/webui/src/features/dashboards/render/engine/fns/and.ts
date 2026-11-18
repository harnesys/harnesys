import type { ExprFn } from './types.ts';
import { isTruthy } from './values.ts';

export const and: ExprFn = (args) => args.length > 0 && args.every(isTruthy);
