import type { Action, ActionList, Expr } from '@harnesys/contracts';
import { needsConfirm, orgApiRiskPrefix } from '@harnesys/contracts';
import type { ExprDiagnostic, ExprRoots, WidgetSourceStatus } from './expr-eval';
import { evaluateExpr } from './expr-eval';
import { toQueryRecord } from './query';

export interface ApiCallRequest {
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
}

export type ActionNotifyLevel = 'info' | 'success' | 'error';

export interface ActionConfirmRequest {
  message: string;
  action: Action;
}

/**
 * Side effects the runner may perform. Default implementations live in the
 * React binding (`use-widget-runtime.ts`); tests inject fakes.
 */
export interface ActionEffects {
  callApi(request: ApiCallRequest): Promise<unknown>;
  refetch(sourceId: string): void | Promise<void>;
  invokeExternal(sourceId: string, params?: unknown): Promise<unknown>;
  navigate(to: string): void;
  notify(message: string, level: ActionNotifyLevel): void;
  confirm(request: ActionConfirmRequest): Promise<boolean>;
  setState(key: string, value: unknown): void;
  getState(): Record<string, unknown>;
}

export interface ActionRunOptions {
  event?: unknown;
  row?: unknown;
  org?: { id: string };
  sources?: Record<string, unknown>;
  status?: Record<string, WidgetSourceStatus>;
  derived?: Record<string, unknown>;
  diagnostics?: ExprDiagnostic[];
}

type CallApiAction = Extract<Action, { type: 'callApi' }>;

function resolve(expr: Expr, effects: ActionEffects, options: ActionRunOptions): unknown {
  const roots: ExprRoots = {
    state: effects.getState(),
    sources: options.sources ?? {},
    status: options.status ?? {},
    derived: options.derived ?? {},
    event: options.event ?? null,
    row: options.row ?? null,
    org: options.org ?? { id: '' },
  };
  return evaluateExpr(expr, roots, options.diagnostics);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function textOf(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function confirmMessage(action: CallApiAction, path: string): string {
  if (typeof action.confirm === 'string') {
    return action.confirm;
  }
  const base = `Run ${action.method} ${path}?`;
  const prefix = orgApiRiskPrefix(path);
  return prefix === null
    ? base
    : `${base} This call targets a privileged area (${prefix}) and uses your session permissions.`;
}

async function execute(
  actions: Action[],
  effects: ActionEffects,
  options: ActionRunOptions,
): Promise<void> {
  for (const action of actions) {
    await executeOne(action, effects, options);
  }
}

async function runCallApi(
  action: CallApiAction,
  effects: ActionEffects,
  options: ActionRunOptions,
): Promise<void> {
  const path = textOf(resolve(action.path, effects, options));
  if (path.length === 0) {
    throw new Error('callApi path did not resolve to a string');
  }
  const confirmed =
    !needsConfirm(action) ||
    (await effects.confirm({ message: confirmMessage(action, path), action }));
  if (!confirmed) {
    return;
  }
  try {
    const result = await effects.callApi({
      method: action.method,
      path,
      query: toQueryRecord(
        action.query === undefined ? undefined : resolve(action.query, effects, options),
      ),
      body: action.body === undefined ? undefined : resolve(action.body, effects, options),
    });
    if (action.resultTo) {
      effects.setState(action.resultTo, result);
    }
    if (action.successMessage) {
      effects.notify(action.successMessage, 'success');
    }
    if (action.onSuccess) {
      await execute(action.onSuccess, effects, options);
    }
  } catch (error) {
    if (action.onError) {
      await execute(action.onError, effects, options);
    }
    throw error;
  }
}

async function executeOne(
  action: Action,
  effects: ActionEffects,
  options: ActionRunOptions,
): Promise<void> {
  switch (action.type) {
    case 'setState':
      effects.setState(action.key, resolve(action.value, effects, options));
      return;
    case 'incrementState': {
      const current = Number(effects.getState()[action.key] ?? 0);
      const safe = Number.isFinite(current) ? current : 0;
      const delta = Number(resolve(action.delta, effects, options));
      effects.setState(action.key, safe + (Number.isFinite(delta) ? delta : 0));
      return;
    }
    case 'toggleState':
      effects.setState(action.key, !effects.getState()[action.key]);
      return;
    case 'callApi':
      await runCallApi(action, effects, options);
      return;
    case 'refetchSource':
      await effects.refetch(action.sourceId);
      return;
    case 'invokeExternal': {
      const params =
        action.params === undefined ? undefined : resolve(action.params, effects, options);
      const result = await effects.invokeExternal(action.sourceId, params);
      if (action.resultTo) {
        effects.setState(action.resultTo, result);
      }
      return;
    }
    case 'navigate': {
      const to = textOf(resolve(action.to, effects, options));
      if (to.length > 0) {
        effects.navigate(to);
      }
      return;
    }
    case 'notify':
      effects.notify(textOf(resolve(action.message, effects, options)), action.level);
      return;
    case 'sequence':
      await execute(action.actions, effects, options);
      return;
  }
}

/**
 * Run actions in order, awaiting each step. A failure stops the list and is
 * reported through `notify`; a declined confirmation is not a failure.
 */
export async function runActions(
  actions: ActionList,
  effects: ActionEffects,
  options: ActionRunOptions = {},
): Promise<void> {
  const list = Array.isArray(actions) ? actions : [actions];
  try {
    await execute(list, effects, options);
  } catch (error) {
    effects.notify(messageOf(error), 'error');
  }
}
