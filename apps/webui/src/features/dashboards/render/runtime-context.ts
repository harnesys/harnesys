import type { ActionList } from '@harnesys/contracts';
import { createContext } from 'react';
import type { WidgetApiCallInput } from './data/source-client';
import type { ActionDispatchOptions } from './data/use-widget-runtime';

/**
 * Runtime surface for primitives inside a widget. Composite widgets share one
 * reactive scope: `state` (local, per widget instance) plus `sources` data.
 * Events dispatch declarative actions through `dispatch`; `orgApi` /
 * `invokeExternal` remain for the legacy `actions` primitive.
 */
export interface WidgetActionRuntime {
  orgApi(input: WidgetApiCallInput): Promise<unknown>;
  invokeExternal(sourceId: string): Promise<unknown>;
  state: Record<string, unknown>;
  setState(key: string, value: unknown): void;
  dispatch(actions: ActionList, options?: ActionDispatchOptions): Promise<void>;
}

export const WidgetRuntimeContext = createContext<WidgetActionRuntime | null>(null);
