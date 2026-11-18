import type { WidgetParams } from '@harnesys/contracts';

export interface ParamRef {
  name: string;
  token: string;
}

/** Query and body of a source with its expressions reduced to literal JSON. */
export interface SourceParamValues {
  query?: Record<string, string>;
  body?: unknown;
}

export type ParamSubstitution<T> = { ok: true; value: T } | { ok: false; param: string };

const PARAM_NAME = '[A-Za-z][A-Za-z0-9_-]{0,63}';
const PARAM_REF_SOURCE = `\\{\\{param:(${PARAM_NAME})\\}\\}`;
const PARAM_REF_PATTERN = new RegExp(PARAM_REF_SOURCE, 'g');
const PARAM_REF_PROBE = new RegExp(PARAM_REF_SOURCE);
const WHOLE_PARAM_REF_PATTERN = new RegExp(`^${PARAM_REF_SOURCE}$`);

export function collectParamRefs(value: string): ParamRef[] {
  const refs: ParamRef[] = [];
  for (const match of value.matchAll(PARAM_REF_PATTERN)) {
    const name = match[1];
    if (name !== undefined) {
      refs.push({ name, token: match[0] });
    }
  }
  return refs;
}

export function hasParamRef(value: string): boolean {
  return PARAM_REF_PROBE.test(value);
}

/** True when any string leaf of a JSON or Expr value carries a param placeholder. */
export function hasParamRefDeep(value: unknown): boolean {
  if (typeof value === 'string') {
    return hasParamRef(value);
  }
  if (Array.isArray(value)) {
    return value.some(hasParamRefDeep);
  }
  if (isPlainObject(value)) {
    return Object.values(value).some(hasParamRefDeep);
  }
  return false;
}

/** Text interpolation: every placeholder becomes `String(value)`. */
export function substituteParamText(
  value: string,
  params: WidgetParams,
): ParamSubstitution<string> {
  const refs = collectParamRefs(value);
  if (refs.length === 0) {
    return { ok: true, value };
  }
  let out = value;
  for (const ref of refs) {
    const resolved = params[ref.name];
    if (resolved === undefined) {
      return { ok: false, param: ref.name };
    }
    out = out.replaceAll(ref.token, String(resolved));
  }
  return { ok: true, value: out };
}

/**
 * Substitutes placeholders in string leaves of a JSON body. A string that is
 * exactly one placeholder keeps the JSON type of the param; anything else is
 * interpolated as text.
 */
export function substituteParamBody(
  value: unknown,
  params: WidgetParams,
): ParamSubstitution<unknown> {
  if (typeof value === 'string') {
    return substituteParamString(value, params);
  }
  if (Array.isArray(value)) {
    return substituteParamArray(value, params);
  }
  if (isPlainObject(value)) {
    return substituteParamRecord(value, params);
  }
  return { ok: true, value };
}

function substituteParamString(value: string, params: WidgetParams): ParamSubstitution<unknown> {
  const whole = WHOLE_PARAM_REF_PATTERN.exec(value);
  const name = whole?.[1];
  if (name === undefined) {
    return substituteParamText(value, params);
  }
  const resolved = params[name];
  if (resolved === undefined) {
    return { ok: false, param: name };
  }
  return { ok: true, value: resolved };
}

function substituteParamArray(value: unknown[], params: WidgetParams): ParamSubstitution<unknown> {
  const items: unknown[] = [];
  for (const entry of value) {
    const substituted = substituteParamBody(entry, params);
    if (!substituted.ok) {
      return substituted;
    }
    items.push(substituted.value);
  }
  return { ok: true, value: items };
}

function substituteParamRecord(
  value: Record<string, unknown>,
  params: WidgetParams,
): ParamSubstitution<unknown> {
  const entries: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const substituted = substituteParamBody(entry, params);
    if (!substituted.ok) {
      return substituted;
    }
    entries[key] = substituted.value;
  }
  return { ok: true, value: entries };
}

export function substituteParams(
  values: SourceParamValues,
  params: WidgetParams | undefined,
): ParamSubstitution<SourceParamValues> {
  const resolved = params ?? {};
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(values.query ?? {})) {
    const substituted = substituteParamText(value, resolved);
    if (!substituted.ok) {
      return substituted;
    }
    query[key] = substituted.value;
  }
  let body: unknown;
  if (values.body !== undefined) {
    const substituted = substituteParamBody(values.body, resolved);
    if (!substituted.ok) {
      return substituted;
    }
    body = substituted.value;
  }
  return {
    ok: true,
    value: {
      ...(values.query === undefined ? {} : { query }),
      ...(values.body === undefined ? {} : { body }),
    },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
