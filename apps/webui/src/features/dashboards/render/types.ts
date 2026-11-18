import type { WidgetNode } from '@harnesys/contracts';

export interface BridgeFetchInit {
  method?: string;
  query?: Record<string, string>;
  body?: unknown;
}

/** Bridge surface handed to user transform code inside the worker. */
export interface TransformBridge {
  fetchOurApi(path: string, init?: BridgeFetchInit): Promise<unknown>;
  fetchExternal(sourceId: string): Promise<unknown>;
}

export type TransformWorkerInbound =
  | {
      kind: 'run';
      id: number;
      code: string;
      sources: Record<string, unknown>;
      config: Record<string, unknown>;
    }
  | { kind: 'rpc-result'; id: number; ok: boolean; value?: unknown; error?: string };

export type TransformWorkerOutbound =
  | { kind: 'run-result'; id: number; ok: true; resultKind: 'node'; node: WidgetNode }
  | { kind: 'run-result'; id: number; ok: true; resultKind: 'data'; data: unknown }
  | { kind: 'run-result'; id: number; ok: false; message: string; stack?: string }
  | { kind: 'rpc'; id: number; sourceId: string }
  | { kind: 'rpc-our-api'; id: number; path: string; init?: BridgeFetchInit };

export type TransformRunResult =
  | { ok: true; resultKind: 'node'; node: WidgetNode }
  | { ok: true; resultKind: 'data'; data: unknown }
  | { ok: false; message: string; stack?: string };

export interface TransformRunner {
  run(input: {
    code: string;
    sources: Record<string, unknown>;
    config: Record<string, unknown>;
  }): Promise<TransformRunResult>;
  dispose(): void;
}
