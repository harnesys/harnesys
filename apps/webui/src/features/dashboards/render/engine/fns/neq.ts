import { eq } from './eq';
import type { ExprFn } from './types.ts';

export const neq: ExprFn = (args) => !eq(args);
