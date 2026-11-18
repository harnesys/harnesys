import type { ExprFnName } from '@harnesys/contracts';
import { and } from './and';
import { avg } from './avg';
import { coalesce } from './coalesce';
import { concat } from './concat';
import { count } from './count';
import { eq } from './eq';
import { filter } from './filter';
import { first } from './first';
import { format } from './format';
import { groupCount } from './group-count';
import { gt } from './gt';
import { gte } from './gte';
import { ifFn } from './if';
import { join } from './join';
import { last } from './last';
import { length } from './length';
import { limit } from './limit';
import { lt } from './lt';
import { lte } from './lte';
import { max } from './max';
import { min } from './min';
import { neq } from './neq';
import { not } from './not';
import { or } from './or';
import { pick } from './pick';
import { pluck } from './pluck';
import { sort } from './sort';
import { sum } from './sum';
import type { ExprFn } from './types.ts';

export type { ExprFn } from './types.ts';

export const EXPR_FNS = {
  count,
  sum,
  avg,
  min,
  max,
  first,
  last,
  pluck,
  filter,
  sort,
  limit,
  groupCount,
  concat,
  join,
  format,
  eq,
  neq,
  gt,
  gte,
  lt,
  lte,
  and,
  or,
  not,
  if: ifFn,
  coalesce,
  length,
  pick,
} satisfies Record<ExprFnName, ExprFn>;
