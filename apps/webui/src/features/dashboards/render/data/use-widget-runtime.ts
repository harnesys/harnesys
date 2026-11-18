import type { ActionList, Expr, JsonValue } from '@harnesys/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { studioPath } from '@/shared/config/routes';
import { toast } from '@/shared/ui/toast';
import type { ActionEffects } from '../engine/action-runner';
import { runActions } from '../engine/action-runner';
import { evaluateDerived } from '../engine/derived';
import type { ExprDiagnostic, WidgetSourceStatus } from '../engine/expr-eval';
import { internalOrgRoute } from '../engine/navigate';
import { orgApiRequest, type WidgetApiCallInput } from './source-client';
import type { WidgetSourcesController } from './use-widget-sources';

export interface ActionDispatchOptions {
  event?: unknown;
  row?: unknown;
}

export interface WidgetStateRef {
  current: Record<string, unknown>;
}

export interface WidgetRuntime {
  state: Record<string, unknown>;
  setState(key: string, value: unknown): void;
  dispatch(actions: ActionList, options?: ActionDispatchOptions): Promise<void>;
  orgApi(input: WidgetApiCallInput): Promise<unknown>;
  /** Computed `doc.derived` values, the `derived` root for every consumer. */
  derived: Record<string, unknown>;
  /** Per-source status map, shared with item bindings through the `status` root. */
  sourceStatus: Record<string, WidgetSourceStatus>;
  retrySource(sourceId: string): void;
}

/** Promise-shaped confirmation prompt; the AlertDialog in the renderer fills it. */
export type ConfirmRequest = (message: string) => Promise<boolean>;

interface UseWidgetRuntimeArgs {
  orgId: string;
  initialState: Record<string, unknown>;
  derivedDefs: Record<string, Expr>;
  src: WidgetSourcesController;
  /** Defaults to declining: a missing prompt never runs a confirmed mutation. */
  requestConfirm?: ConfirmRequest;
  /** Stable holder shared with the sources hook so params read live state. */
  stateRef?: WidgetStateRef;
  /** Doc keys whose live values are written back to the server. */
  persistedKeys?: string[];
  onPersistedChange?: (state: Record<string, JsonValue>) => void;
}

const PERSIST_DEBOUNCE_MS = 500;

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Re-seed live state from an edited doc. A key is taken from the doc when it is
 * new or when its initial value changed (an inspector edit must reach the
 * canvas); otherwise the live value survives, modified by the user or not.
 * Keys dropped from the doc disappear unless the user modified them.
 */
function reseedState(
  live: Record<string, unknown>,
  nextInitial: Record<string, unknown>,
  prevInitial: Record<string, unknown>,
  modifiedKeys: ReadonlySet<string>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const [key, nextValue] of Object.entries(nextInitial)) {
    const hadInitial = key in prevInitial;
    const initialChanged = hadInitial && !sameValue(prevInitial[key], nextValue);
    merged[key] = !hadInitial || initialChanged || !(key in live) ? nextValue : live[key];
  }
  for (const [key, liveValue] of Object.entries(live)) {
    if (!(key in nextInitial) && modifiedKeys.has(key)) {
      merged[key] = liveValue;
    }
  }
  return merged;
}

/**
 * Reactive scope of one widget instance: local state, the derived values, and
 * the declarative action dispatcher. State lives in React (per mount) and
 * re-seeds from doc edits; sources stay owned by useWidgetSources and the
 * action runner owns action semantics. Actions are the only sanctioned way for
 * primitives to couple: button -> incrementState -> metric re-renders via its
 * binding. Org API mutations ask before they run (F3).
 */
