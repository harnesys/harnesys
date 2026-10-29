import type { AgentBudget, BudgetExtension, BudgetLimitKind } from '../domain/agent-definition.ts';

export interface BudgetState {
  budget?: AgentBudget;
  steps: number;
  tokens: number;
  startedAt: number;
  extend?: BudgetExtension;
  deadlineAt?: number;
}

export interface BudgetOver {
  kind: BudgetLimitKind;
  limit: number;
  used: number;
}

export type BudgetWarnLevel = 'soon' | 'last';

export interface BudgetLeft {
  stepsLeft?: number;
  stepsTotal?: number;
  tokensLeft?: number;
  tokensTotal?: number;
  msLeft?: number;
  warn?: BudgetWarnLevel;
}

export const DEFAULT_WARN_AT_STEPS = 3;
export const DEFAULT_EXTEND_PERCENT = 25;

export function effectiveSteps(state: BudgetState): number | undefined {
  if (state.budget?.maxSteps === undefined) {
    return undefined;
  }
  return state.budget.maxSteps + (state.extend?.steps ?? 0);
}

export function effectiveTokens(state: BudgetState): number | undefined {
  if (state.budget?.maxTokens === undefined) {
    return undefined;
  }
  return state.budget.maxTokens + (state.extend?.tokens ?? 0);
}

export function effectiveDeadlineAt(state: BudgetState): number | undefined {
  const base = state.budget?.deadlineMs;
  if (base === undefined) {
    return undefined;
  }
  const fromBase = state.startedAt + base;
  return state.deadlineAt === undefined ? fromBase : Math.max(fromBase, state.deadlineAt);
}

export function budgetOver(state: BudgetState, now: number): BudgetOver | null {
  const maxSteps = effectiveSteps(state);
  if (maxSteps !== undefined && state.steps >= maxSteps) {
    return { kind: 'steps', limit: maxSteps, used: state.steps };
  }
  const maxTokens = effectiveTokens(state);
  if (maxTokens !== undefined && state.tokens >= maxTokens) {
    return { kind: 'tokens', limit: maxTokens, used: state.tokens };
  }
  const deadlineAt = effectiveDeadlineAt(state);
  if (deadlineAt !== undefined && now > deadlineAt) {
    return { kind: 'deadline', limit: deadlineAt - state.startedAt, used: now - state.startedAt };
  }
  return null;
}

export function budgetReason(over: BudgetOver): string {
  if (over.kind === 'steps') {
    return `Step budget of ${over.limit} reached`;
  }
  if (over.kind === 'tokens') {
    return `Token budget of ${over.limit} reached`;
  }
  return `Deadline of ${over.limit}ms exceeded`;
}

export function budgetLimitOf(state: BudgetState, kind: BudgetLimitKind): number | undefined {
  if (kind === 'steps') {
    return effectiveSteps(state);
  }
  if (kind === 'tokens') {
    return effectiveTokens(state);
  }
  const deadlineAt = effectiveDeadlineAt(state);
  return deadlineAt === undefined ? undefined : deadlineAt - state.startedAt;
}

export function budgetLeft(state: BudgetState, now: number): BudgetLeft | undefined {
  if (!state.budget) {
    return undefined;
  }
  const out: BudgetLeft = {};
  let any = false;
  const maxSteps = effectiveSteps(state);
  if (maxSteps !== undefined) {
    any = true;
    out.stepsLeft = Math.max(0, maxSteps - state.steps);
    out.stepsTotal = maxSteps;
    const warnAt = state.budget.warnAtSteps ?? DEFAULT_WARN_AT_STEPS;
    if (warnAt > 0 && out.stepsLeft <= warnAt) {
      out.warn = out.stepsLeft <= 1 ? 'last' : 'soon';
    }
  }
  const maxTokens = effectiveTokens(state);
  if (maxTokens !== undefined) {
    any = true;
    out.tokensLeft = Math.max(0, maxTokens - state.tokens);
    out.tokensTotal = maxTokens;
  }
  const deadlineAt = effectiveDeadlineAt(state);
  if (deadlineAt !== undefined) {
    any = true;
    out.msLeft = Math.max(0, deadlineAt - now);
  }
  return any ? out : undefined;
}

export function budgetUsedOf(state: BudgetState, kind: BudgetLimitKind, now: number): number {
  if (kind === 'steps') {
    return state.steps;
  }
  if (kind === 'tokens') {
    return state.tokens;
  }
  return now - state.startedAt;
}

export function defaultExtension(state: BudgetState, kind: BudgetLimitKind): number {
  const limit = budgetLimitOf(state, kind);
  if (limit === undefined) {
    return 1;
  }
  const pct = state.budget?.extendDefaultPct ?? DEFAULT_EXTEND_PERCENT;
  return Math.max(1, Math.ceil((limit * pct) / 100));
}

export function extendState(
  state: BudgetState,
  kind: BudgetLimitKind,
  amount: number,
  now: number,
): BudgetState {
  if (kind === 'deadline') {
    const base = effectiveDeadlineAt(state) ?? now;
    return { ...state, deadlineAt: Math.max(base, now) + amount };
  }
  const field = kind === 'steps' ? 'steps' : 'tokens';
  const current = state.extend?.[field] ?? 0;
  return { ...state, extend: { ...state.extend, [field]: current + amount } };
}

export function budgetInterruptId(runId: string, nodeId: string, stop: number): string {
  return `budget/${runId}/${nodeId}/${stop}`;
}

export interface BudgetRemainder {
  stepsLeft?: number;
  tokensLeft?: number;
  msLeft?: number;
}

export function budgetRemainder(state: BudgetState, now: number): BudgetRemainder {
  const out: BudgetRemainder = {};
  const maxSteps = effectiveSteps(state);
  if (maxSteps !== undefined) {
    out.stepsLeft = Math.max(0, maxSteps - state.steps);
  }
  const maxTokens = effectiveTokens(state);
  if (maxTokens !== undefined) {
    out.tokensLeft = Math.max(0, maxTokens - state.tokens);
  }
  const deadlineAt = effectiveDeadlineAt(state);
  if (deadlineAt !== undefined) {
    out.msLeft = Math.max(0, deadlineAt - now);
  }
  return out;
}

export function childBudgetInPool(
  remainder: BudgetRemainder,
  requested: AgentBudget | undefined,
  share: number,
): AgentBudget {
  const parts = Math.max(1, share);
  const out: AgentBudget = {};
  if (remainder.stepsLeft !== undefined) {
    const shareSteps = Math.max(1, Math.floor(remainder.stepsLeft / parts));
    out.maxSteps =
      requested?.maxSteps === undefined ? shareSteps : Math.min(requested.maxSteps, shareSteps);
  } else if (requested?.maxSteps !== undefined) {
    out.maxSteps = requested.maxSteps;
  }
  if (remainder.tokensLeft !== undefined) {
    const shareTokens = Math.max(1, Math.floor(remainder.tokensLeft / parts));
    out.maxTokens =
      requested?.maxTokens === undefined ? shareTokens : Math.min(requested.maxTokens, shareTokens);
  } else if (requested?.maxTokens !== undefined) {
    out.maxTokens = requested.maxTokens;
  }
  if (remainder.msLeft !== undefined) {
    out.deadlineMs =
      requested?.deadlineMs === undefined
        ? remainder.msLeft
        : Math.min(requested.deadlineMs, remainder.msLeft);
  } else if (requested?.deadlineMs !== undefined) {
    out.deadlineMs = requested.deadlineMs;
  }
  return out;
}
