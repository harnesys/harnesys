import type { ExternalSource, WidgetParams, WidgetParamValue } from '@harnesys/contracts';
import type { WidgetInvokeResult } from './source-client';

const PARAM_PLACEHOLDER_PATTERN = /\{\{param:([A-Za-z][A-Za-z0-9_-]{0,63})\}\}/g;

function sourceParamNames(source: ExternalSource): string[] {
  const names = new Set<string>();
  const collect = (value: unknown): void => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(PARAM_PLACEHOLDER_PATTERN)) {
        const name = match[1];
        if (name !== undefined) {
          names.add(name);
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        collect(entry);
      }
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const entry of Object.values(value)) {
        collect(entry);
      }
    }
  };
  collect(source.query ?? {});
  collect(source.body ?? {});
  return [...names];
}

function scalarParam(value: unknown): WidgetParamValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function paramRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function sourceParams(
  source: ExternalSource,
  state: Record<string, unknown>,
  overrides?: unknown,
): WidgetParams | undefined {
  const names = sourceParamNames(source);
  if (names.length === 0) {
    return undefined;
  }
  const explicit = paramRecord(overrides);
  const params: WidgetParams = {};
  for (const name of names) {
    const value = scalarParam(name in explicit ? explicit[name] : state[name]);
    if (value !== undefined) {
      params[name] = value;
    }
  }
  return Object.keys(params).length > 0 ? params : undefined;
}

export function invokeFailureOf(result: WidgetInvokeResult): string | null {
  if (result.ok && result.error === undefined) {
    return null;
  }
  if (result.error === 'param_missing') {
    return result.param === undefined
      ? 'External source parameter is not set in widget state'
      : `External source parameter "${result.param}" is not set in widget state`;
  }
  if (result.error !== undefined) {
    return result.error;
  }
  return `External fetch failed${result.status ? ` (HTTP ${result.status})` : ''}`;
}
