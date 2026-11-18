import { z } from 'zod';

/** JSON object shape: every value is a JSON value. */
export interface JsonObject {
  [key: string]: JsonValue;
}

/** JSON value: the only data a widget document may carry. */
export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export interface ExprRef extends JsonObject {
  ref: string;
}

export interface ExprTemplate extends JsonObject {
  tpl: string;
}

export interface ExprFnCall extends JsonObject {
  fn: ExprFnName;
  args: Expr[];
}

export interface ExprLiteral extends JsonObject {
  lit: JsonValue;
}

/**
 * JSON-only expression. A plain value is a literal; plain objects and arrays
 * are walked recursively. Marker objects are `{ ref }`, `{ tpl }`,
 * `{ fn, args }`, and `{ lit }`.
 */
export type Expr = JsonValue | ExprRef | ExprTemplate | ExprFnCall | ExprLiteral;

export interface ExprFnSignature {
  minArgs: number;
  maxArgs: number;
}

export const WHERE_OPS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'exists',
  'missing',
] as const;

export type WhereOp = (typeof WHERE_OPS)[number];

export const WhereOpSchema = z.enum(WHERE_OPS);

export const EXPR_FN_SIGNATURES = {
  count: { minArgs: 1, maxArgs: 1 },
  sum: { minArgs: 1, maxArgs: 1 },
  avg: { minArgs: 1, maxArgs: 1 },
  min: { minArgs: 1, maxArgs: 1 },
  max: { minArgs: 1, maxArgs: 1 },
  first: { minArgs: 1, maxArgs: 1 },
  last: { minArgs: 1, maxArgs: 1 },
  pluck: { minArgs: 2, maxArgs: 2 },
  filter: { minArgs: 2, maxArgs: 2 },
  where: { minArgs: 3, maxArgs: 4 },
  sort: { minArgs: 1, maxArgs: 2 },
  limit: { minArgs: 2, maxArgs: 2 },
  groupCount: { minArgs: 1, maxArgs: 2 },
  concat: { minArgs: 1, maxArgs: Number.POSITIVE_INFINITY },
  join: { minArgs: 1, maxArgs: 2 },
  format: { minArgs: 1, maxArgs: 2 },
  eq: { minArgs: 2, maxArgs: 2 },
  neq: { minArgs: 2, maxArgs: 2 },
  gt: { minArgs: 2, maxArgs: 2 },
  gte: { minArgs: 2, maxArgs: 2 },
  lt: { minArgs: 2, maxArgs: 2 },
  lte: { minArgs: 2, maxArgs: 2 },
  and: { minArgs: 1, maxArgs: Number.POSITIVE_INFINITY },
  or: { minArgs: 1, maxArgs: Number.POSITIVE_INFINITY },
  not: { minArgs: 1, maxArgs: 1 },
  if: { minArgs: 2, maxArgs: 3 },
  coalesce: { minArgs: 1, maxArgs: Number.POSITIVE_INFINITY },
  length: { minArgs: 1, maxArgs: 1 },
  pick: { minArgs: 2, maxArgs: 2 },
} as const satisfies Record<string, ExprFnSignature>;

export type ExprFnName = keyof typeof EXPR_FN_SIGNATURES;

const EXPR_FN_NAMES = Object.keys(EXPR_FN_SIGNATURES) as [ExprFnName, ...ExprFnName[]];

export const ExprFnNameSchema = z.enum(EXPR_FN_NAMES);

const REF_SEGMENT = '[A-Za-z0-9_$-]+';
const REF_PATH_PATTERN = new RegExp(
  `^${REF_SEGMENT}(?:\\[\\d+\\])*(?:\\.${REF_SEGMENT}(?:\\[\\d+\\])*)*$`,
);

const TEMPLATE_TOKEN_PATTERN = /\{\{([^{}]*)\}\}/g;

const MARKER_KEYS = ['ref', 'tpl', 'fn', 'args', 'lit'] as const;

function templateIssues(value: string): string[] {
  const issues: string[] = [];
  for (const match of value.matchAll(TEMPLATE_TOKEN_PATTERN)) {
    const token = match[1] ?? '';
    if (token.trim() === '') {
      issues.push('template token is empty');
      continue;
    }
    if (!REF_PATH_PATTERN.test(token)) {
      issues.push(`template token "${token}" is not a reference path`);
    }
  }
  const remainder = value.replace(TEMPLATE_TOKEN_PATTERN, '');
  if (remainder.includes('{') || remainder.includes('}')) {
    issues.push('template braces are unbalanced');
  }
  return issues;
}

const RefSchema = z.strictObject({
  ref: z
    .string()
    .min(1)
    .max(512)
    .regex(REF_PATH_PATTERN, 'ref must be a dotted path such as a.b[0].c'),
});

const TemplateSchema = z.strictObject({
  tpl: z
    .string()
    .max(4096)
    .superRefine((value, ctx) => {
      for (const message of templateIssues(value)) {
        ctx.addIssue({ code: 'custom', message });
      }
    }),
});

const FnSchema = z.strictObject({
  fn: ExprFnNameSchema,
  args: z.array(z.lazy(() => ExprSchema)).max(64),
});

const LitSchema = z.strictObject({
  lit: JsonValueSchema,
});

/** Recursive JSON-only expression schema. */
export const ExprSchema: z.ZodType<Expr> = z.lazy(() => {
  const plainObject = z.record(z.string(), ExprSchema).superRefine((value, ctx) => {
    for (const key of MARKER_KEYS) {
      if (Object.hasOwn(value, key)) {
        ctx.addIssue({
          code: 'custom',
          message: `object has marker key "${key}" but is not a valid ${key} marker`,
        });
      }
    }
  });
  return z.union([
    RefSchema,
    TemplateSchema,
    FnSchema,
    LitSchema,
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(ExprSchema),
    plainObject,
  ]);
});
