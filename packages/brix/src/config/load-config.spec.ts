import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { deepMerge, parseConfigYaml, substituteEnvVars } from './load-config';

describe('substituteEnvVars', () => {
  test('replaces known vars', () => {
    expect(substituteEnvVars('port: ${SERVER_PORT}', { SERVER_PORT: '47474' })).toBe('port: 47474');
  });

  test('env value wins over default', () => {
    expect(substituteEnvVars('${APP_NAME:-Harnesys}', { APP_NAME: 'Custom' })).toBe('Custom');
  });

  test('default applies when var is missing', () => {
    expect(substituteEnvVars('${APP_NAME:-Harnesys}', {})).toBe('Harnesys');
  });

  test('empty default applies when var is missing', () => {
    expect(substituteEnvVars('[${OPTIONAL:-}]', {})).toBe('[]');
  });

  test('missing var without default throws naming it', () => {
    expect(() => substituteEnvVars('${JWT_SECRET}', {})).toThrow('JWT_SECRET');
  });

  test('escapes newlines so quoted slots survive parsing', () => {
    expect(substituteEnvVars('key: "${V}"', { V: 'a\nb' })).toBe('key: "a\\nb"');
  });

  test('escapes backslashes in env values', () => {
    expect(substituteEnvVars('key: "${V}"', { V: 'a\\b' })).toBe('key: "a\\\\b"');
  });
});

describe('parseConfigYaml', () => {
  test('parses yaml after env substitution', () => {
    expect(parseConfigYaml('server:\n  port: ${SERVER_PORT:-47474}', {})).toEqual({
      server: { port: 47474 },
    });
  });

  test('multiline env value round-trips through a quoted slot', () => {
    expect(parseConfigYaml('key: "${V}"', { V: 'a\nb' })).toEqual({ key: 'a\nb' });
  });

  test('missing var without default throws naming it', () => {
    expect(() => parseConfigYaml('key: ${JWT_SECRET}', {})).toThrow('JWT_SECRET');
  });
});

describe('deepMerge', () => {
  test('merges nested objects and replaces arrays wholesale', () => {
    const base = { server: { host: 'x', port: 1 }, list: [1, 2] };
    const overlay = { server: { port: 2 }, list: [3] };
    expect(deepMerge(base, overlay)).toEqual({ server: { host: 'x', port: 2 }, list: [3] });
  });

  test('does not mutate inputs', () => {
    const base = { nested: { value: 1 } };
    deepMerge(base, { nested: { value: 2 } });
    expect(base).toEqual({ nested: { value: 1 } });
  });
});
