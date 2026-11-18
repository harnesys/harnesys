import { z } from 'zod';
import type { Expr } from './expr.ts';
import { ExprSchema } from './expr.ts';

export const ActionMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH']);
export type ActionMethod = z.infer<typeof ActionMethodSchema>;

const StateKeySchema = z.string().min(1).max(64);
const SourceIdSchema = z.string().min(1).max(64);

export interface SetStateAction {
  type: 'setState';
  key: string;
  value: Expr;
}

export interface IncrementStateAction {
  type: 'incrementState';
  key: string;
  delta: Expr;
}

export interface ToggleStateAction {
  type: 'toggleState';
  key: string;
}

export interface CallApiAction {
  type: 'callApi';
  method: ActionMethod;
  path: Expr;
  query?: Expr;
  body?: Expr;
  confirm?: boolean | string;
  resultTo?: string;
  successMessage?: string;
  onSuccess?: Action[];
  onError?: Action[];
}

export interface RefetchSourceAction {
  type: 'refetchSource';
  sourceId: string;
}

export interface InvokeExternalAction {
  type: 'invokeExternal';
  sourceId: string;
  params?: Expr;
  resultTo?: string;
}

export interface NavigateAction {
  type: 'navigate';
  to: Expr;
}

export interface NotifyAction {
  type: 'notify';
  message: Expr;
  level: 'info' | 'success' | 'error';
}

export interface SequenceAction {
  type: 'sequence';
  actions: Action[];
}

/** Action dispatched by an item event or by a legacy item `action` field. */
export type Action =
  | SetStateAction
  | IncrementStateAction
  | ToggleStateAction
  | CallApiAction
  | RefetchSourceAction
  | InvokeExternalAction
  | NavigateAction
  | NotifyAction
  | SequenceAction;

export type ActionList = Action | Action[];

export const ActionSchema: z.ZodType<Action> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('setState'),
      key: StateKeySchema,
      value: ExprSchema,
    }),
    z.object({
      type: z.literal('incrementState'),
      key: StateKeySchema,
      delta: ExprSchema,
    }),
    z.object({
      type: z.literal('toggleState'),
      key: StateKeySchema,
    }),
    z.object({
      type: z.literal('callApi'),
      method: ActionMethodSchema.default('POST'),
      path: ExprSchema,
      query: ExprSchema.optional(),
      body: ExprSchema.optional(),
      confirm: z.union([z.boolean(), z.string().min(1).max(200)]).optional(),
      resultTo: StateKeySchema.optional(),
      successMessage: z.string().min(1).max(120).optional(),
      onSuccess: z.array(ActionSchema).max(20).optional(),
      onError: z.array(ActionSchema).max(20).optional(),
    }),
    z.object({
      type: z.literal('refetchSource'),
      sourceId: SourceIdSchema,
    }),
    z.object({
      type: z.literal('invokeExternal'),
      sourceId: SourceIdSchema,
      params: ExprSchema.optional(),
      resultTo: StateKeySchema.optional(),
    }),
    z.object({
      type: z.literal('navigate'),
      to: ExprSchema,
    }),
    z.object({
      type: z.literal('notify'),
      message: ExprSchema,
      level: z.enum(['info', 'success', 'error']).default('info'),
    }),
    z.object({
      type: z.literal('sequence'),
      actions: z.array(ActionSchema).min(1).max(50),
    }),
  ]),
);

export const ActionListSchema: z.ZodType<ActionList> = z.union([
  ActionSchema,
  z.array(ActionSchema).max(50),
]);

/** Legacy name for the single `WidgetItem.action` field. */
export const WidgetActionSchema = ActionSchema;
export type WidgetAction = Action;

/**
 * Whether the runtime must ask before running the action. Only an explicit
 * `confirm: false` on a `callApi` skips the dialog, and only GET calls never
 * default to asking.
 */
export function needsConfirm(action: Action): boolean {
  if (action.type !== 'callApi') {
    return false;
  }
  if (action.confirm === false) {
    return false;
  }
  if (action.confirm === true || typeof action.confirm === 'string') {
    return true;
  }
  return action.method !== 'GET';
}
