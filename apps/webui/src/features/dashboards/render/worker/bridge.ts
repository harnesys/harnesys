import { WidgetNodeSchema } from '@harnesys/contracts';
import { invokeExternalSource, orgApiRequest } from '../data/source-client';
import type {
  TransformRunner,
  TransformRunResult,
  TransformWorkerInbound,
  TransformWorkerOutbound,
} from '../types';

const RUN_TIMEOUT_MS = 15_000;

/**
 * Main-thread side of the transform worker: spawns one worker per widget and
 * serves its RPCs. Auth never enters the worker: `bridge.fetchOurApi` runs here
 * through `orgApiRequest` (org guard + session headers), `bridge.fetchExternal`
 * through the invoke endpoint (the single egress audit point). Result nodes are
 * re-validated with the contracts schema before they ever reach React.
 */
export function createTransformRunner(args: {
  orgId: string;
  dashboardId: string;
  widgetId: string;
}): TransformRunner {
  const worker = new Worker(new URL('./transform.worker.ts', import.meta.url), {
    type: 'module',
  });
  let nextRunId = 1;
  const pending = new Map<
    number,
    { resolve: (result: TransformRunResult) => void; timer: number }
  >();

  function settleRpc(id: number, work: Promise<unknown>): void {
    work
      .then((value) => {
        const reply: TransformWorkerInbound = {
          kind: 'rpc-result',
          id,
          ok: true,
          value: value ?? null,
        };
        worker.postMessage(reply);
      })
      .catch((error: unknown) => {
        const reply: TransformWorkerInbound = {
          kind: 'rpc-result',
          id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
        worker.postMessage(reply);
      });
  }

  worker.onmessage = (event: MessageEvent<TransformWorkerOutbound>): void => {
    const msg = event.data;
    if (msg.kind === 'rpc') {
      settleRpc(
        msg.id,
        invokeExternalSource({
          orgId: args.orgId,
          dashboardId: args.dashboardId,
          widgetId: args.widgetId,
          sourceId: msg.sourceId,
        }).then((result) => {
          if (result.ok && !result.error) {
            return result.json ?? null;
          }
          throw new Error(
            result.error ??
              `External fetch failed${result.status ? ` (HTTP ${result.status})` : ''}`,
          );
        }),
      );
      return;
    }
    if (msg.kind === 'rpc-our-api') {
      settleRpc(
        msg.id,
        orgApiRequest({
          orgId: args.orgId,
          path: msg.path,
          method: msg.init?.method,
          query: msg.init?.query,
          body: msg.init?.body,
        }),
      );
      return;
    }
    if (msg.kind !== 'run-result') {
      return;
    }
    const entry = pending.get(msg.id);
    if (!entry) {
      return;
    }
    pending.delete(msg.id);
    window.clearTimeout(entry.timer);
    if (!msg.ok) {
      entry.resolve({ ok: false, message: msg.message, stack: msg.stack });
      return;
    }
    if (msg.resultKind === 'node') {
      const parsed = WidgetNodeSchema.safeParse(msg.node);
      if (!parsed.success) {
        entry.resolve({
          ok: false,
          message: `Transform node failed validation: ${parsed.error.message}`,
        });
        return;
      }
      entry.resolve({ ok: true, resultKind: 'node', node: parsed.data });
      return;
    }
    entry.resolve({ ok: true, resultKind: 'data', data: msg.data });
  };

  return {
    run(input) {
      const id = nextRunId++;
      return new Promise<TransformRunResult>((resolve) => {
        const timer = window.setTimeout(() => {
          if (pending.delete(id)) {
            resolve({ ok: false, message: `Transform timed out after ${RUN_TIMEOUT_MS / 1000}s` });
          }
        }, RUN_TIMEOUT_MS);
        pending.set(id, { resolve, timer });
        const message: TransformWorkerInbound = {
          kind: 'run',
          id,
          code: input.code,
          sources: input.sources,
          config: input.config,
        };
        worker.postMessage(message);
      });
    },
    dispose() {
      for (const entry of pending.values()) {
        window.clearTimeout(entry.timer);
        entry.resolve({ ok: false, message: 'Transform runner was disposed' });
      }
      pending.clear();
      worker.terminate();
    },
  };
}
