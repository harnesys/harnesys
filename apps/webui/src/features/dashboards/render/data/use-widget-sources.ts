import type { WidgetSource } from '@harnesys/contracts';
import { useEffect, useRef, useState } from 'react';
import { eventsWatchUrl, watchEventSource } from '@/shared/api/events';
import type { WidgetSourceStatus } from '../engine/expr-eval';
import { evaluateExpr } from '../engine/expr-eval';
import { invokeExternalSource, orgApiRequest } from './source-client';
import { invokeFailureOf, sourceParams } from './source-params';
import {
  errorOf,
  errorsOf,
  queryRoots,
  refreshModeOf,
  resolveQuery,
  sourceSignature,
} from './source-signature';

export interface WidgetSourcesController {
  /** Resolved data per source id (orgApi: raw response; external: response json). */
  data: Record<string, unknown>;
  errors: Record<string, string>;
  /** Per-source fetch state, exposed to item bindings as the `status` root. */
  status: Record<string, WidgetSourceStatus>;
  loading: boolean;
  /** True once every auto-scheduled (non-manual) source has settled. */
  ready: boolean;
  retrySource(sourceId: string): void;
  refetchAll(): void;
  invokeExternal(sourceId: string, params?: unknown): Promise<unknown>;
}

interface UseWidgetSourcesArgs {
  orgId: string;
  dashboardId: string;
  widgetId: string;
  sources: WidgetSource[];
  /** Latest widget state, read when resolving source query, body, and params. */
  getState?: () => Record<string, unknown>;
}

const EVENT_REFRESH_DEBOUNCE_MS = 1000;
const PARAM_REFRESH_DEBOUNCE_MS = 300;

/**
 * Refresh policy per the approved dashboards design:
 * - `manual` fetches only on demand (retry/refetch/actions).
 * - `onMount` fetches once per mount (the default).
 * - `interval` applies to external sources only (server enforces a >=30s floor).
 * - `onEvent` refetches on the declared events/watch topics with a 1s trailing
 *   debounce; the subscription is push, never polling.
 */
function useStableSources(sources: WidgetSource[]): WidgetSource[] {
  const key = JSON.stringify(sources);
  const cached = useRef({ key, sources });
  if (cached.current.key !== key) {
    cached.current = { key, sources };
  }
  return cached.current.sources;
}

