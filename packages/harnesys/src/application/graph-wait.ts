import { WAIT_DELAY_MS_MAX } from '../constants.ts';
import type { InterruptReason } from '../domain/agent-definition.ts';
import { codedRunError } from '../domain/errors.ts';
import type { Expr } from '../domain/expr.ts';
import type { JsonSchema } from '../domain/json-schema.ts';
import { evalExpr, type Slots } from './expr-eval.ts';
export interface WaitNodeSpec {
  type: 'control:wait';
  delayMs?: number;
  untilMs?: Expr;
  awaitKey?: Expr;
  timeoutMs?: number;
  onTimeout?: 'fail' | 'continue' | 'interrupt';
  reason?: InterruptReason;
  resumeSchema?: JsonSchema;
}
export interface PreparedWait {
  mode: 'sleep' | 'gate' | 'await';
  fireAt?: number;
  onTimeout?: 'fail' | 'continue' | 'interrupt';
  wakeKey?: string;
  reason: InterruptReason;
  resumeSchema: JsonSchema;
  interruptId: string;
  source: 'timer' | 'wait';
}
const DEFAULT_RESUME: JsonSchema = {
  type: 'object',
  properties: { timedOut: { type: 'boolean' } },
};
export function prepareWait(node: WaitNodeSpec, slots: Slots): PreparedWait {
  const hasDelay = node.delayMs !== undefined;
  const hasUntil = node.untilMs !== undefined;
  const hasAwait = node.awaitKey !== undefined;
  if ((hasDelay ? 1 : 0) + (hasUntil ? 1 : 0) + (hasAwait ? 1 : 0) > 1) {
    throw codedRunError('wait_mode', 'delayMs, untilMs and awaitKey are mutually exclusive');
  }
  const interruptId = crypto.randomUUID();
  if (hasAwait) {
    if (node.timeoutMs === undefined) {
      throw codedRunError('wait_await_timeout', 'awaitKey requires timeoutMs');
    }
    if (!Number.isFinite(node.timeoutMs) || node.timeoutMs < 1) {
      throw codedRunError('wait_timeout', 'timeoutMs must be >= 1');
    }
    const raw = evalExpr(node.awaitKey as string, slots);
    if (typeof raw !== 'string' || raw.length === 0) {
      throw codedRunError('wait_mode', 'awaitKey must evaluate to a non-empty string');
    }
    return {
      mode: 'await',
      fireAt: Date.now() + node.timeoutMs,
      onTimeout: node.onTimeout ?? 'continue',
      wakeKey: raw,
      reason: node.reason ?? 'wait',
      resumeSchema: node.resumeSchema ?? DEFAULT_RESUME,
      interruptId,
      source: 'wait',
    };
  }
  if (hasDelay || hasUntil) {
    if (node.timeoutMs !== undefined) {
      throw codedRunError('wait_mode', 'timeoutMs is not valid with sleep');
    }
    let fireAt: number;
    if (hasDelay) {
      const delay = node.delayMs as number;
      if (!Number.isFinite(delay) || delay < 1 || delay > WAIT_DELAY_MS_MAX) {
        throw codedRunError('wait_delay', `invalid delayMs ${delay}`);
      }
      fireAt = Date.now() + delay;
    } else {
      const raw = evalExpr(node.untilMs as string, slots);
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        throw codedRunError('wait_mode', 'untilMs must evaluate to a finite number');
      }
      fireAt = raw;
    }
    return {
      mode: 'sleep',
      fireAt,
      reason: node.reason ?? 'wait',
      resumeSchema: node.resumeSchema ?? DEFAULT_RESUME,
      interruptId,
      source: 'timer',
    };
  }
  let fireAt: number | undefined;
  if (node.timeoutMs !== undefined) {
    if (!Number.isFinite(node.timeoutMs) || node.timeoutMs < 1) {
      throw codedRunError('wait_timeout', 'timeoutMs must be >= 1');
    }
    fireAt = Date.now() + node.timeoutMs;
  }
  const onTimeout = node.onTimeout ?? (fireAt !== undefined ? 'fail' : undefined);
  return {
    mode: 'gate',
    fireAt,
    onTimeout,
    reason: node.reason ?? 'wait',
    resumeSchema: node.resumeSchema ?? DEFAULT_RESUME,
    interruptId,
    source: 'wait',
  };
}
