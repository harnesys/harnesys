import type { AgentBudget } from '../../domain/agent-definition.ts';

type TuningField = 'warnAtSteps' | 'closeOnExhaustion' | 'extendDefaultPct';

interface TuningSpec {
  json: Record<string, unknown>;
  expect: string;
  isValue: (value: unknown) => boolean;
}

function nonNegativeNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

const TUNING: Record<TuningField, TuningSpec> = {
  warnAtSteps: {
    json: { type: 'integer', minimum: 0 },
    expect: 'a non-negative number',
    isValue: nonNegativeNumber,
  },
  closeOnExhaustion: {
    json: { type: 'boolean' },
    expect: 'a boolean',
    isValue: (value) => typeof value === 'boolean',
  },
  extendDefaultPct: {
    json: { type: 'integer', minimum: 0 },
    expect: 'a non-negative number',
    isValue: nonNegativeNumber,
  },
};

const LIMITS = {
  maxSteps: { type: 'integer', minimum: 1 },
  maxTokens: { type: 'integer', minimum: 1 },
  deadlineMs: { type: 'integer', minimum: 1 },
} as const;

export const BUDGET_LIMIT_FIELDS = ['maxSteps', 'maxTokens', 'deadlineMs'] as const;

export const BUDGET_TUNING_TEXT =
  'Tuning: warnAtSteps (steps-left warning threshold, 0 disables, default 3), closeOnExhaustion (spend the last step on a toolless closing report instead of stopping), extendDefaultPct (percent of the limit added by one default extension, default 25).';

export function budgetJsonSchema(input: {
  policyEnum: readonly string[];
  description: string;
}): Record<string, unknown> {
  return {
    type: 'object',
    description: input.description,
    properties: {
      ...LIMITS,
      policy: { type: 'string', enum: [...input.policyEnum] },
      ...Object.fromEntries(Object.entries(TUNING).map(([key, spec]) => [key, spec.json])),
    },
    additionalProperties: false,
  };
}

export function validateBudgetTuning(
  rec: Record<string, unknown>,
): { fields: AgentBudget } | { error: string } {
  const fields: AgentBudget = {};
  const target = fields as Record<TuningField, unknown>;
  for (const [key, spec] of Object.entries(TUNING) as [TuningField, TuningSpec][]) {
    const value = rec[key];
    if (value === undefined) {
      continue;
    }
    if (!spec.isValue(value)) {
      return { error: `budget.${key} must be ${spec.expect}` };
    }
    target[key] = value;
  }
  return { fields };
}