export function useWidgetRuntime({
  orgId,
  initialState,
  derivedDefs,
  src,
  requestConfirm,
  stateRef,
  persistedKeys,
  onPersistedChange,
}: UseWidgetRuntimeArgs): WidgetRuntime {
  const navigate = useNavigate();
  const [, setStateRecord] = useState<Record<string, unknown>>(initialState);
  const ownStateRef = useRef<Record<string, unknown>>(initialState);
  const liveRef = stateRef ?? ownStateRef;
  const seedRef = useRef<{ key: string; value: Record<string, unknown> }>({
    key: JSON.stringify(initialState),
    value: initialState,
  });
  const modifiedKeysRef = useRef<Set<string>>(new Set());

  // Stable on purpose: the re-seed effect depends on commit's identity.
  const commit = useCallback(
    (next: Record<string, unknown>): void => {
      // Content-guarded: an idempotent commit must never re-render with a new
      // object for the same values (grid/layout sync feeds on state identity).
      if (JSON.stringify(liveRef.current) === JSON.stringify(next)) {
        return;
      }
      liveRef.current = next;
      setStateRecord(next);
    },
    [liveRef],
  );

  const state = liveRef.current;
  const persistRef = useRef(onPersistedChange);
  useEffect(() => {
    persistRef.current = onPersistedChange;
  });
  const persistReadyRef = useRef(false);
  const lastPersistedRef = useRef<string | null>(null);

  // Re-seed from an edited doc in an effect, never during render: render-phase
  // setState here produced nested-update loops when the persisted-state query
  // and the doc draft changed together.
  const initialKey = JSON.stringify(initialState);
  useEffect(() => {
    if (seedRef.current.key === initialKey) {
      return;
    }
    const prevInitial = seedRef.current.value;
    seedRef.current = { key: initialKey, value: initialState };
    commit(reseedState(liveRef.current, initialState, prevInitial, modifiedKeysRef.current));
  }, [initialKey, liveRef.current, initialState, commit]);

  useEffect(() => {
    if (!persistReadyRef.current) {
      persistReadyRef.current = true;
      return;
    }
    const write = persistRef.current;
    if (write === undefined || persistedKeys === undefined || persistedKeys.length === 0) {
      return;
    }
    const timer = setTimeout(() => {
      const snapshot: Record<string, JsonValue> = {};
      for (const key of persistedKeys) {
        const value = state[key];
        if (value !== undefined) {
          snapshot[key] = value as JsonValue;
        }
      }
      const serialized = JSON.stringify(snapshot);
      if (serialized === lastPersistedRef.current) {
        return;
      }
      lastPersistedRef.current = serialized;
      write(snapshot);
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state, persistedKeys]);
  const diagnostics: ExprDiagnostic[] = [];
  const derived = evaluateDerived(
    derivedDefs,
    {
      state,
      sources: src.data,
      status: src.status,
      derived: {},
      event: null,
      row: null,
      org: { id: orgId },
    },
    diagnostics,
  );

  const sendApi = (input: WidgetApiCallInput): Promise<unknown> =>
    orgApiRequest({ ...input, orgId });

  const confirmMutation = async (message: string): Promise<boolean> => {
    if (!requestConfirm) {
      return false;
    }
    return requestConfirm(message);
  };

  const orgApi = async (input: WidgetApiCallInput): Promise<unknown> => {
    const mutating = (input.method ?? 'GET') !== 'GET';
    if (mutating) {
      const message = `Run ${input.method ?? 'POST'} ${input.path}?`;
      if (!(await confirmMutation(message))) {
        // Declining must not look like success to the calling primitive.
        throw new Error('Action cancelled');
      }
    }
    return sendApi(input);
  };

  const setState = (key: string, value: unknown): void => {
    modifiedKeysRef.current.add(key);
    commit({ ...liveRef.current, [key]: value });
  };

  const dispatch = (actions: ActionList, options: ActionDispatchOptions = {}): Promise<void> => {
    const actionDiagnostics: ExprDiagnostic[] = [];
    const orgRoot = studioPath.desk(orgId);
    const effects: ActionEffects = {
      callApi: (request) => sendApi(request),
      refetch: (sourceId) => {
        src.retrySource(sourceId);
      },
      invokeExternal: (sourceId, params) => src.invokeExternal(sourceId, params),
      navigate: (to) => {
        const route = internalOrgRoute(to, orgRoot);
        if (!route.ok) {
          actionDiagnostics.push({ path: 'actions.navigate', message: route.reason });
          return;
        }
        void navigate(route.to);
      },
      notify: (message, level) => {
        toast.add({ title: message, type: level });
      },
      confirm: (request) => confirmMutation(request.message),
      setState,
      getState: () => liveRef.current,
    };
    return runActions(actions, effects, {
      event: options.event,
      row: options.row,
      org: { id: orgId },
      sources: src.data,
      status: src.status,
      derived,
      diagnostics: actionDiagnostics,
    });
  };

  return {
    state,
    setState,
    dispatch,
    orgApi,
    derived,
    sourceStatus: src.status,
    retrySource: (sourceId) => {
      src.retrySource(sourceId);
    },
  };
}