export function useWidgetSources(args: UseWidgetSourcesArgs): WidgetSourcesController {
  const { orgId, dashboardId, widgetId, sources, getState } = args;
  const [data, setData] = useState<Record<string, unknown>>({});
  const [status, setStatus] = useState<Record<string, WidgetSourceStatus>>({});
  const [pendingCount, setPendingCount] = useState(0);
  const [ready, setReady] = useState(sources.length === 0);
  const settledRef = useRef(new Set<string>());
  const stableSources = useStableSources(sources);
  const abortRef = useRef(new Map<string, AbortController>());

  const invokeExternal = async (sourceId: string, params?: unknown): Promise<unknown> => {
    const source = sources.find((entry) => entry.id === sourceId);
    if (source?.kind !== 'external') {
      throw new Error(`Unknown external source: ${sourceId}`);
    }
    const result = await invokeExternalSource({
      orgId,
      dashboardId,
      widgetId,
      sourceId,
      params: sourceParams(source, getState?.() ?? {}, params),
    });
    const failure = invokeFailureOf(result);
    if (failure !== null) {
      throw new Error(failure);
    }
    const json = result.json ?? null;
    setData((prev) => ({ ...prev, [sourceId]: json }));
    setStatus((prev) => ({ ...prev, [sourceId]: { loading: false, error: null } }));
    return json;
  };

  const fetchInto = (source: WidgetSource, initial: boolean): void => {
    abortRef.current.get(source.id)?.abort();
    const controller = new AbortController();
    abortRef.current.set(source.id, controller);
    const signal = controller.signal;
    setPendingCount((count) => count + 1);
    setStatus((prev) => ({ ...prev, [source.id]: { loading: true, error: null } }));
    const roots = queryRoots(orgId, getState);
    const request: Promise<unknown> =
      source.kind === 'orgApi'
        ? orgApiRequest({
            orgId,
            path: source.path,
            method: source.method,
            query: resolveQuery(source.query, roots),
            body: source.body === undefined ? undefined : evaluateExpr(source.body, roots),
            signal,
          })
        : invokeExternalSource({
            orgId,
            dashboardId,
            widgetId,
            sourceId: source.id,
            params: sourceParams(source, roots.state),
            signal,
          }).then((result) => {
            const failure = invokeFailureOf(result);
            if (failure !== null) {
              throw new Error(failure);
            }
            return result.json ?? null;
          });
    request
      .then((json) => {
        if (signal.aborted) {
          return;
        }
        setData((prev) => ({ ...prev, [source.id]: json }));
        setStatus((prev) => ({ ...prev, [source.id]: { loading: false, error: null } }));
      })
      .catch((error: unknown) => {
        if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
          return;
        }
        setStatus((prev) => ({
          ...prev,
          [source.id]: { loading: false, error: errorOf(error) },
        }));
      })
      .finally(() => {
        setPendingCount((count) => Math.max(0, count - 1));
        if (initial) {
          // The first fetch of a source settles readiness even when a later
          // param-driven refetch superseded it: that refetch also completed.
          settledRef.current.add(source.id);
          const scheduled = stableSources.filter((entry) => refreshModeOf(entry) !== 'manual');
          if (scheduled.every((entry) => settledRef.current.has(entry.id))) {
            setReady(true);
          }
        }
      });
  };

  // Keep a stable handle so mount/interval/event effects never re-run because
  // of render-local closures (React Compiler does not memoize plain functions).
  const fetchRef = useRef<(source: WidgetSource, initial: boolean) => void>(() => {});
  useEffect(() => {
    fetchRef.current = fetchInto;
  });

  useEffect(() => {
    settledRef.current = new Set<string>();
    const definitions = stableSources;
    const scheduled = definitions.filter((s) => refreshModeOf(s) !== 'manual');
    setReady(scheduled.length === 0);
    for (const source of scheduled) {
      fetchRef.current(source, true);
    }
    // One timer per interval source ticks its own declared period.
    const timers: number[] = [];
    for (const source of definitions) {
      if (
        source.kind === 'external' &&
        source.refresh?.mode === 'interval' &&
        typeof source.refresh.intervalSeconds === 'number'
      ) {
        timers.push(
          window.setInterval(() => {
            fetchRef.current(source, false);
          }, source.refresh.intervalSeconds * 1000),
        );
      }
    }
    return () => {
      for (const timer of timers) {
        window.clearInterval(timer);
      }
      for (const controller of abortRef.current.values()) {
        controller.abort();
      }
      abortRef.current.clear();
    };
  }, [stableSources]);

  // Param-driven refresh: re-fetch only the sources whose resolved signature
  // changed (a select edit must not refetch unrelated sources).
  const signatureKey = JSON.stringify(
    stableSources.map((source) => ({
      id: source.id,
      mode: refreshModeOf(source),
      signature:
        refreshModeOf(source) === 'manual'
          ? null
          : sourceSignature(source, queryRoots(orgId, getState)),
    })),
  );
  const signaturesRef = useRef<string | null>(null);
  useEffect(() => {
    if (signaturesRef.current === null) {
      signaturesRef.current = signatureKey;
      return;
    }
    if (signaturesRef.current === signatureKey) {
      return;
    }
    const previous = JSON.parse(signaturesRef.current) as Array<{
      id: string;
      mode: string;
      signature: string | null;
    }>;
    signaturesRef.current = signatureKey;
    const current = JSON.parse(signatureKey) as Array<{
      id: string;
      mode: string;
      signature: string | null;
    }>;
    const changedIds = new Set(
      current
        .filter((entry) => {
          if (entry.mode === 'manual') {
            return false;
          }
          const before = previous.find((candidate) => candidate.id === entry.id);
          return before === undefined || before.signature !== entry.signature;
        })
        .map((entry) => entry.id),
    );
    if (changedIds.size === 0) {
      return;
    }
    const timer = setTimeout(() => {
      for (const source of stableSources) {
        if (changedIds.has(source.id)) {
          fetchRef.current(source, false);
        }
      }
    }, PARAM_REFRESH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [signatureKey, stableSources]);

  useEffect(() => {
    const unsubscribes: Array<() => void> = [];
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    for (const source of stableSources) {
      if (source.refresh?.mode !== 'onEvent') {
        continue;
      }
      for (const topic of source.refresh.topics ?? []) {
        unsubscribes.push(
          watchEventSource(
            eventsWatchUrl,
            topic,
            () => {
              const pending = timers.get(source.id);
              if (pending !== undefined) {
                clearTimeout(pending);
              }
              timers.set(
                source.id,
                setTimeout(() => {
                  timers.delete(source.id);
                  fetchRef.current(source, false);
                }, EVENT_REFRESH_DEBOUNCE_MS),
              );
            },
            { orgId },
          ),
        );
      }
    }
    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
    };
  }, [stableSources, orgId]);

  const retrySource = (sourceId: string): void => {
    const source = sources.find((s) => s.id === sourceId);
    if (source) {
      fetchRef.current(source, false);
    }
  };

  const refetchAll = (): void => {
    for (const source of sources) {
      fetchRef.current(source, false);
    }
  };

  return {
    data,
    errors: errorsOf(status),
    status,
    loading: pendingCount > 0,
    ready,
    retrySource,
    refetchAll,
    invokeExternal,
  };
}
