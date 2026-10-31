import { describe, expect, test } from 'bun:test';
import {
  isValidRouteKey,
  parseRouteDecision,
  routeInstruction,
  routeOutputSchema,
} from './graph-route.ts';

const ROUTES = [
  { key: 'fast', label: 'Fast', description: 'simple requests' },
  { key: 'smart', label: 'Smart' },
];

describe('isValidRouteKey', () => {
  test('accepts letters, digits, dash, underscore', () => {
    expect(isValidRouteKey('fast')).toBe(true);
    expect(isValidRouteKey('route_2-a')).toBe(true);
  });
  test('rejects empty, digits-first, spaces, dots', () => {
    expect(isValidRouteKey('')).toBe(false);
    expect(isValidRouteKey('2fast')).toBe(false);
    expect(isValidRouteKey('has space')).toBe(false);
    expect(isValidRouteKey('a.b')).toBe(false);
    expect(isValidRouteKey(undefined)).toBe(false);
  });
});

describe('routeOutputSchema', () => {
  test('constrains route to configured keys', () => {
    const schema = routeOutputSchema(ROUTES);
    expect(schema.required).toEqual(['route']);
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.route?.enum).toEqual(['fast', 'smart']);
  });
});

describe('parseRouteDecision', () => {
  test('parses plain JSON with confidence', () => {
    expect(parseRouteDecision('{"route":"smart","confidence":0.9}', ROUTES)).toEqual({
      key: 'smart',
      confidence: 0.9,
    });
  });
  test('parses fenced JSON', () => {
    expect(parseRouteDecision('```json\n{"route":"fast"}\n```', ROUTES)).toEqual({ key: 'fast' });
  });
  test('extracts JSON from surrounding prose', () => {
    expect(
      parseRouteDecision('The answer is {"route":"fast","confidence":0.5} thanks', ROUTES),
    ).toEqual({
      key: 'fast',
      confidence: 0.5,
    });
  });
  test('rejects unknown route keys and malformed JSON', () => {
    expect(parseRouteDecision('{"route":"nope"}', ROUTES)).toBeUndefined();
    expect(parseRouteDecision('not json', ROUTES)).toBeUndefined();
    expect(parseRouteDecision('', ROUTES)).toBeUndefined();
  });
  test('rejects confidence below minConfidence', () => {
    expect(parseRouteDecision('{"route":"fast","confidence":0.3}', ROUTES, 0.5)).toBeUndefined();
    expect(parseRouteDecision('{"route":"fast","confidence":0.6}', ROUTES, 0.5)).toEqual({
      key: 'fast',
      confidence: 0.6,
    });
  });
  test('missing confidence passes minConfidence gate (falls to default edge)', () => {
    expect(parseRouteDecision('{"route":"smart"}', ROUTES, 0.9)).toEqual({ key: 'smart' });
  });
});

describe('routeInstruction', () => {
  test('lists routes and demands JSON-only reply', () => {
    const instruction = routeInstruction(
      { type: 'control:route', routes: ROUTES },
      { input: null, state: {}, output: null, resume: null },
    );
    expect(instruction).toContain('- fast (Fast) — simple requests');
    expect(instruction).toContain('- smart (Smart)');
    expect(instruction).toContain('{"route": "<key>", "confidence": <0..1>}');
  });
  test('substitutes {$expr} templates from slots', () => {
    const instruction = routeInstruction(
      { type: 'control:route', prompt: 'State: {$input.locale}', routes: ROUTES },
      { input: { locale: 'de' }, state: {}, output: null, resume: null },
    );
    expect(instruction).toContain('State: "de"');
  });
});
