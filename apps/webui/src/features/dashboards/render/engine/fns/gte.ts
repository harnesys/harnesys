import { orderingOf } from './ordering.ts';
import type { ExprFn } from './types.ts';

export const gte: ExprFn = (args) => {
  const ordering = orderingOf(args);
  return ordering === null ? null : ordering >= 0;
};
